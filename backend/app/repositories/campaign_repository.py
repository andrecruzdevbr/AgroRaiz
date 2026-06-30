"""
AgroRaiz - Campaign Repository
"""
from datetime import datetime
from typing import List
from uuid import UUID

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Campaign, CampaignStatus, Customer
from app.repositories.base import BaseRepository


class CampaignRepository(BaseRepository[Campaign]):

    def __init__(self, db: AsyncSession):
        super().__init__(Campaign, db)

    async def get_scheduled(self, until: datetime) -> List[Campaign]:
        """Find campaigns scheduled to run before `until`."""
        result = await self.db.execute(
            select(Campaign).where(
                and_(
                    Campaign.status == CampaignStatus.AGENDADA,
                    Campaign.agendado_para <= until,
                )
            )
        )
        return result.scalars().all()

    async def resolve_recipients(
        self, store_id: UUID, segmento: dict
    ) -> List[Customer]:
        """Return customers matching campaign segment criteria."""
        from sqlalchemy import cast, String
        query = select(Customer).where(
            and_(Customer.store_id == store_id, Customer.whatsapp_opt_in == True)
        )

        if frequencias := segmento.get("frequencia"):
            query = query.where(Customer.frequencia.in_(frequencias))

        if valor_min := segmento.get("valorMinimoGasto"):
            query = query.where(Customer.valor_total_gasto >= valor_min)

        if tags := segmento.get("tags"):
            # JSON contains check
            for tag in tags:
                query = query.where(
                    Customer.tags.cast(String).contains(tag)
                )

        result = await self.db.execute(query)
        return result.scalars().all()

    async def update_metrics(self, campaign_id: UUID, **metrics) -> None:
        await self.db.execute(
            update(Campaign).where(Campaign.id == campaign_id).values(**metrics)
        )
