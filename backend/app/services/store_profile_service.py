"""
AgroRaiz — Store profile & vitrine serialization.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Store, Product

CATEGORY_LABELS: dict[str, str] = {
    "racoes_pet": "Rações Pet",
    "racoes_agro": "Rações Agro",
    "medicamentos_pet": "Medicamentos Pet",
    "medicamentos_agro": "Medicamentos Agro",
    "produtos_pet": "Produtos Pet",
    "ferramentas": "Ferramentas",
    "fertilizantes": "Fertilizantes",
    "higiene_agro": "Higiene Agro",
    "sementes": "Sementes",
}


def digits_only(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\D", "", value)


def normalize_br_phone(value: str | None) -> str | None:
    """Normalize to +55XXXXXXXXXXX when possible."""
    if not value or not value.strip():
        return None
    digits = digits_only(value)
    if not digits:
        return None
    if digits.startswith("55") and len(digits) >= 12:
        return f"+{digits}"
    if len(digits) in (10, 11):
        return f"+55{digits}"
    if len(digits) >= 12:
        return f"+{digits}"
    return None


def validate_br_phone(value: str | None, field: str) -> str | None:
    if value is None or not str(value).strip():
        return None
    normalized = normalize_br_phone(value)
    if not normalized:
        raise ValueError(f"{field} inválido. Use DDD + número.")
    local = digits_only(normalized)
    if not local.startswith("55") or len(local) < 12:
        raise ValueError(f"{field} inválido. Informe um número brasileiro completo.")
    return normalized


def format_phone_display(value: str | None) -> str | None:
    if not value:
        return None
    d = digits_only(value)
    if d.startswith("55"):
        d = d[2:]
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return value


def instagram_to_url(handle: str | None) -> str | None:
    if not handle or not handle.strip():
        return None
    h = handle.strip().lstrip("@")
    if h.startswith("http"):
        return h
    return f"https://instagram.com/{h}"


def build_whatsapp_link(phone: str | None, message: str | None = None) -> str | None:
    normalized = normalize_br_phone(phone)
    if not normalized:
        return None
    num = digits_only(normalized)
    base = f"https://wa.me/{num}"
    if message and message.strip():
        return f"{base}?text={quote(message.strip())}"
    return base


def _default_vitrine(store: Store) -> dict[str, Any]:
    city_state = ", ".join(filter(None, [store.city, store.state]))
    return {
        "hero_badge": "",
        "hero_title": "",
        "hero_subtitle": "",
        "hero_cta_label": "Falar no WhatsApp",
        "about_title": "",
        "about_text": "",
        "about_text_extra": "",
        "products_title": "",
        "products_intro": "",
        "cta_title": "",
        "cta_text": "",
        "promo_message": "",
        "whatsapp_message": "Olá! Vim pelo site e gostaria de mais informações.",
        "featured_categories": [],
        "testimonials": [],
    }


def _default_links(store: Store) -> dict[str, Any]:
    return {
        "instagram_url": instagram_to_url(store.instagram) or "",
        "google_maps_url": "",
        "whatsapp_url": build_whatsapp_link(store.whatsapp) or "",
    }


def merge_settings(store: Store) -> dict[str, Any]:
    settings = dict(store.settings or {})
    vitrine = {**_default_vitrine(store), **(settings.get("vitrine") or {})}
    links = {**_default_links(store), **(settings.get("links") or {})}
    return {
        "tagline": settings.get("tagline") or "",
        "description": settings.get("description") or "",
        "address": settings.get("address") or "",
        "opening_hours": settings.get("opening_hours") or "",
        "vitrine": vitrine,
        "links": links,
    }


def serialize_store_profile(store: Store) -> dict[str, Any]:
    settings = merge_settings(store)
    whatsapp = normalize_br_phone(store.whatsapp)
    return {
        "id": str(store.id),
        "name": store.name,
        "slug": store.slug,
        "phone": store.phone,
        "phone_display": format_phone_display(store.phone or store.whatsapp),
        "whatsapp": whatsapp,
        "whatsapp_display": format_phone_display(whatsapp),
        "instagram": store.instagram,
        "instagram_url": settings["links"].get("instagram_url") or instagram_to_url(store.instagram),
        "email": store.email,
        "city": store.city,
        "state": store.state,
        "logo_url": store.logo_url,
        **settings,
        "links": {
            **settings["links"],
            "whatsapp_url": settings["links"].get("whatsapp_url")
            or build_whatsapp_link(whatsapp, settings["vitrine"].get("whatsapp_message")),
        },
    }


async def get_category_stats(db: AsyncSession, store_id) -> list[dict]:
    result = await db.execute(
        select(
            Product.categoria,
            func.count(Product.id).label("total"),
        )
        .where(and_(Product.store_id == store_id, Product.ativo == True))
        .group_by(Product.categoria)
        .order_by(func.count(Product.id).desc())
    )
    return [{"categoria": row.categoria, "total": row.total} for row in result]


async def get_sample_products(db: AsyncSession, store_id, categoria: str, limit: int = 4) -> list[str]:
    result = await db.execute(
        select(Product.nome)
        .where(
            and_(
                Product.store_id == store_id,
                Product.ativo == True,
                Product.categoria == categoria,
            )
        )
        .order_by(Product.nome)
        .limit(limit)
    )
    return [row[0] for row in result]


async def build_featured_categories(
    db: AsyncSession,
    store: Store,
    vitrine: dict[str, Any],
) -> list[dict]:
    stats = await get_category_stats(db, store.id)
    if not stats:
        return []

    selected = vitrine.get("featured_categories") or []
    if selected:
        ordered = []
        stats_map = {s["categoria"]: s for s in stats}
        for key in selected:
            if key in stats_map:
                ordered.append(stats_map[key])
        if not ordered:
            ordered = stats[:4]
    else:
        ordered = stats[:4]

    featured = []
    for row in ordered:
        key = row["categoria"]
        featured.append({
            "key": key,
            "label": CATEGORY_LABELS.get(key, key.replace("_", " ").title()),
            "count": row["total"],
            "sample_products": await get_sample_products(db, store.id, key),
        })
    return featured


async def serialize_store_vitrine(db: AsyncSession, store: Store) -> dict[str, Any]:
    profile = serialize_store_profile(store)
    vitrine = profile["vitrine"]
    links = profile["links"]

    products_count = await db.scalar(
        select(func.count(Product.id)).where(
            and_(Product.store_id == store.id, Product.ativo == True)
        )
    ) or 0

    categories_count = len(await get_category_stats(db, store.id))
    featured_categories = await build_featured_categories(db, store, vitrine)

    wa_message = vitrine.get("whatsapp_message") or "Olá! Vim pelo site e gostaria de mais informações."
    whatsapp_link = links.get("whatsapp_url") or build_whatsapp_link(profile.get("whatsapp"), wa_message)

    city_state = " - ".join(filter(None, [store.city, store.state]))

    hero_title = vitrine.get("hero_title") or (
        f"Bem-vindo à {store.name}" if store.name else "Bem-vindo à nossa loja"
    )
    hero_subtitle = vitrine.get("hero_subtitle") or profile.get("tagline") or profile.get("description") or (
        f"Atendemos você em {city_state}" if city_state else ""
    )

    return {
        **profile,
        "city_state": city_state,
        "whatsapp_link": whatsapp_link,
        "vitrine": {
            **vitrine,
            "hero_title": hero_title,
            "hero_subtitle": hero_subtitle,
        },
        "stats": {
            "products_count": products_count,
            "categories_count": categories_count,
        },
        "featured_categories": featured_categories,
    }
