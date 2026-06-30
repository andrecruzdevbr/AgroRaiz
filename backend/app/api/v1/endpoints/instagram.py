"""
AgroRaiz - Instagram Endpoints
Directs, comentários, publicação e conteúdo via IA.
"""
import hashlib
import hmac

from fastapi import APIRouter, Depends, Request, Query, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.config import settings
from app.core.security import get_current_user, require_admin, require_attendant
from app.services.instagram.instagram_service import InstagramService

router = APIRouter()


def get_ig_service() -> InstagramService:
    return InstagramService()


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification."""
    svc = get_ig_service()
    challenge = svc.verify_webhook(hub_mode, hub_token, hub_challenge)
    if challenge:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=challenge)
    from fastapi import HTTPException
    raise HTTPException(403, "Webhook verification failed")


@router.post("/webhook")
async def receive_webhook(request: Request, x_hub_signature_256: str = Header(None)):
    """
    Receive Instagram events: DMs, comments, mentions.
    Validates Meta's HMAC-SHA256 signature (X-Hub-Signature-256) before processing.
    """
    raw_body = await request.body()

    if not settings.INSTAGRAM_APP_SECRET:
        # Fail closed: never process an unverifiable webhook in production.
        raise HTTPException(503, "Instagram webhook não configurado (INSTAGRAM_APP_SECRET ausente)")

    if not x_hub_signature_256 or not x_hub_signature_256.startswith("sha256="):
        raise HTTPException(401, "Assinatura do webhook ausente")

    expected = "sha256=" + hmac.new(
        settings.INSTAGRAM_APP_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, x_hub_signature_256):
        raise HTTPException(401, "Assinatura do webhook inválida")

    payload = await request.json()
    svc = get_ig_service()
    return await svc.process_webhook(payload)


@router.get("/conversations")
async def get_conversations(
    limit: int = Query(20, ge=1, le=50),
    current_user=Depends(get_current_user),
):
    svc = get_ig_service()
    result = await svc.get_conversations(limit=limit)
    return {"conversations": result}


@router.post("/reply/{recipient_id}")
async def send_reply(
    recipient_id: str,
    body: BaseModel,
    current_user=Depends(get_current_user),
):
    svc = get_ig_service()
    return await svc.send_reply(recipient_id, body.message)  # type: ignore


@router.get("/media")
async def get_media(
    limit: int = Query(10, ge=1, le=30),
    current_user=Depends(get_current_user),
):
    svc = get_ig_service()
    result = await svc.get_recent_media(limit=limit)
    return {"media": result}


@router.get("/media/{media_id}/comments")
async def get_comments(
    media_id: str,
    current_user=Depends(get_current_user),
):
    svc = get_ig_service()
    return await svc.get_comments(media_id)


@router.post("/media/{media_id}/comments/{comment_id}/reply")
async def reply_comment(
    media_id: str,
    comment_id: str,
    message: str,
    current_user=Depends(require_admin),
):
    svc = get_ig_service()
    return await svc.reply_to_comment(comment_id, message)


class PublishRequest(BaseModel):
    image_url: str
    caption: str


@router.post("/publish")
async def publish_post(
    body: PublishRequest,
    current_user=Depends(require_admin),
):
    """Publish a post directly to Instagram Business."""
    svc = get_ig_service()
    return await svc.publish_post(body.image_url, body.caption)


@router.get("/insights")
async def get_insights(
    period: str = Query("day", pattern="^(day|week|month)$"),
    current_user=Depends(get_current_user),
):
    svc = get_ig_service()
    return await svc.get_account_insights(period=period)
