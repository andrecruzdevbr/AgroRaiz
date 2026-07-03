"""
AgroRaiz - Product Category Service
Bootstrap from seeded products + CRUD helpers.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ProductCategory
from app.repositories.category_repository import CategoryRepository, slugify
from app.services.store_profile_service import CATEGORY_LABELS


async def ensure_store_categories(db: AsyncSession, store_id: UUID) -> None:
    """Create category rows from existing products and known labels if table is empty."""
    repo = CategoryRepository(db)
    existing = await repo.list_for_store(store_id, include_inactive=True)
    if existing:
        return

    slugs = set(await repo.distinct_product_slugs(store_id))
    slugs.update(CATEGORY_LABELS.keys())

    for slug in sorted(slugs):
        name = CATEGORY_LABELS.get(slug, slug.replace("_", " ").title())
        db.add(
            ProductCategory(
                store_id=store_id,
                name=name,
                slug=slug,
                active=True,
            )
        )
    await db.flush()


async def get_category_labels(db: AsyncSession, store_id: UUID) -> dict[str, str]:
    await ensure_store_categories(db, store_id)
    repo = CategoryRepository(db)
    categories = await repo.list_for_store(store_id, include_inactive=True)
    return {c.slug: c.name for c in categories}


async def serialize_categories(
    db: AsyncSession, store_id: UUID, include_inactive: bool = False
) -> list[dict[str, Any]]:
    await ensure_store_categories(db, store_id)
    repo = CategoryRepository(db)
    categories = await repo.list_for_store(store_id, include_inactive=include_inactive)
    counts = await repo.product_counts_by_slug(store_id)
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "slug": c.slug,
            "active": c.active,
            "product_count": counts.get(c.slug, 0),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in categories
    ]


async def resolve_category_for_product(
    db: AsyncSession, store_id: UUID, categoria: str | None
) -> tuple[str | None, UUID | None]:
    """Return (slug, category_id) for a product, validating against store categories."""
    if not categoria or not categoria.strip():
        return None, None
    slug = categoria.strip()
    await ensure_store_categories(db, store_id)
    repo = CategoryRepository(db)
    cat = await repo.get_by_slug(store_id, slug)
    if not cat:
        raise ValueError(f"Categoria '{slug}' não encontrada")
    if not cat.active:
        raise ValueError(f"Categoria '{cat.name}' está inativa")
    return cat.slug, cat.id
