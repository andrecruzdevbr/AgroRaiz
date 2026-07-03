"""
AgroRaiz - Product Categories Endpoints
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.models import ProductCategory
from app.repositories.category_repository import CategoryRepository, slugify
from app.services.category_service import ensure_store_categories, serialize_categories

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    active: bool | None = None


@router.get("")
async def list_categories(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    await ensure_store_categories(db, current_user.store_id)
    await db.commit()
    return {
        "categories": await serialize_categories(
            db, current_user.store_id, include_inactive=include_inactive
        )
    }


@router.post("", status_code=201)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = CategoryRepository(db)
    base_slug = slugify(body.name)
    slug = base_slug
    suffix = 2
    while await repo.get_by_slug(current_user.store_id, slug):
        slug = f"{base_slug}_{suffix}"
        suffix += 1

    category = ProductCategory(
        store_id=current_user.store_id,
        name=body.name.strip(),
        slug=slug,
        active=True,
    )
    db.add(category)
    await db.flush()
    count = await repo.count_products(current_user.store_id, slug)
    return {
        "id": str(category.id),
        "name": category.name,
        "slug": category.slug,
        "active": category.active,
        "product_count": count,
        "created_at": category.created_at.isoformat() if category.created_at else None,
    }


@router.patch("/{category_id}")
async def update_category(
    category_id: UUID,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = CategoryRepository(db)
    category = await repo.get(category_id, current_user.store_id)
    if not category:
        raise HTTPException(404, "Categoria não encontrada")

    if body.name is not None:
        category.name = body.name.strip()
    if body.active is not None:
        category.active = body.active

    await db.flush()
    count = await repo.count_products(current_user.store_id, category.slug)
    return {
        "id": str(category.id),
        "name": category.name,
        "slug": category.slug,
        "active": category.active,
        "product_count": count,
        "created_at": category.created_at.isoformat() if category.created_at else None,
    }


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = CategoryRepository(db)
    category = await repo.get(category_id, current_user.store_id)
    if not category:
        raise HTTPException(404, "Categoria não encontrada")

    count = await repo.count_products(current_user.store_id, category.slug)
    if count > 0:
        raise HTTPException(
            409,
            f"Não é possível excluir: {count} produto(s) usam esta categoria. "
            "Desative a categoria em vez de excluir.",
        )

    await repo.delete(category)
