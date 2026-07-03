"""
AgroRaiz - Product Category Repository
"""
from __future__ import annotations

import re
import unicodedata
from typing import List, Optional
from uuid import UUID

from sqlalchemy import func, select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Product, ProductCategory
from app.repositories.base import BaseRepository


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name.strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s-]+", "_", s)
    return s[:100] or "categoria"


class CategoryRepository(BaseRepository[ProductCategory]):

    def __init__(self, db: AsyncSession):
        super().__init__(ProductCategory, db)

    async def list_for_store(
        self,
        store_id: UUID,
        include_inactive: bool = False,
    ) -> List[ProductCategory]:
        query = select(ProductCategory).where(ProductCategory.store_id == store_id)
        if not include_inactive:
            query = query.where(ProductCategory.active == True)
        result = await self.db.execute(query.order_by(ProductCategory.name))
        return result.scalars().all()

    async def get_by_slug(self, store_id: UUID, slug: str) -> Optional[ProductCategory]:
        result = await self.db.execute(
            select(ProductCategory).where(
                ProductCategory.store_id == store_id,
                ProductCategory.slug == slug,
            )
        )
        return result.scalar_one_or_none()

    async def count_products(self, store_id: UUID, slug: str) -> int:
        result = await self.db.scalar(
            select(func.count(Product.id)).where(
                and_(
                    Product.store_id == store_id,
                    or_(
                        Product.categoria == slug,
                        Product.category_id.in_(
                            select(ProductCategory.id).where(
                                ProductCategory.store_id == store_id,
                                ProductCategory.slug == slug,
                            )
                        ),
                    ),
                )
            )
        )
        return result or 0

    async def product_counts_by_slug(self, store_id: UUID) -> dict[str, int]:
        result = await self.db.execute(
            select(Product.categoria, func.count(Product.id))
            .where(Product.store_id == store_id)
            .group_by(Product.categoria)
        )
        return {row[0]: row[1] for row in result if row[0]}

    async def distinct_product_slugs(self, store_id: UUID) -> list[str]:
        result = await self.db.execute(
            select(Product.categoria)
            .where(
                and_(
                    Product.store_id == store_id,
                    Product.categoria.isnot(None),
                    Product.categoria != "",
                )
            )
            .distinct()
        )
        return [row[0] for row in result]
