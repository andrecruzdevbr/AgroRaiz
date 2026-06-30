"""
AgroRaiz - Celery App + All Tasks
Async processing: WhatsApp, Instagram, Campaigns, AI content generation.
"""
import asyncio
import json
from celery import Celery
from celery.utils.log import get_task_logger

from app.core.config import settings

logger = get_task_logger(__name__)

# ─── App ──────────────────────────────────────────────────────────────────────

celery_app = Celery(
    "agroraiz",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.celery_app.process_whatsapp_message": {"queue": "whatsapp"},
        "app.tasks.celery_app.process_instagram_message": {"queue": "whatsapp"},
        "app.tasks.celery_app.send_campaign_message": {"queue": "campaigns"},
        "app.tasks.celery_app.generate_ai_content": {"queue": "ai"},
        "app.tasks.celery_app.notify_human_team": {"queue": "whatsapp"},
        "app.tasks.celery_app.process_scheduled_campaigns": {"queue": "campaigns"},
    },
)

# Periodic tasks (Celery Beat)
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "check-scheduled-campaigns": {
        "task": "app.tasks.celery_app.process_scheduled_campaigns",
        "schedule": 60.0,
    },
    "refresh-dashboard-cache": {
        "task": "app.tasks.celery_app.refresh_dashboard_cache",
        "schedule": 300.0,
    },
    # Stock monitoring: every Sunday at 20h (for Monday delivery)
    "weekly-stock-summary": {
        "task": "app.tasks.celery_app.send_weekly_stock_summary",
        "schedule": crontab(hour=20, minute=0, day_of_week=0),  # Sunday 20h
    },
    # Monday morning report: every Monday at 8h
    "monday-report": {
        "task": "app.tasks.celery_app.generate_monday_report",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),  # Monday 8h
    },
    # Reset weekly consultation counters: every Sunday midnight
    "reset-weekly-consultations": {
        "task": "app.tasks.celery_app.reset_weekly_consultations",
        "schedule": crontab(hour=0, minute=0, day_of_week=0),
    },
    # Update confirmation status: twice daily
    "update-confirmation-status": {
        "task": "app.tasks.celery_app.update_confirmation_status",
        "schedule": crontab(hour="8,20", minute=0),
    },
}


# ─── Helper ──────────────────────────────────────────────────────────────────

def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─── WhatsApp Tasks ───────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.celery_app.process_whatsapp_message",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
)
def process_whatsapp_message(self, phone: str, message: str, store_id: str = None):
    """Process incoming WhatsApp message through AI pipeline."""
    try:
        async def _run():
            from app.core.redis_client import get_redis
            from app.core.database import AsyncSessionLocal
            from app.repositories.customer_repository import CustomerRepository
            from app.repositories.product_repository import ProductRepository
            from app.repositories.conversation_repository import ConversationRepository
            from app.services.ai.ai_service import AIService
            from app.services.whatsapp.whatsapp_service import WhatsAppService
            from app.core.websocket import ws_manager

            redis = await get_redis()

            # Resolve store_id (default to first store if not provided)
            resolved_store_id = store_id or await _get_default_store_id(redis)

            async with AsyncSessionLocal() as db:
                customer_repo = CustomerRepository(db)
                product_repo = ProductRepository(db)
                conv_repo = ConversationRepository(db)

                ai_service = AIService(redis, customer_repo, product_repo)
                wz_service = WhatsAppService(redis)

                # 1. Get/create customer
                from uuid import UUID
                customer, _ = await customer_repo.get_or_create_by_phone(
                    phone, UUID(resolved_store_id)
                )

                # 2. Get/create conversation
                conv, _ = await conv_repo.get_or_create_for_customer(
                    UUID(resolved_store_id), customer.id
                )

                # 3. Save inbound message
                from app.models.models import MessageSender
                msg = await conv_repo.add_message(
                    conv.id, message, MessageSender.CLIENTE
                )
                await db.commit()

                # 4. Process with AI
                result = await ai_service.process_whatsapp_message(
                    resolved_store_id, phone, message
                )

                action = result.get("action")
                response_text = result.get("message")

                if action == "respond" and response_text:
                    # Send reply
                    await wz_service.send_text(phone, response_text)

                    # Save AI message
                    ai_msg = await conv_repo.add_message(
                        conv.id, response_text, MessageSender.IA
                    )
                    await db.commit()

                    # Broadcast to dashboard
                    await ws_manager.broadcast_new_message(
                        resolved_store_id,
                        str(conv.id),
                        {
                            "id": str(ai_msg.id),
                            "conteudo": response_text,
                            "remetente": "ia",
                            "timestamp": ai_msg.created_at.isoformat(),
                        },
                    )

                elif action == "human_takeover" and response_text:
                    await wz_service.send_text(phone, response_text)

                    from app.models.models import ConversationStatus, AISession
                    await conv_repo.update_status(
                        conv.id,
                        ConversationStatus.AGUARDANDO_HUMANO,
                        motivo=result.get("reason"),
                    )

                    # Persist AI session record for analytics
                    from uuid import UUID as _UUID
                    ai_session = AISession(
                        store_id=_UUID(resolved_store_id),
                        customer_phone=phone,
                        conversation_id=conv.id,
                        total_messages=1,
                        human_takeover=True,
                        takeover_reason=result.get("reason"),
                        takeover_at=__import__("datetime").datetime.utcnow(),
                    )
                    db.add(ai_session)
                    await db.commit()

                    await ws_manager.broadcast_human_takeover(
                        resolved_store_id, phone, result.get("reason", "unknown")
                    )

                    notify_human_team.delay(
                        phone=phone,
                        store_id=resolved_store_id,
                        reason=result.get("reason"),
                        conversation_id=str(conv.id),
                    )

                logger.info(f"Processed WhatsApp message: {phone} → {action}")

        run_async(_run())

    except Exception as exc:
        logger.error(f"process_whatsapp_message failed: {exc}")
        raise self.retry(exc=exc)


