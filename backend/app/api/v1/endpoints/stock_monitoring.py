"""
AgroRaiz - Stock Monitoring Endpoints
Confirmação de estoque, rankings, relatório gerencial e auditoria.
"""
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user, require_admin, require_attendant
from app.models.models import AuditLog, Product, ProductConsultation, WeeklyReport
from app.services.stock_monitoring_service import StockMonitoringService

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ConfirmProductRequest(BaseModel):
    new_stock: Optional[int] = None
    note: Optional[str] = None


class BulkConfirmRequest(BaseModel):
    note: Optional[str] = None


# ─── Dashboard stats ─────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stock_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Dashboard stock panel — confirmation status + rankings."""
    svc = StockMonitoringService(db)
    stats = await svc.get_dashboard_stock_stats(current_user.store_id)
    return stats


@router.get("/rankings")
async def get_rankings(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Full product rankings: most consulted, rupture risk, unconfirmed."""
    svc = StockMonitoringService(db)
    return await svc.get_product_rankings(current_user.store_id)


# ─── Confirmation ─────────────────────────────────────────────────────────────

@router.post("/confirm/{product_id}")
async def confirm_product(
    product_id: UUID,
    body: ConfirmProductRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_attendant),
):
    """Confirm a single product's availability."""
    svc = StockMonitoringService(db)
    try:
        product = await svc.confirm_product(
            product_id=product_id,
            store_id=current_user.store_id,
            confirmed_by=current_user.name,
            source="manual",
            new_stock=body.new_stock,
            user_id=current_user.id,
        )
        await db.commit()
        return {
            "status": "confirmed",
            "product": product.nome,
            "estoque": product.estoque,
            "confirmed_at": datetime.utcnow().isoformat(),
        }
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/confirm-all")
async def confirm_all_products(
    body: BulkConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_attendant),
):
    """Bulk confirm all active products as available."""
    svc = StockMonitoringService(db)
    count = await svc.confirm_all_products(
        store_id=current_user.store_id,
        confirmed_by=current_user.name,
        source="manual",
    )
    await db.commit()
    return {
        "status": "confirmed",
        "confirmed_count": count,
        "confirmed_at": datetime.utcnow().isoformat(),
        "confirmed_by": current_user.name,
    }


@router.get("/pending")
async def get_pending_confirmation(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Products needing confirmation, grouped by urgency."""
    svc = StockMonitoringService(db)
    groups = await svc.get_products_needing_confirmation(current_user.store_id)

    def serialize(p: Product) -> dict:
        return {
            "id": str(p.id),
            "nome": p.nome,
            "categoria": p.categoria,
            "estoque": p.estoque,
            "preco": p.preco,
            "data_ultima_confirmacao": (
                p.data_ultima_confirmacao.isoformat()
                if p.data_ultima_confirmacao else None
            ),
            "confirmado_por": p.confirmado_por,
            "dias_sem_confirmacao": (
                (datetime.utcnow() - p.data_ultima_confirmacao).days
                if p.data_ultima_confirmacao else 999
            ),
        }

    return {
        "critical": [serialize(p) for p in groups["critical"]],
        "warning": [serialize(p) for p in groups["warning"]],
        "ok_count": len(groups["ok"]),
    }


# ─── Weekly Report ────────────────────────────────────────────────────────────

@router.post("/weekly-report/generate")
async def generate_weekly_report(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Manually trigger weekly report generation."""
    svc = StockMonitoringService(db)
    report = await svc.generate_weekly_summary(current_user.store_id)
    await db.commit()
    return report


@router.get("/weekly-report/latest")
async def get_latest_report(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get the last weekly report."""
    result = await db.execute(
        select(WeeklyReport)
        .where(WeeklyReport.store_id == current_user.store_id)
        .order_by(WeeklyReport.created_at.desc())
        .limit(1)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Nenhum relatório gerado ainda")
    return {
        "id": str(report.id),
        "week_start": report.week_start.isoformat(),
        "week_end": report.week_end.isoformat(),
        "data": report.data,
        "sent_whatsapp": report.sent_whatsapp,
        "created_at": report.created_at.isoformat(),
    }


@router.post("/weekly-report/send-whatsapp")
async def send_report_via_whatsapp(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Send the weekly summary to the admin's WhatsApp."""
    from app.core.redis_client import get_redis
    from app.services.whatsapp.whatsapp_service import WhatsAppService

    svc = StockMonitoringService(db)
    report_data = await svc.generate_weekly_summary(current_user.store_id)

    redis = await get_redis()
    wz = WhatsAppService(redis)
    await wz.send_text(
        phone=settings.STORE_WHATSAPP,
        message=report_data["whatsapp_message"],
        simulate_typing=False,
    )

    # Mark as sent
    result = await db.execute(
        select(WeeklyReport)
        .where(WeeklyReport.store_id == current_user.store_id)
        .order_by(WeeklyReport.created_at.desc())
        .limit(1)
    )
    report = result.scalar_one_or_none()
    if report:
        report.sent_whatsapp = True
        report.sent_at = datetime.utcnow()

    await db.commit()
    return {"status": "sent", "phone": settings.STORE_WHATSAPP}


# ─── Audit Log ────────────────────────────────────────────────────────────────

@router.get("/audit")
async def get_audit_log(
    entity_type: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Audit trail of all stock changes."""
    since = datetime.utcnow() - timedelta(days=days)
    offset = (page - 1) * page_size

    query = select(AuditLog).where(
        and_(
            AuditLog.store_id == current_user.store_id,
            AuditLog.created_at >= since,
        )
    )
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)

    total = await db.scalar(
        select(func.count()).select_from(AuditLog).where(
            and_(
                AuditLog.store_id == current_user.store_id,
                AuditLog.created_at >= since,
            )
        )
    ) or 0

    result = await db.execute(
        query.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    )
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": str(l.id),
                "action": l.action,
                "entity_type": l.entity_type,
                "entity_name": l.entity_name,
                "user_name": l.user_name,
                "source": l.source,
                "old_value": l.old_value,
                "new_value": l.new_value,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ],
        "total": total,
        "page": page,
    }


# ─── Consultation stats for a single product ─────────────────────────────────

@router.get("/product/{product_id}/consultations")
async def get_product_consultations(
    product_id: UUID,
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Consultation history for a product."""
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(ProductConsultation)
        .where(
            and_(
                ProductConsultation.store_id == current_user.store_id,
                ProductConsultation.product_id == product_id,
                ProductConsultation.created_at >= since,
            )
        )
        .order_by(ProductConsultation.created_at.desc())
        .limit(100)
    )
    consultations = result.scalars().all()
    total = len(consultations)
    sales = sum(1 for c in consultations if c.resulted_in_sale)

    return {
        "total_consultas": total,
        "conversoes_vendas": sales,
        "taxa_conversao": round((sales / total * 100) if total else 0, 1),
        "historico": [
            {
                "customer": c.customer_phone,
                "channel": c.channel,
                "sale": c.resulted_in_sale,
                "date": c.created_at.isoformat(),
            }
            for c in consultations[:20]
        ],
    }

