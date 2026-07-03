"""
AgroRaiz - Product Repository
Inventory queries: catalog search, low stock, category analytics.
"""
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Product, ProductCategory
from app.repositories.base import BaseRepository


class ProductRepository(BaseRepository[Product]):

    def __init__(self, db: AsyncSession):
        super().__init__(Product, db)

    async def search(
        self,
        store_id: UUID,
        busca: str = "",
        categoria: str = None,
        ativo: bool = None,
        destaque: bool = None,
        estoque_baixo: bool = False,
        promocao: bool = False,
        estoque_status: str = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[List[Product], int]:
        query = select(Product).where(Product.store_id == store_id)
        count_query = select(func.count()).select_from(Product).where(
            Product.store_id == store_id
        )

        if busca:
            f = or_(
                Product.nome.ilike(f"%{busca}%"),
                Product.sku.ilike(f"%{busca}%"),
                Product.marca.ilike(f"%{busca}%"),
                Product.codigo_barras.ilike(f"%{busca}%"),
            )
            query = query.where(f)
            count_query = count_query.where(f)

        if categoria:
            query = query.where(Product.categoria == categoria)
            count_query = count_query.where(Product.categoria == categoria)

        if ativo is not None:
            query = query.where(Product.ativo == ativo)
            count_query = count_query.where(Product.ativo == ativo)

        if destaque is not None:
            query = query.where(Product.destaque == destaque)

        if estoque_baixo:
            f = Product.estoque <= Product.estoque_minimo
            query = query.where(f)
            count_query = count_query.where(f)

        if promocao:
            f = and_(
                Product.preco_promocional.isnot(None),
                Product.preco_promocional > 0,
            )
            query = query.where(f)
            count_query = count_query.where(f)

        if estoque_status:
            f = self._estoque_status_filter(estoque_status)
            if f is not None:
                query = query.where(f)
                count_query = count_query.where(f)

        total = await self.db.scalar(count_query)
        result = await self.db.execute(
            query.order_by(Product.nome).offset(offset).limit(limit)
        )
        return result.scalars().all(), total or 0

    async def search_by_keyword(
        self, keyword: str, store_id: UUID, limit: int = 5
    ) -> List[Product]:
        """RAG-style: find products relevant to a keyword for AI context."""
        result = await self.db.execute(
            select(Product)
            .where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    or_(
                        Product.nome.ilike(f"%{keyword}%"),
                        Product.descricao.ilike(f"%{keyword}%"),
                        Product.categoria.ilike(f"%{keyword}%"),
                        Product.tags.cast(str).ilike(f"%{keyword}%"),
                    ),
                )
            )
            .order_by(Product.destaque.desc(), Product.estoque.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def get_low_stock(self, store_id: UUID) -> List[Product]:
        result = await self.db.execute(
            select(Product).where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    Product.estoque <= Product.estoque_minimo,
                )
            ).order_by(Product.estoque)
        )
        return result.scalars().all()

    async def get_by_sku(self, sku: str, store_id: UUID) -> Optional[Product]:
        result = await self.db.execute(
            select(Product).where(
                Product.sku == sku,
                Product.store_id == store_id,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _estoque_status_filter(status: str):
        if status == "sem_estoque":
            return Product.estoque == 0
        if status == "critico":
            return and_(Product.estoque > 0, Product.estoque <= Product.estoque_minimo)
        if status == "baixo":
            return and_(
                Product.estoque > Product.estoque_minimo,
                Product.estoque <= Product.estoque_minimo * 2,
            )
        if status == "normal":
            return Product.estoque > Product.estoque_minimo * 2
        return None

    async def adjust_stock(
        self, product_id: UUID, quantity: int, operation: str
    ) -> int:
        """operation: 'adicionar' | 'remover' | 'corrigir'. Returns new stock."""
        from sqlalchemy import update

        product = await self.get_by_id(product_id)
        if not product:
            return 0

        if operation == "corrigir":
            new_stock = max(0, quantity)
        else:
            delta = quantity if operation == "adicionar" else -quantity
            new_stock = max(0, product.estoque + delta)

        await self.db.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(estoque=new_stock)
        )
        return new_stock

    async def get_inventory_summary(self, store_id: UUID) -> dict:
        total = await self.count(store_id)
        ativos = await self.count(store_id, ativo=True)
        inativos = total - ativos

        zerados = await self.db.scalar(
            select(func.count()).select_from(Product).where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    Product.estoque == 0,
                )
            )
        ) or 0

        abaixo_minimo = await self.db.scalar(
            select(func.count()).select_from(Product).where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    Product.estoque > 0,
                    Product.estoque <= Product.estoque_minimo,
                )
            )
        ) or 0

        promocao = await self.db.scalar(
            select(func.count()).select_from(Product).where(
                and_(
                    Product.store_id == store_id,
                    Product.ativo == True,
                    Product.preco_promocional.isnot(None),
                    Product.preco_promocional > 0,
                )
            )
        ) or 0

        return {
            "total": total,
            "ativos": ativos,
            "inativos": inativos,
            "zerados": zerados,
            "abaixo_minimo": abaixo_minimo,
            "promocao": promocao,
        }

    async def get_category_stats(self, store_id: UUID) -> List[dict]:
        result = await self.db.execute(
            select(
                Product.categoria,
                func.count(Product.id).label("total"),
                func.sum(Product.estoque).label("estoque_total"),
                func.avg(Product.preco).label("preco_medio"),
            )
            .where(
                and_(Product.store_id == store_id, Product.ativo == True)
            )
            .group_by(Product.categoria)
            .order_by(func.count(Product.id).desc())
        )
        return [
            {
                "categoria": row.categoria,
                "total": row.total,
                "estoque_total": row.estoque_total,
                "preco_medio": round(row.preco_medio or 0, 2),
            }
            for row in result
        ]
