"""
AgroRaiz - Dashboard Endpoints
Real-time KPIs, analytics and activity feed.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    Customer, Order, Conversation, Product,
    ConversationStatus, AISession, Campaign, CampaignStatus,
)
from app.repositories.customer_repository import SYSTEM_CUSTOMER_PHONE

router = APIRouter()


@router.get("/metrics")
async def get_metrics(
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    store_id = current_user.store_id
    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    since = datetime.utcnow() - timedelta(days=days)
    prev_since = since - timedelta(days=days)

    def trend(curr, prev) -> float:
        if not prev:
            return 100.0 if curr else 0.0
        return round(((curr - prev) / prev) * 100, 1)

    # ─── Customers (exclui Consumidor final — vínculo técnico de balcão) ─────
    crm_filter = Customer.phone != SYSTEM_CUSTOMER_PHONE
    total_customers = await db.scalar(
        select(func.count(Customer.id)).where(
            and_(Customer.store_id == store_id, crm_filter)
        )
    ) or 0

    new_customers = await db.scalar(
        select(func.count(Customer.id)).where(
            and_(Customer.store_id == store_id, Customer.created_at >= since, crm_filter)
        )
    ) or 0

    prev_new_customers = await db.scalar(
        select(func.count(Customer.id)).where(
            and_(
                Customer.store_id == store_id,
                Customer.created_at >= prev_since,
                Customer.created_at < since,
                crm_filter,
            )
        )
    ) or 0

    # ─── Revenue ─────────────────────────────────────────────────────────────
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            and_(Order.store_id == store_id, Order.created_at >= since)
        )
    ) or 0.0

    prev_revenue = await db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            and_(
                Order.store_id == store_id,
                Order.created_at >= prev_since,
                Order.created_at < since,
            )
        )
    ) or 0.0

    orders_count = await db.scalar(
        select(func.count(Order.id)).where(
            and_(Order.store_id == store_id, Order.created_at >= since)
        )
    ) or 0

    avg_ticket = round(revenue / orders_count, 2) if orders_count else 0.0

    # ─── Conversations ────────────────────────────────────────────────────────
    total_conv = await db.scalar(
        select(func.count(Conversation.id)).where(
            and_(Conversation.store_id == store_id, Conversation.created_at >= since)
        )
    ) or 0

    ai_resolved = await db.scalar(
        select(func.count(Conversation.id)).where(
            and_(
                Conversation.store_id == store_id,
                Conversation.created_at >= since,
                Conversation.assigned_to == None,
                Conversation.status == ConversationStatus.FINALIZADA,
            )
        )
    ) or 0

    human_takeovers = await db.scalar(
        select(func.count(AISession.id)).where(
            and_(
                AISession.store_id == store_id,
                AISession.created_at >= since,
                AISession.human_takeover == True,
            )
        )
    ) or 0

    awaiting_human = await db.scalar(
        select(func.count(Conversation.id)).where(
            and_(
                Conversation.store_id == store_id,
                Conversation.status == ConversationStatus.AGUARDANDO_HUMANO,
            )
        )
    ) or 0

    ai_resolution_rate = round((ai_resolved / total_conv * 100) if total_conv else 0, 1)

    # ─── Inventory ────────────────────────────────────────────────────────────
    total_products = await db.scalar(
        select(func.count(Product.id)).where(
            and_(Product.store_id == store_id, Product.ativo == True)
        )
    ) or 0

    low_stock_count = await db.scalar(
        select(func.count(Product.id)).where(
            and_(
                Product.store_id == store_id,
                Product.ativo == True,
                Product.estoque <= Product.estoque_minimo,
            )
        )
    ) or 0

    out_of_stock = await db.scalar(
        select(func.count(Product.id)).where(
            and_(
                Product.store_id == store_id,
                Product.ativo == True,
                Product.estoque == 0,
            )
        )
    ) or 0

    # ─── Campaigns ────────────────────────────────────────────────────────────
    active_campaigns = await db.scalar(
        select(func.count(Campaign.id)).where(
            and_(
                Campaign.store_id == store_id,
                Campaign.status == CampaignStatus.ATIVA,
            )
        )
    ) or 0

    scheduled_campaigns = await db.scalar(
        select(func.count(Campaign.id)).where(
            and_(
                Campaign.store_id == store_id,
                Campaign.status == CampaignStatus.AGENDADA,
            )
        )
    ) or 0

    draft_campaigns = await db.scalar(
        select(func.count(Campaign.id)).where(
            and_(
                Campaign.store_id == store_id,
                Campaign.status == CampaignStatus.RASCUNHO,
            )
        )
    ) or 0

    open_conversations = await db.scalar(
        select(func.count(Conversation.id)).where(
            and_(
                Conversation.store_id == store_id,
                Conversation.status != ConversationStatus.FINALIZADA,
            )
        )
    ) or 0

    return {
        "period": period,
        "generated_at": datetime.utcnow().isoformat(),
        "customers": {
            "total": total_customers,
            "new": new_customers,
            "trend": trend(new_customers, prev_new_customers),
        },
        "revenue": {
            "total": round(revenue, 2),
            "prev": round(prev_revenue, 2),
            "trend": trend(revenue, prev_revenue),
            "orders": orders_count,
            "avg_ticket": avg_ticket,
        },
        "conversations": {
            "total": total_conv,
            "open": open_conversations,
            "ai_resolved": ai_resolved,
            "human_takeovers": human_takeovers,
            "awaiting_human": awaiting_human,
            "ai_resolution_rate": ai_resolution_rate,
            "hours_saved": round(ai_resolved * 3 / 60, 1),
        },
        "inventory": {
            "total": total_products,
            "low_stock": low_stock_count,
            "out_of_stock": out_of_stock,
        },
        "campaigns": {
            "active": active_campaigns,
            "scheduled": scheduled_campaigns,
            "draft": draft_campaigns,
            "pending": scheduled_campaigns + draft_campaigns,
        },
    }


@router.get("/activity")
async def get_activity(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Live feed of conversations needing attention."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.customer))
        .where(
            and_(
                Conversation.store_id == current_user.store_id,
                Conversation.status.in_([
                    ConversationStatus.AGUARDANDO_HUMANO,
                    ConversationStatus.HUMANO,
                ]),
            )
        )
        .order_by(
            (Conversation.status == ConversationStatus.AGUARDANDO_HUMANO).desc(),
            Conversation.updated_at.desc(),
        )
        .limit(limit)
    )
    conversations = result.scalars().all()

    return {
        "active_conversations": [
            {
                "id": str(c.id),
                "status": c.status.value,
                "prioridade": c.prioridade.value,
                "motivo_transferencia": c.motivo_transferencia,
                "cliente": {
                    "nome": c.customer.name if c.customer else None,
                    "telefone": c.customer.phone if c.customer else None,
                } if c.customer else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in conversations
        ],
        "total": len(conversations),
    }


@router.get("/charts/sales")
async def get_sales_chart(
    period: str = Query("30d"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Daily sales chart data."""
    from sqlalchemy import cast, Date

    days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
    since = datetime.utcnow() - timedelta(days=days)

    result = await db.execute(
        select(
            cast(Order.created_at, Date).label("data"),
            func.count(Order.id).label("pedidos"),
            func.coalesce(func.sum(Order.total), 0).label("valor"),
        )
        .where(
            and_(Order.store_id == current_user.store_id, Order.created_at >= since)
        )
        .group_by(cast(Order.created_at, Date))
        .order_by(cast(Order.created_at, Date))
    )

    return {
        "data": [
            {
                "data": str(row.data),
                "pedidos": row.pedidos,
                "valor": round(float(row.valor), 2),
            }
            for row in result
        ]
    }