async def _get_default_store_id(redis) -> str:
    cached = await redis.get("default_store_id")
    if cached:
        return cached
    from app.core.database import AsyncSessionLocal
    from app.models.models import Store
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Store).where(Store.active == True).limit(1))
        store = result.scalar_one_or_none()
        if store:
            await redis.setex("default_store_id", 3600, str(store.id))
            return str(store.id)
    raise ValueError("No active store found")


@celery_app.task(name="app.tasks.celery_app.notify_human_team")
def notify_human_team(
    phone: str, store_id: str, reason: str, conversation_id: str
):
    """Notify dashboard of human takeover via WebSocket + Redis."""
    from app.core.redis_client import get_redis_sync
    redis = get_redis_sync()

    notification = json.dumps({
        "type": "human_takeover",
        "phone": phone,
        "store_id": store_id,
        "reason": reason,
        "conversation_id": conversation_id,
        "priority": "high" if reason in ["frustrated", "requested"] else "normal",
    })
    redis.lpush(f"notifications:{store_id}", notification)
    redis.publish(f"dashboard:{store_id}", notification)
    logger.info(f"Human team notified: {phone} ({reason})")


# ─── Instagram Tasks ──────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.celery_app.process_instagram_message",
    bind=True,
    max_retries=3,
)
def process_instagram_message(self, sender_id: str, message: str):
    """Process incoming Instagram DM through AI pipeline."""
    try:
        async def _run():
            from app.core.redis_client import get_redis
            from app.services.instagram.instagram_service import InstagramService
            from app.services.ai.ai_service import AIService
            from app.core.database import AsyncSessionLocal
            from app.repositories.customer_repository import CustomerRepository
            from app.repositories.product_repository import ProductRepository

            redis = await get_redis()
            store_id = await _get_default_store_id(redis)

            async with AsyncSessionLocal() as db:
                customer_repo = CustomerRepository(db)
                product_repo = ProductRepository(db)
                ai_service = AIService(redis, customer_repo, product_repo)
                ig_service = InstagramService(redis)

                result = await ai_service.process_whatsapp_message(
                    store_id, f"ig:{sender_id}", message
                )

                if result.get("action") == "respond" and result.get("message"):
                    await ig_service.send_reply(sender_id, result["message"])
                    logger.info(f"IG replied to {sender_id}")

        run_async(_run())

    except Exception as exc:
        raise self.retry(exc=exc)


# ─── Campaign Tasks ───────────────────────────────────────────────────────────

