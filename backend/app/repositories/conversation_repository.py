"""
AgroRaiz - Conversation Repository
Chat queries for WhatsApp and Instagram conversations.
"""
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    Conversation, ConversationStatus, ConversationChannel,
    Message, MessageSender, Customer,
)
from app.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):

    def __init__(self, db: AsyncSession):
        super().__init__(Conversation, db)

    async def get_with_customer(self, id: UUID, store_id: UUID) -> Optional[Conversation]:
        result = await self.db.execute(
            select(Conversation)
            .options(selectinload(Conversation.customer))
            .where(
                Conversation.id == id,
                Conversation.store_id == store_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_active(
        self,
        store_id: UUID,
        status: str = None,
        canal: str = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[List[Conversation], int]:
        query = (
            select(Conversation)
            .options(selectinload(Conversation.customer))
            .where(Conversation.store_id == store_id)
        )
        count_q = select(func.count()).select_from(Conversation).where(
            Conversation.store_id == store_id
        )

        if status:
            query = query.where(Conversation.status == status)
            count_q = count_q.where(Conversation.status == status)
        if canal:
            query = query.where(Conversation.channel == canal)
            count_q = count_q.where(Conversation.channel == canal)

        total = await self.db.scalar(count_q)

        # Sort: human_needed first, then by updated_at
        result = await self.db.execute(
            query
            .order_by(
                (Conversation.status == ConversationStatus.AGUARDANDO_HUMANO).desc(),
                Conversation.updated_at.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
        return result.scalars().all(), total or 0

    async def get_or_create_for_customer(
        self,
        store_id: UUID,
        customer_id: UUID,
        channel: ConversationChannel = ConversationChannel.WHATSAPP,
    ) -> tuple[Conversation, bool]:
        # Find open conversation
        result = await self.db.execute(
            select(Conversation).where(
                and_(
                    Conversation.store_id == store_id,
                    Conversation.customer_id == customer_id,
                    Conversation.channel == channel,
                    Conversation.status != ConversationStatus.FINALIZADA,
                )
            )
            .order_by(Conversation.created_at.desc())
            .limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing, False

        new_conv = await self.create(
            store_id=store_id,
            customer_id=customer_id,
            channel=channel,
            status=ConversationStatus.IA,
        )
        return new_conv, True

    async def add_message(
        self,
        conversation_id: UUID,
        conteudo: str,
        remetente: MessageSender,
        tipo: str = "texto",
        external_id: str = None,
        extra_data: dict = None,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            conteudo=conteudo,
            remetente=remetente,
            tipo=tipo,
            external_id=external_id,
            extra_data=extra_data or {},
        )
        self.db.add(msg)
        # Update conversation timestamp
        await self.db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(updated_at=datetime.utcnow())
        )
        await self.db.flush()
        return msg

    async def get_messages(
        self, conversation_id: UUID, limit: int = 50
    ) -> List[Message]:
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        return list(reversed(result.scalars().all()))

    async def update_status(
        self,
        conversation_id: UUID,
        status: ConversationStatus,
        motivo: str = None,
        assigned_to: UUID = None,
    ) -> None:
        values: dict = {"status": status, "updated_at": datetime.utcnow()}
        if motivo:
            values["motivo_transferencia"] = motivo
        if assigned_to:
            values["assigned_to"] = assigned_to
        if status == ConversationStatus.FINALIZADA:
            values["resolved_at"] = datetime.utcnow()
        await self.db.execute(
            update(Conversation).where(Conversation.id == conversation_id).values(**values)
        )

    async def get_stats(self, store_id: UUID, since: datetime) -> dict:
        base = and_(
            Conversation.store_id == store_id,
            Conversation.created_at >= since,
        )
        total = await self.db.scalar(
            select(func.count()).select_from(Conversation).where(base)
        )
        ia = await self.db.scalar(
            select(func.count()).select_from(Conversation).where(
                and_(base, Conversation.assigned_to == None,
                     Conversation.status == ConversationStatus.FINALIZADA)
            )
        )
        humano = await self.db.scalar(
            select(func.count()).select_from(Conversation).where(
                and_(base, Conversation.status == ConversationStatus.AGUARDANDO_HUMANO)
            )
        )
        return {
            "total": total or 0,
            "ia_resolvidas": ia or 0,
            "aguardando_humano": humano or 0,
        }