@router.get("/charts/categories")
async def get_category_chart(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Products by category."""
    from app.repositories.product_repository import ProductRepository
    repo = ProductRepository(db)
    return await repo.get_category_stats(current_user.store_id)


@router.get("/system/health")
async def get_system_health(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    System healthcheck for the admin dashboard.
    Returns status of AI provider, WhatsApp, Instagram, DB, Redis.
    """
    from app.core.redis_client import get_redis
    from app.services.ai.providers.provider import get_provider_status
    from app.services.whatsapp.whatsapp_service import WhatsAppService

    redis = await get_redis()

    # AI Provider
    ai_status = get_provider_status()

    # WhatsApp
    try:
        wz = WhatsAppService(redis)
        wz_data = await wz.get_status()
        wz_state = wz_data.get("connection", "unknown")
        wz_ok = wz_state == "open"
    except Exception as e:
        wz_state = "error"
        wz_ok = False

    # Database
    try:
        await db.execute(__import__("sqlalchemy", fromlist=["text"]).text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    # Redis
    try:
        await redis.ping()
        redis_ok = True
    except Exception:
        redis_ok = False

    # Last AI error from Redis
    last_error = await redis.get("ai:last_error")

    return {
        "ai": {
            **ai_status,
            "healthy": ai_status.get("key_set", False),
        },
        "whatsapp": {
            "state": wz_state,
            "healthy": wz_ok,
            "instance": __import__("app.core.config", fromlist=["settings"]).settings.EVOLUTION_INSTANCE_NAME,
        },
        "instagram": {
            "configured": bool(__import__("app.core.config", fromlist=["settings"]).settings.INSTAGRAM_ACCESS_TOKEN),
            "healthy": bool(__import__("app.core.config", fromlist=["settings"]).settings.INSTAGRAM_ACCESS_TOKEN),
        },
        "database": {"healthy": db_ok},
        "redis": {"healthy": redis_ok},
        "last_ai_error": last_error,
    }