@celery_app.task(
    name="app.tasks.celery_app.send_campaign_message",
    rate_limit="30/m",  # Max 30 messages/minute
)
def send_campaign_message(campaign_id: str, phone: str, message: str, delay: int = 0):
    """Send single campaign message. Rate-limited."""
    import time
    if delay:
        time.sleep(delay)

    async def _run():
        from app.core.redis_client import get_redis
        from app.services.whatsapp.whatsapp_service import WhatsAppService
        redis = await get_redis()
        wz = WhatsAppService(redis)
        await wz.send_text(phone, message, simulate_typing=True, delay_ms=2000)
        redis_sync = get_redis_sync_from_redis()
        redis_sync.lpush(f"campaign:{campaign_id}:sent", phone)
        logger.info(f"Campaign {campaign_id}: sent to {phone}")

    run_async(_run())


def get_redis_sync_from_redis():
    from app.core.redis_client import get_redis_sync
    return get_redis_sync()


@celery_app.task(name="app.tasks.celery_app.process_scheduled_campaigns")
def process_scheduled_campaigns():
    """Beat task: find and launch scheduled campaigns."""
    async def _run():
        from datetime import datetime
        from app.core.database import AsyncSessionLocal
        from app.repositories.campaign_repository import CampaignRepository
        from app.models.models import CampaignStatus

        async with AsyncSessionLocal() as db:
            repo = CampaignRepository(db)
            due = await repo.get_scheduled(until=datetime.utcnow())

            for campaign in due:
                recipients = await repo.resolve_recipients(
                    campaign.store_id, campaign.segmento or {}
                )
                # Update campaign status
                campaign.status = CampaignStatus.ATIVA
                campaign.data_inicio = datetime.utcnow()
                campaign.total_destinatarios = len(recipients)
                await db.commit()

                # Queue individual sends with delay between each
                for i, customer in enumerate(recipients):
                    if not customer.phone:
                        continue
                    send_campaign_message.apply_async(
                        kwargs={
                            "campaign_id": str(campaign.id),
                            "phone": customer.phone,
                            "message": campaign.mensagem,
                            "delay": i * 3,  # 3s between messages
                        },
                        countdown=i * 3,
                    )

                logger.info(
                    f"Campaign launched: {campaign.nome} → {len(recipients)} recipients"
                )

    run_async(_run())


# ─── AI Content Tasks ─────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.celery_app.generate_ai_content")
def generate_ai_content(
    store_id: str,
    content_type: str,
    topic: str = None,
    season: str = None,
):
    """Generate social media content via AI. Result stored in Redis."""
    async def _run():
        from app.core.redis_client import get_redis
        from app.services.ai.ai_service import AIService

        redis = await get_redis()
        ai = AIService(redis, None, None)
        result = await ai.generate_social_content(content_type, topic, season)

        cache_key = f"ai:content:{store_id}:{content_type}:latest"
        import json
        await redis.setex(cache_key, 3600, json.dumps(result))

        logger.info(f"AI content generated: {content_type}")
        return result

    return run_async(_run())


# ─── Cache Tasks ──────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.celery_app.refresh_dashboard_cache")
def refresh_dashboard_cache():
    """Pre-warm dashboard metrics cache."""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.models import Store
        from sqlalchemy import select
        from app.core.redis_client import get_redis

        redis = await get_redis()

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Store).where(Store.active == True))
            stores = result.scalars().all()

            for store in stores:
                # Trigger metrics calculation and cache
                cache_key = f"dashboard:metrics:{store.id}:30d"
                if not await redis.get(cache_key):
                    logger.info(f"Cache miss for store {store.id}, will compute on next request")

    run_async(_run())


# ─── Stock Monitoring Tasks ──────────────────────────────────────────────────

@celery_app.task(name="app.tasks.celery_app.send_weekly_stock_summary")
def send_weekly_stock_summary():
    """
    Every Sunday 20h: generate weekly summary and send to admin WhatsApp.
    Admin can reply: 1=all ok / 2=update / 3=details
    """
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.core.redis_client import get_redis
        from app.services.stock_monitoring_service import StockMonitoringService
        from app.services.whatsapp.whatsapp_service import WhatsAppService
        from app.models.models import Store
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            stores = await db.execute(select(Store).where(Store.active == True))
            for store in stores.scalars().all():
                try:
                    svc = StockMonitoringService(db)
                    report = await svc.generate_weekly_summary(store.id)
                    await db.commit()

                    redis = await get_redis()
                    wz = WhatsAppService(redis)

                    # Send to store WhatsApp admin number
                    admin_phone = store.whatsapp or settings.STORE_WHATSAPP
                    await wz.send_text(
                        phone=admin_phone,
                        message=report["whatsapp_message"],
                        simulate_typing=False,
                    )

                    # Store pending confirmation in Redis (awaiting admin reply)
                    await redis.setex(
                        f"stock:pending_admin_reply:{store.id}",
                        86400 * 2,  # 48h window to reply
                        "weekly_summary",
                    )
                    logger.info("weekly_summary_sent", store=store.name)
                except Exception as e:
                    logger.error("weekly_summary_failed", store=store.name, error=str(e))

    run_async(_run())


