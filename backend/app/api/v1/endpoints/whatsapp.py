"""
AgroRaiz - WhatsApp Endpoints
Webhook Evolution API, envio manual, controle de automação IA.
"""
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from app.core.config import settings
from app.core.security import get_current_user, require_attendant
from app.core.redis_client import get_redis

router = APIRouter()


class SendRequest(BaseModel):
    phone: str
    message: str


class AutomationRequest(BaseModel):
    phone: str


@router.post("/webhook")
async def webhook(
    request: Request,
    apikey: Optional[str] = Header(None),
):
    """
    Receives Evolution API webhook events.
    Validates API key (constant-time comparison), then routes to service.
    """
    if not settings.EVOLUTION_API_KEY:
        # Fail closed: never accept unauthenticated webhooks in production.
        raise HTTPException(503, "WhatsApp webhook não configurado (EVOLUTION_API_KEY ausente)")

    if not apikey or not hmac.compare_digest(apikey, settings.EVOLUTION_API_KEY):
        raise HTTPException(401, "Chave de webhook inválida")

    payload = await request.json()

    redis = await get_redis()
    from app.services.whatsapp.whatsapp_service import WhatsAppService
    wz = WhatsAppService(redis)
    return await wz.process_webhook(payload)


@router.get("/status")
async def get_status(current_user=Depends(get_current_user)):
    redis = await get_redis()
    from app.services.whatsapp.whatsapp_service import WhatsAppService
    wz = WhatsAppService(redis)
    return await wz.get_status()


@router.post("/send")
async def send_message(
    body: SendRequest,
    current_user=Depends(require_attendant),
):
    redis = await get_redis()
    from app.services.whatsapp.whatsapp_service import WhatsAppService
    wz = WhatsAppService(redis)
    result = await wz.send_text(
        body.phone, body.message, simulate_typing=True, delay_ms=800
    )
    return result


@router.get("/messages/{phone}")
async def get_messages(
    phone: str,
    limit: int = 50,
    current_user=Depends(get_current_user),
):
    redis = await get_redis()
    from app.services.whatsapp.whatsapp_service import WhatsAppService
    wz = WhatsAppService(redis)
    messages = await wz.get_messages(phone, limit=limit)
    return {"messages": messages}


@router.post("/resume-automation")
async def resume_automation(
    body: AutomationRequest,
    current_user=Depends(require_attendant),
):
    """Re-enable AI for a customer after human handoff."""
    redis = await get_redis()
    from app.services.ai.ai_service import AIService
    ai = AIService(redis, None, None)
    await ai.resume_automation(body.phone, str(current_user.store_id))
    return {"status": "automation_resumed", "phone": body.phone}


@router.post("/pause-automation")
async def pause_automation(
    body: AutomationRequest,
    current_user=Depends(require_attendant),
):
    """Manually pause AI for a customer (human takeover)."""
    redis = await get_redis()
    session_key = f"ai:session:{current_user.store_id}:{body.phone}"
    import json
    from datetime import datetime

    session_data = await redis.get(session_key)
    session = json.loads(session_data) if session_data else {}
    session["human_takeover"] = True
    session["takeover_reason"] = "manual"
    session["takeover_at"] = datetime.utcnow().isoformat()
    await redis.setex(session_key, 86400, json.dumps(session))

    return {"status": "automation_paused", "phone": body.phone}


@router.get("/queue/human")
async def get_human_queue(current_user=Depends(get_current_user)):
    """List conversations awaiting human attention."""
    redis = await get_redis()
    import json
    items = await redis.lrange("queue:human_takeover", 0, -1)
    return {
        "queue": [json.loads(i) for i in items],
        "total": len(items),
    }


@router.delete("/queue/human/{phone}")
async def dismiss_from_queue(
    phone: str,
    current_user=Depends(require_attendant),
):
    """Remove a phone from human queue after attendant takes over."""
    redis = await get_redis()
    import json
    items = await redis.lrange("queue:human_takeover", 0, -1)
    for item in items:
        data = json.loads(item)
        if data.get("phone") == phone:
            await redis.lrem("queue:human_takeover", 1, item)
    return {"status": "removed"}
