"""
Limpa textos de teste da vitrine e restaura valores padrão vazios (fallbacks automáticos).
Run: python -m app.scripts.reset_store_content
"""
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.models import Store


async def reset_store_content() -> None:
    async with AsyncSessionLocal() as db:
        store = (
            await db.execute(select(Store).where(Store.slug == "agro-raiz"))
        ).scalar_one_or_none()
        if not store:
            print("Loja agro-raiz não encontrada")
            return

        store.whatsapp = "+5531995122303"
        store.settings = {
            "tagline": "",
            "short_description": "",
            "description": "",
            "address": "",
            "opening_hours": "",
            "vitrine": {
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
            },
            "links": {
                "instagram_url": "https://instagram.com/_agroraiz_",
                "google_maps_url": "",
                "whatsapp_url": "",
            },
        }
        await db.commit()
        print(f"✓ Conteúdo da loja '{store.name}' restaurado para padrões vazios")


if __name__ == "__main__":
    asyncio.run(reset_store_content())
