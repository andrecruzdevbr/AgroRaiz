"""
AgroRaiz - AI Endpoints
Geração de conteúdo, métricas, configuração da persona e IA Social.
"""
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.security import get_current_user, require_admin, require_attendant
from app.core.config import settings
from app.services.ai.ai_service import AIService

router = APIRouter()


class ContentRequest(BaseModel):
    type: str = "post"  # post, story, reel_caption, promotion, hashtags
    topic: Optional[str] = None
    season: Optional[str] = None


class PersonaConfig(BaseModel):
    name: str
    greeting: str
    farewell: str
    personality_notes: str = ""
    max_messages_before_human: int = 5
    transfer_keywords: list[str] = []
    out_of_hours_message: str = ""
    active: bool = True


class TestMessageRequest(BaseModel):
    message: str
    customer_phone: str = "test_user"


@router.post("/generate-content")
async def generate_content(
    body: ContentRequest,
    current_user=Depends(get_current_user),
):
    """Generate Instagram/WhatsApp content via AI."""
    redis = await get_redis()
    ai = AIService(redis, None, None)
    result = await ai.generate_social_content(body.type, body.topic, body.season)

    # Cache for reuse
    cache_key = f"ai:content:{current_user.store_id}:{body.type}:latest"
    await redis.setex(cache_key, 3600, json.dumps(result))

    return result


@router.get("/content/latest")
async def get_latest_content(
    type: str = Query("post"),
    current_user=Depends(get_current_user),
):
    """Retrieve last AI-generated content from cache."""
    redis = await get_redis()
    cache_key = f"ai:content:{current_user.store_id}:{type}:latest"
    data = await redis.get(cache_key)
    if not data:
        raise HTTPException(404, "Nenhum conteúdo gerado ainda. Use POST /ai/generate-content")
    return json.loads(data)


@router.get("/metrics")
async def get_ai_metrics(
    period: str = Query("30d"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """AI performance metrics: resolution rate, fallbacks, response times."""
    from datetime import datetime, timedelta
    from sqlalchemy import select, func, and_
    from app.models.models import Conversation, ConversationStatus, AISession

    days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
    since = datetime.utcnow() - timedelta(days=days)

    total = await db.scalar(
        select(func.count()).select_from(Conversation).where(
            and_(
                Conversation.store_id == current_user.store_id,
                Conversation.created_at >= since,
            )
        )
    ) or 0

    ai_resolved = await db.scalar(
        select(func.count()).select_from(Conversation).where(
            and_(
                Conversation.store_id == current_user.store_id,
                Conversation.created_at >= since,
                Conversation.assigned_to == None,
                Conversation.status == ConversationStatus.FINALIZADA,
            )
        )
    ) or 0

    human_takeovers = await db.scalar(
        select(func.count()).select_from(AISession).where(
            and_(
                AISession.store_id == current_user.store_id,
                AISession.created_at >= since,
                AISession.human_takeover == True,
            )
        )
    ) or 0

    resolution_rate = round((ai_resolved / total * 100) if total else 0, 1)

    # Estimated hours saved (avg 3 min per AI-handled conversation)
    hours_saved = round(ai_resolved * 3 / 60, 1)

    from app.services.ai.providers.provider import get_provider_status
    provider_info = get_provider_status()

    return {
        "period": period,
        "total_conversations": total,
        "ai_resolved": ai_resolved,
        "human_takeovers": human_takeovers,
        "resolution_rate": resolution_rate,
        "hours_saved": hours_saved,
        "persona": {
            "name": settings.AI_PERSONA_NAME,
            "status": "active",
        },
        "provider": provider_info,
    }


@router.post("/test")
async def test_ai(
    body: TestMessageRequest,
    current_user=Depends(require_admin),
):
    """
    Test AI response without sending to WhatsApp.
    Useful for tuning the persona.
    """
    from app.core.database import AsyncSessionLocal
    from app.repositories.customer_repository import CustomerRepository
    from app.repositories.product_repository import ProductRepository

    redis = await get_redis()

    async with AsyncSessionLocal() as db:
        customer_repo = CustomerRepository(db)
        product_repo = ProductRepository(db)
        ai = AIService(redis, customer_repo, product_repo)

        result = await ai.process_whatsapp_message(
            store_id=str(current_user.store_id),
            phone=body.customer_phone,
            message=body.message,
        )

    return {
        "action": result.get("action"),
        "response": result.get("message"),
        "reason": result.get("reason"),
    }


@router.get("/persona")
async def get_persona(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get current AI persona configuration for this store."""
    from app.models.models import Store
    store = await db.get(Store, current_user.store_id)
    if not store:
        raise HTTPException(404)

    ai_config = store.ai_config or {}
    return {
        "name": ai_config.get("persona_name", "Ana"),
        "greeting": ai_config.get("saudacao", ""),
        "farewell": ai_config.get("despedida", ""),
        "active": ai_config.get("ativa", True),
        "transfer_keywords": ai_config.get("palavras_chave_transferencia", []),
        "out_of_hours_message": ai_config.get("resposta_fora_horario", ""),
    }


@router.patch("/persona")
async def update_persona(
    body: PersonaConfig,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Update AI persona configuration."""
    from app.models.models import Store
    store = await db.get(Store, current_user.store_id)
    if not store:
        raise HTTPException(404)

    current_config = store.ai_config or {}
    current_config.update({
        "persona_name": body.name,
        "saudacao": body.greeting,
        "despedida": body.farewell,
        "personality_notes": body.personality_notes,
        "ativa": body.active,
        "palavras_chave_transferencia": body.transfer_keywords,
        "resposta_fora_horario": body.out_of_hours_message,
        "limite_mensagens_antes_humano": body.max_messages_before_human,
    })
    store.ai_config = current_config
    await db.flush()

    # Invalidate session caches so new config takes effect
    redis = await get_redis()
    pattern = f"ai:session:{current_user.store_id}:*"
    keys = await redis.keys(pattern)
    if keys:
        await redis.delete(*keys)

    return {"status": "updated", "config": current_config}


@router.post("/calendar/suggest")
async def suggest_calendar(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2024),
    current_user=Depends(get_current_user),
):
    """Generate a content calendar for the given month via AI."""
    from app.services.ai.providers.provider import get_ai_provider
    import re

    provider = get_ai_provider()

    prompt = f"""Crie um calendário editorial de conteúdo para o Instagram da {settings.STORE_NAME} 
(loja agro e pet em {settings.STORE_CITY}) para {month:02d}/{year}.

Considere sazonalidade agropecuária e pet para esse período.

Retorne APENAS JSON válido (sem markdown):
{{
  "month": {month},
  "year": {year},
  "posts": [
    {{
      "day": 1,
      "type": "post|story|reel",
      "theme": "tema do conteúdo",
      "caption_idea": "ideia de legenda",
      "hashtags": ["lista", "de", "hashtags"],
      "best_time": "HH:MM"
    }}
  ]
}}

Gere entre 12 e 16 posts para o mês."""

    try:
        text = await provider.complete(prompt, max_tokens=2048)
        text = re.sub(r"```json\n?|```\n?", "", text).strip()
        return json.loads(text)
    except Exception as e:
        return {"error": "parse_failed", "detail": str(e)}