@celery_app.task(name="app.tasks.celery_app.generate_monday_report")
def generate_monday_report():
    """
    Every Monday 8h: generate full weekly report for admin dashboard.
    """
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.services.stock_monitoring_service import StockMonitoringService
        from app.models.models import Store
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            stores = await db.execute(select(Store).where(Store.active == True))
            for store in stores.scalars().all():
                try:
                    svc = StockMonitoringService(db)
                    await svc.generate_weekly_summary(store.id)
                    await db.commit()
                    logger.info("monday_report_generated", store=store.name)
                except Exception as e:
                    logger.error("monday_report_failed", store=store.name, error=str(e))

    run_async(_run())


@celery_app.task(name="app.tasks.celery_app.reset_weekly_consultations")
def reset_weekly_consultations():
    """Every Sunday midnight: reset consultas_semana counter on all products."""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.models import Product
        from sqlalchemy import update

        async with AsyncSessionLocal() as db:
            await db.execute(update(Product).values(consultas_semana=0))
            await db.commit()
            logger.info("weekly_consultations_reset")

    run_async(_run())


@celery_app.task(name="app.tasks.celery_app.update_confirmation_status")
def update_confirmation_status():
    """
    Twice daily: mark products as CRITICO if >30 days unconfirmed.
    """
    async def _run():
        from datetime import datetime, timedelta
        from app.core.database import AsyncSessionLocal
        from app.models.models import Product, ConfirmacaoStatus
        from sqlalchemy import update, and_

        cutoff = datetime.utcnow() - timedelta(days=30)

        async with AsyncSessionLocal() as db:
            # Mark critical: >30 days or never confirmed
            await db.execute(
                update(Product)
                .where(
                    (Product.data_ultima_confirmacao == None)
                    | (Product.data_ultima_confirmacao < cutoff)
                )
                .where(Product.ativo == True)
                .values(status_confirmacao=ConfirmacaoStatus.CRITICO)
            )
            # Mark confirmed: confirmed within 30 days
            await db.execute(
                update(Product)
                .where(
                    and_(
                        Product.data_ultima_confirmacao >= cutoff,
                        Product.ativo == True,
                    )
                )
                .values(status_confirmacao=ConfirmacaoStatus.CONFIRMADO)
            )
            await db.commit()
            logger.info("confirmation_status_updated")

    run_async(_run())


@celery_app.task(name="app.tasks.celery_app.process_admin_stock_reply")
def process_admin_stock_reply(store_id: str, phone: str, message: str):
    """
    Process admin WhatsApp reply to weekly stock summary.
    Called by process_whatsapp_message when sender is admin.
    """
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.core.redis_client import get_redis
        from app.services.stock_monitoring_service import StockMonitoringService
        from app.services.whatsapp.whatsapp_service import WhatsAppService
        from uuid import UUID

        async with AsyncSessionLocal() as db:
            redis = await get_redis()

            # Check if this is a pending admin reply
            pending = await redis.get(f"stock:pending_admin_reply:{store_id}")
            if not pending:
                return  # Not an admin stock reply

            svc = StockMonitoringService(db)
            result = await svc.interpret_admin_response(
                message=message,
                store_id=UUID(store_id),
                admin_phone=phone,
            )
            await db.commit()

            response_msg = result.get("response_message")
            if response_msg:
                wz = WhatsAppService(redis)
                await wz.send_text(phone=phone, message=response_msg, simulate_typing=False)

            # Clear pending if confirmed
            if result["action"] in ("confirmed_all", "details_sent"):
                await redis.delete(f"stock:pending_admin_reply:{store_id}")

            logger.info(
                "admin_stock_reply_processed",
                action=result["action"],
                store=store_id,
            )

    run_async(_run())
