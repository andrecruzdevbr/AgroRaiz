"""
Resolve product names to catalog entries with ambiguity handling.
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.product_repository import ProductRepository


def serialize_product_brief(p) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "nome": p.nome,
        "categoria": p.categoria,
        "marca": p.marca,
        "preco": p.preco,
        "preco_promocional": p.preco_promocional,
        "estoque": p.estoque,
        "estoque_minimo": p.estoque_minimo,
        "unidade": p.unidade,
        "ativo": p.ativo,
    }


async def resolve_products(
    db: AsyncSession,
    store_id: UUID,
    query: str,
    *,
    limit: int = 8,
    active_only: bool = True,
) -> tuple[Optional[dict], list[dict], str]:
    """
    Returns (single_match, candidates, status).
    status: exact | single | multiple | none
    """
    q = (query or "").strip()
    if not q:
        return None, [], "none"

    repo = ProductRepository(db)
    products, total = await repo.search(
        store_id=store_id,
        busca=q,
        ativo=True if active_only else None,
        limit=limit,
    )

    if not products:
        return None, [], "none"

    briefs = [serialize_product_brief(p) for p in products]

    # Exact name match
    ql = q.lower()
    exact = [b for b in briefs if b["nome"].lower() == ql]
    if len(exact) == 1:
        return exact[0], briefs, "exact"

    if len(briefs) == 1:
        return briefs[0], briefs, "single"

    return None, briefs, "multiple"


async def get_product_by_id(
    db: AsyncSession, store_id: UUID, product_id: UUID
):
    repo = ProductRepository(db)
    return await repo.get(product_id, store_id)
