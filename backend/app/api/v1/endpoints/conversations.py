"""
AgroRaiz - Conversations Endpoints
Central de atendimento: WhatsApp + Instagram.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_attendant
from app.repositories.conversation_repository import ConversationRepository
from app.models.models import ConversationStatus, MessageSender

router = APIRouter()


class UpdateStatusRequest(BaseModel):
    status: str
    motivo: str = None


class SendMessageRequest(BaseModel):
    conteudo: str


@router.get("")
async def list_conversations(
    status: str = Query(None),
    canal: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = ConversationRepository(db)
    offset = (page - 1) * page_size
    conversations, total = await repo.list_active(
        store_id=current_user.store_id,
        status=status,
        canal=canal,
        offset=offset,
        limit=page_size,
    )

    return {
        "conversations": [_serialize(c) for c in conversations],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = ConversationRepository(db)
    conv = await repo.get_with_customer(conversation_id, current_user.store_id)
    if not conv:
        raise HTTPException(404, "Conversa não encontrada")
    return _serialize(conv)


@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = ConversationRepository(db)
    conv = await repo.get(conversation_id, current_user.store_id)
    if not conv:
        raise HTTPException(404, "Conversa não encontrada")

    messages = await repo.get_messages(conversation_id, limit=limit)
    return {
        "messages": [
            {
                "id": str(m.id),
                "conteudo": m.conteudo,
                "tipo": m.tipo,
                "remetente": m.remetente.value,
                "lida": m.lida,
                "status": m.status,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]
    }


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: UUID,
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_attendant),
):
    """Send manual message as attendant (human mode)."""
    repo = ConversationRepository(db)
    conv = await repo.get(conversation_id, current_user.store_id)
    if not conv:
        raise HTTPException(404, "Conversa não encontrada")

    # Save message
    msg = await repo.add_message(
        conversation_id=conversation_id,
        conteudo=body.conteudo,
        remetente=MessageSender.ATENDENTE,
    )

    # Send via WhatsApp if we have the customer phone
    if conv.customer and conv.channel.value == "whatsapp":
        from app.core.redis_client import get_redis
        from app.services.whatsapp.whatsapp_service import WhatsAppService

        redis = await get_redis()
        wz = WhatsAppService(redis)
        await wz.send_text(
            conv.customer.phone, body.conteudo, simulate_typing=True, delay_ms=500
        )

    return {
        "id": str(msg.id),
        "conteudo": msg.conteudo,
        "remetente": "atendente",
        "created_at": msg.created_at.isoformat(),
    }


@router.patch("/{conversation_id}/status")
async def update_status(
    conversation_id: UUID,
    body: UpdateStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_attendant),
):
    try:
        status = ConversationStatus(body.status)
    except ValueError:
        raise HTTPException(400, f"Status inválido: {body.status}")

    repo = ConversationRepository(db)
    conv = await repo.get(conversation_id, current_user.store_id)
    if not conv:
        raise HTTPException(404, "Conversa não encontrada")

    await repo.update_status(
        conversation_id,
        status,
        motivo=body.motivo,
        assigned_to=current_user.id if status == ConversationStatus.HUMANO else None,
    )

    # If resolving, resume AI automation
    if status == ConversationStatus.FINALIZADA and conv.customer:
        from app.core.redis_client import get_redis
        from app.services.ai.ai_service import AIService

        redis = await get_redis()
        ai = AIService(redis, None, None)
        await ai.resume_automation(
            conv.customer.phone, str(current_user.store_id)
        )

    return {"status": "updated"}


@router.get("/stats/summary")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from datetime import datetime, timedelta
    repo = ConversationRepository(db)
    since = datetime.utcnow() - timedelta(days=30)
    return await repo.get_stats(current_user.store_id, since)


def _serialize(conv) -> dict:
    d = {
        "id": str(conv.id),
        "channel": conv.channel.value,
        "status": conv.status.value,
        "prioridade": conv.prioridade.value,
        "sentimento": conv.sentimento.value if conv.sentimento else "neutro",
        "assunto": conv.assunto,
        "motivo_transferencia": conv.motivo_transferencia,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
    }
    if hasattr(conv, "customer") and conv.customer:
        d["cliente"] = {
            "id": str(conv.customer.id),
            "nome": conv.customer.name,
            "telefone": conv.customer.phone,
            "frequencia": conv.customer.frequencia.value if conv.customer.frequencia else None,
        }
    return d
