"""
AgroRaiz - Customer Repository
CRM-specific queries on top of base CRUD.
"""
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, func, and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Customer, CustomerInteraction, CustomerStatus
from app.repositories.base import BaseRepository

# Cliente técnico para vendas de balcão sem identificação — não é lead CRM
SYSTEM_CUSTOMER_PHONE = "_consumidor_final"


def _exclude_system_customer(query):
    return query.where(Customer.phone != SYSTEM_CUSTOMER_PHONE)


class CustomerRepository(BaseRepository[Customer]):

    def __init__(self, db: AsyncSession):
        super().__init__(Customer, db)

    async def count(self, store_id: UUID, **filters) -> int:
        query = _exclude_system_customer(
            select(func.count()).select_from(Customer).where(
                Customer.store_id == store_id
            )
        )
        for key, value in filters.items():
            if value is not None and hasattr(Customer, key):
                query = query.where(getattr(Customer, key) == value)
        return await self.db.scalar(query) or 0

    async def get_by_phone(self, phone: str, store_id: UUID) -> Optional[Customer]:
        result = await self.db.execute(
            select(Customer).where(
                Customer.phone == phone,
                Customer.store_id == store_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_or_create_by_phone(
        self, phone: str, store_id: UUID, name: str = None
    ) -> tuple[Customer, bool]:
        customer = await self.get_by_phone(phone, store_id)
        if customer:
            return customer, False

        customer = await self.create(
            phone=phone,
            store_id=store_id,
            name=name or phone,
            ultimo_contato=datetime.utcnow(),
        )
        return customer, True

    async def search(
        self,
        store_id: UUID,
        busca: str = "",
        status: str = None,
        frequencia: str = None,
        tags: List[str] = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[List[Customer], int]:
        query = select(Customer).where(Customer.store_id == store_id)
        count_query = select(func.count()).select_from(Customer).where(
            Customer.store_id == store_id
        )
        query = _exclude_system_customer(query)
        count_query = _exclude_system_customer(count_query)

        if busca:
            search_filter = or_(
                Customer.name.ilike(f"%{busca}%"),
                Customer.phone.ilike(f"%{busca}%"),
                Customer.email.ilike(f"%{busca}%"),
            )
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)

        if status:
            query = query.where(Customer.status == status)
            count_query = count_query.where(Customer.status == status)

        if frequencia:
            query = query.where(Customer.frequencia == frequencia)
            count_query = count_query.where(Customer.frequencia == frequencia)

        total = await self.db.scalar(count_query)
        query = query.order_by(Customer.updated_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all(), total or 0

    async def get_inactive(
        self, store_id: UUID, days_threshold: int = 60
    ) -> List[Customer]:
        cutoff = datetime.utcnow() - timedelta(days=days_threshold)
        result = await self.db.execute(
            _exclude_system_customer(
                select(Customer).where(
                    and_(
                        Customer.store_id == store_id,
                        Customer.status == CustomerStatus.ATIVO,
                        or_(
                            Customer.ultimo_contato < cutoff,
                            Customer.ultimo_contato == None,
                        ),
                    )
                )
            )
        )
        return result.scalars().all()

    async def update_after_purchase(
        self, customer_id: UUID, order_total: float
    ) -> None:
        await self.db.execute(
            update(Customer)
            .where(Customer.id == customer_id)
            .values(
                total_compras=Customer.total_compras + 1,
                valor_total_gasto=Customer.valor_total_gasto + order_total,
                ultima_compra=datetime.utcnow(),
            )
        )

    async def add_interaction(
        self,
        customer_id: UUID,
        tipo: str,
        resumo: str,
        sentimento: str = "neutro",
        atendido_por: str = "ia",
        ai_response: str = None,
    ) -> CustomerInteraction:
        interaction = CustomerInteraction(
            customer_id=customer_id,
            tipo=tipo,
            resumo=resumo,
            sentimento=sentimento,
            atendido_por=atendido_por,
            ai_response=ai_response,
        )
        self.db.add(interaction)
        await self.db.flush()
        return interaction

    async def get_analytics(self, store_id: UUID) -> dict:
        total = await self.count(store_id)
        novos = await self.count(store_id, frequencia="novo")
        vip = await self.count(store_id, frequencia="vip")

        start_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
        result = await self.db.scalar(
            _exclude_system_customer(
                select(func.count()).select_from(Customer).where(
                    and_(
                        Customer.store_id == store_id,
                        Customer.created_at >= start_month,
                    )
                )
            )
        )

        return {
            "total": total,
            "novos": novos,
            "vip": vip,
            "novos_mes": result or 0,
        }
