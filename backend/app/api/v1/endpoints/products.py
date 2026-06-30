"""
AgroRaiz - Products Endpoints
Catálogo e gestão de estoque.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_attendant
from app.repositories.product_repository import ProductRepository

router = APIRouter()


class ProductCreate(BaseModel):
    nome: str = Field(..., min_length=1)
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    marca: Optional[str] = None
    sku: Optional[str] = None
    codigo_barras: Optional[str] = None
    preco: float = Field(..., gt=0)
    preco_promocional: Optional[float] = None
    custo_medio: float = 0.0
    unidade: str = "un"
    estoque: int = 0
    estoque_minimo: int = 5
    estoque_maximo: int = 100
    localizacao: Optional[str] = None
    fornecedor: Optional[str] = None
    imagens: List[str] = []
    tags: List[str] = []
    ativo: bool = True
    destaque: bool = False


class ProductUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    marca: Optional[str] = None
    preco: Optional[float] = None
    preco_promocional: Optional[float] = None
    custo_medio: Optional[float] = None
    estoque: Optional[int] = None
    estoque_minimo: Optional[int] = None
    estoque_maximo: Optional[int] = None
    destaque: Optional[bool] = None
    ativo: Optional[bool] = None
    tags: Optional[List[str]] = None
    imagens: Optional[List[str]] = None


class StockAdjustRequest(BaseModel):
    quantity: int = Field(..., ge=1)
    operation: str = Field(..., pattern="^(adicionar|remover)$")
    motivo: Optional[str] = None


@router.get("")
async def list_products(
    busca: str = Query(""),
    categoria: str = Query(None),
    ativo: bool = Query(None),
    destaque: bool = Query(None),
    estoque_baixo: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = ProductRepository(db)
    offset = (page - 1) * page_size
    products, total = await repo.search(
        store_id=current_user.store_id,
        busca=busca,
        categoria=categoria,
        ativo=ativo,
        destaque=destaque,
        estoque_baixo=estoque_baixo,
        offset=offset,
        limit=page_size,
    )
    return {
        "products": [_serialize(p) for p in products],
        "total": total,
        "page": page,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/low-stock")
async def get_low_stock(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = ProductRepository(db)
    products = await repo.get_low_stock(current_user.store_id)
    return {
        "products": [_serialize(p) for p in products],
        "total": len(products),
    }


@router.get("/categories/stats")
async def get_category_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = ProductRepository(db)
    return await repo.get_category_stats(current_user.store_id)


@router.get("/{product_id}")
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = ProductRepository(db)
    product = await repo.get(product_id, current_user.store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    return _serialize(product)


@router.post("", status_code=201)
async def create_product(
    body: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = ProductRepository(db)
    product = await repo.create(
        store_id=current_user.store_id,
        **body.model_dump(),
    )
    return _serialize(product)


@router.patch("/{product_id}")
async def update_product(
    product_id: UUID,
    body: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = ProductRepository(db)
    product = await repo.get(product_id, current_user.store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    product = await repo.update(product, **updates)
    return _serialize(product)


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = ProductRepository(db)
    product = await repo.get(product_id, current_user.store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    # Soft delete
    await repo.update(product, ativo=False)


@router.post("/{product_id}/stock")
async def adjust_stock(
    product_id: UUID,
    body: StockAdjustRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_attendant),
):
    repo = ProductRepository(db)
    product = await repo.get(product_id, current_user.store_id)
    if not product:
        raise HTTPException(404, "Produto não encontrado")

    # Capture values BEFORE commit (session expires attributes after commit)
    product_nome = product.nome
    product_estoque_minimo = product.estoque_minimo
    delta = body.quantity if body.operation == "adicionar" else -body.quantity
    new_stock = max(0, product.estoque + delta)

    await repo.adjust_stock(product_id, body.quantity, body.operation)
    await db.commit()

    # Broadcast alert if below minimum (after commit, use captured values)
    if new_stock <= product_estoque_minimo:
        try:
            from app.core.websocket import ws_manager
            await ws_manager.broadcast(
                str(current_user.store_id),
                "stock_alert",
                {"product_id": str(product_id), "nome": product_nome, "estoque": new_stock},
            )
        except Exception:
            pass  # Non-critical: don't fail the request if WS broadcast fails

    return {"status": "updated", "new_stock": new_stock, "product": product_nome}


def _serialize(p) -> dict:
    return {
        "id": str(p.id),
        "nome": p.nome,
        "descricao": p.descricao,
        "categoria": p.categoria,
        "subcategoria": p.subcategoria,
        "marca": p.marca,
        "sku": p.sku,
        "codigo_barras": p.codigo_barras,
        "preco": p.preco,
        "preco_promocional": p.preco_promocional,
        "custo_medio": p.custo_medio,
        "unidade": p.unidade,
        "estoque": p.estoque,
        "estoque_minimo": p.estoque_minimo,
        "estoque_maximo": p.estoque_maximo,
        "localizacao": p.localizacao,
        "fornecedor": p.fornecedor,
        "imagens": p.imagens or [],
        "tags": p.tags or [],
        "ativo": p.ativo,
        "destaque": p.destaque,
        "estoque_status": _stock_status(p),
        "margem": round(((p.preco - p.custo_medio) / p.preco * 100) if p.preco and p.custo_medio else 0, 1),
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _stock_status(p) -> str:
    if p.estoque == 0:
        return "sem_estoque"
    if p.estoque <= p.estoque_minimo:
        return "critico"
    if p.estoque <= p.estoque_minimo * 2:
        return "baixo"
    return "normal"

