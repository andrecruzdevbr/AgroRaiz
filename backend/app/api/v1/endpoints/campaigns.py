"""
AgroRaiz - Campaigns Endpoints
Criação, agendamento, disparo e analytics de campanhas.
"""
from uuid import UUID
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_attendant
from app.repositories.campaign_repository import CampaignRepository
from app.models.models import CampaignStatus

router = APIRouter()


class CampaignCreate(BaseModel):
    nome: str = Field(..., min_length=1)
    tipo: str = "promocao"
    canais: List[str] = ["whatsapp"]
    mensagem: str = Field(..., min_length=1)
    imagem_url: Optional[str] = None
    segmento: dict = {}
    agendado_para: Optional[datetime] = None


class CampaignUpdate(BaseModel):
    nome: Optional[str] = None
    mensagem: Optional[str] = None
    imagem_url: Optional[str] = None
    segmento: Optional[dict] = None
    agendado_para: Optional[datetime] = None


@router.get("")
async def list_campaigns(
    status: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = CampaignRepository(db)
    offset = (page - 1) * page_size
    campaigns, total = await repo.list(
        store_id=current_user.store_id,
        status=status,
        offset=offset,
        limit=page_size,
    )
    return {
        "campaigns": [_serialize(c) for c in campaigns],
        "total": total,
        "page": page,
    }


@router.post("", status_code=201)
async def create_campaign(
    body: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = CampaignRepository(db)

    status = CampaignStatus.AGENDADA if body.agendado_para else CampaignStatus.RASCUNHO

    campaign = await repo.create(
        store_id=current_user.store_id,
        created_by=current_user.id,
        status=status,
        **body.model_dump(),
    )

    # Estimate recipients
    recipients = await repo.resolve_recipients(current_user.store_id, body.segmento)
    await repo.update(campaign, total_destinatarios=len(recipients))

    return _serialize(campaign)


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    repo = CampaignRepository(db)
    campaign = await repo.get(campaign_id, current_user.store_id)
    if not campaign:
        raise HTTPException(404, "Campanha não encontrada")
    return _serialize(campaign)


@router.patch("/{campaign_id}")
async def update_campaign(
    campaign_id: UUID,
    body: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = CampaignRepository(db)
    campaign = await repo.get(campaign_id, current_user.store_id)
    if not campaign:
        raise HTTPException(404, "Campanha não encontrada")

    if campaign.status not in [CampaignStatus.RASCUNHO, CampaignStatus.AGENDADA]:
        raise HTTPException(400, "Não é possível editar campanha em andamento")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    campaign = await repo.update(campaign, **updates)
    return _serialize(campaign)


@router.post("/{campaign_id}/launch")
async def launch_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Launch campaign immediately (bypass scheduled time)."""
    repo = CampaignRepository(db)
    campaign = await repo.get(campaign_id, current_user.store_id)
    if not campaign:
        raise HTTPException(404, "Campanha não encontrada")

    if campaign.status not in [CampaignStatus.RASCUNHO, CampaignStatus.AGENDADA]:
        raise HTTPException(400, f"Não é possível lançar campanha com status {campaign.status.value}")

    # Resolve recipients
    recipients = await repo.resolve_recipients(current_user.store_id, campaign.segmento or {})
    if not recipients:
        raise HTTPException(400, "Nenhum destinatário encontrado para este segmento")

    # Update campaign
    await repo.update(
        campaign,
        status=CampaignStatus.ATIVA,
        data_inicio=datetime.utcnow(),
        total_destinatarios=len(recipients),
    )

    # Queue individual sends via Celery
    from app.tasks.celery_app import send_campaign_message
    sent = 0
    for i, customer in enumerate(recipients):
        if not customer.phone:
            continue
        send_campaign_message.apply_async(
            kwargs={
                "campaign_id": str(campaign.id),
                "phone": customer.phone,
                "message": campaign.mensagem,
                "delay": i * 3,
            },
            countdown=i * 3,
        )
        sent += 1

    return {
        "status": "launched",
        "recipients_queued": sent,
        "campaign_id": str(campaign.id),
    }


@router.post("/{campaign_id}/pause")
async def pause_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = CampaignRepository(db)
    campaign = await repo.get(campaign_id, current_user.store_id)
    if not campaign or campaign.status != CampaignStatus.ATIVA:
        raise HTTPException(400, "Campanha não está ativa")

    await repo.update(campaign, status=CampaignStatus.PAUSADA)
    return {"status": "paused"}


@router.get("/{campaign_id}/recipients")
async def get_recipients(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Preview which customers would receive this campaign."""
    repo = CampaignRepository(db)
    campaign = await repo.get(campaign_id, current_user.store_id)
    if not campaign:
        raise HTTPException(404, "Campanha não encontrada")

    recipients = await repo.resolve_recipients(current_user.store_id, campaign.segmento or {})
    return {
        "total": len(recipients),
        "preview": [
            {"id": str(c.id), "name": c.name, "phone": c.phone}
            for c in recipients[:20]
        ],
    }


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Delete a campaign. Only rascunho/pausada/finalizada campaigns can be deleted."""
    repo = CampaignRepository(db)
    campaign = await repo.get(campaign_id, current_user.store_id)
    if not campaign:
        raise HTTPException(404, "Campanha não encontrada")
    if campaign.status.value not in ("rascunho", "pausada", "finalizada"):
        raise HTTPException(400, "Somente campanhas em rascunho, pausadas ou finalizadas podem ser excluídas")
    await repo.delete(campaign)
    await db.commit()


def _serialize(c) -> dict:
    return {
        "id": str(c.id),
        "nome": c.nome,
        "tipo": c.tipo,
        "canais": c.canais or [],
        "mensagem": c.mensagem,
        "imagem_url": c.imagem_url,
        "segmento": c.segmento or {},
        "status": c.status.value,
        "agendado_para": c.agendado_para.isoformat() if c.agendado_para else None,
        "data_inicio": c.data_inicio.isoformat() if c.data_inicio else None,
        "data_fim": c.data_fim.isoformat() if c.data_fim else None,
        "metricas": {
            "total_destinatarios": c.total_destinatarios,
            "enviados": c.enviados,
            "entregues": c.entregues,
            "lidos": c.lidos,
            "conversoes": c.conversoes,
            "valor_gerado": round(c.valor_gerado or 0, 2),
            "taxa_abertura": round(
                (c.lidos / c.enviados * 100) if c.enviados else 0, 1
            ),
            "taxa_conversao": round(
                (c.conversoes / c.lidos * 100) if c.lidos else 0, 1
            ),
        },
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
