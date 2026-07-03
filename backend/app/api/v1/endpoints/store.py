"""
AgroRaiz — Store profile & public vitrine endpoints.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.models import Store
from app.services.category_service import get_category_labels, serialize_categories, ensure_store_categories
from app.services.store_profile_service import (
    build_whatsapp_link,
    instagram_to_url,
    merge_settings,
    normalize_br_phone,
    serialize_store_profile,
    serialize_store_vitrine,
    validate_br_phone,
)

router = APIRouter()


class VitrineSettings(BaseModel):
    hero_badge: str = ""
    hero_title: str = ""
    hero_subtitle: str = ""
    hero_cta_label: str = "Falar no WhatsApp"
    about_title: str = ""
    about_text: str = ""
    about_text_extra: str = ""
    products_title: str = ""
    products_intro: str = ""
    cta_title: str = ""
    cta_text: str = ""
    promo_message: str = ""
    whatsapp_message: str = "Olá! Vim pelo site e gostaria de mais informações."
    featured_categories: list[str] = Field(default_factory=list)
    testimonials: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("featured_categories")
    @classmethod
    def validate_featured_categories(cls, v: list[str]) -> list[str]:
        if len(v) > 6:
            raise ValueError("Máximo de 6 categorias em destaque")
        return v

    @field_validator("testimonials")
    @classmethod
    def validate_testimonials(cls, v: list[dict]) -> list[dict]:
        if len(v) > 6:
            raise ValueError("Máximo de 6 depoimentos")
        return v


class StoreLinks(BaseModel):
    instagram_url: str = ""
    google_maps_url: str = ""
    whatsapp_url: str = ""


class StoreProfileUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    tagline: str = Field("", max_length=300)
    short_description: str = Field("", max_length=1000)
    description: str = Field("", max_length=5000)
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[EmailStr] = None
    instagram: Optional[str] = Field(None, max_length=100)
    address: str = Field("", max_length=500)
    city: str = Field("", max_length=200)
    state: str = Field("", max_length=2)
    opening_hours: str = Field("", max_length=500)
    logo_url: Optional[str] = Field(None, max_length=500)
    vitrine: VitrineSettings = Field(default_factory=VitrineSettings)
    links: StoreLinks = Field(default_factory=StoreLinks)

    @field_validator("state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        if v and len(v) != 2:
            raise ValueError("Estado deve ter 2 letras (ex: MG)")
        return v.upper() if v else v

    @field_validator("whatsapp")
    @classmethod
    def validate_whatsapp(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return validate_br_phone(v, "WhatsApp")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return validate_br_phone(v, "Telefone")


async def _get_store_by_slug(db: AsyncSession, slug: str) -> Store:
    result = await db.execute(
        select(Store).where(Store.slug == slug, Store.active == True)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(404, "Loja não encontrada")
    return store


async def _get_default_store(db: AsyncSession) -> Store:
    result = await db.execute(
        select(Store).where(Store.active == True).order_by(Store.created_at).limit(1)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(404, "Nenhuma loja configurada")
    return store


@router.get("/vitrine")
async def get_public_vitrine(
    slug: str = Query("agro-raiz"),
    db: AsyncSession = Depends(get_db),
):
    """Public vitrine data for the landing page."""
    store = await _get_store_by_slug(db, slug)
    return await serialize_store_vitrine(db, store)


@router.get("/profile")
async def get_store_profile(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    store = await db.get(Store, current_user.store_id)
    if not store:
        raise HTTPException(404, "Loja não encontrada")
    labels = await get_category_labels(db, current_user.store_id)
    return {
        **serialize_store_profile(store),
        "available_categories": [
            {"key": k, "label": v} for k, v in labels.items() if v
        ],
    }


@router.put("/profile")
async def update_store_profile(
    body: StoreProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    store = await db.get(Store, current_user.store_id)
    if not store:
        raise HTTPException(404, "Loja não encontrada")

    store.name = body.name.strip()
    store.phone = body.phone
    store.whatsapp = body.whatsapp
    store.email = str(body.email) if body.email else None
    store.instagram = body.instagram.strip() if body.instagram else None
    store.city = body.city.strip() or None
    store.state = body.state.strip().upper() or None
    store.logo_url = body.logo_url.strip() if body.logo_url else None

    links = body.links.model_dump()
    if not links.get("instagram_url") and store.instagram:
        links["instagram_url"] = instagram_to_url(store.instagram) or ""
    if not links.get("whatsapp_url") and store.whatsapp:
        links["whatsapp_url"] = build_whatsapp_link(
            store.whatsapp,
            body.vitrine.whatsapp_message,
        ) or ""

    store.settings = {
        "tagline": body.tagline.strip(),
        "short_description": body.short_description.strip(),
        "description": body.description.strip(),
        "address": body.address.strip(),
        "opening_hours": body.opening_hours.strip(),
        "vitrine": body.vitrine.model_dump(),
        "links": links,
    }

    await db.flush()
    labels = await get_category_labels(db, current_user.store_id)
    return {
        **serialize_store_profile(store),
        "available_categories": [
            {"key": k, "label": v} for k, v in labels.items() if v
        ],
    }


@router.get("/categories")
async def list_store_categories(
    slug: str = Query("agro-raiz"),
    db: AsyncSession = Depends(get_db),
):
    store = await _get_store_by_slug(db, slug)
    await ensure_store_categories(db, store.id)
    await db.commit()
    cats = await serialize_categories(db, store.id)
    return [{"key": c["slug"], "label": c["name"]} for c in cats if c["active"]]
