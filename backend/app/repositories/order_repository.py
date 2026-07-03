"""
Order repository for admin AI sales.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Order, OrderItem, OrderStatus
from app.repositories.base import BaseRepository


CONSUMIDOR_FINAL_PHONE = "_consumidor_final"


class OrderRepository(BaseRepository[Order]):

    def __init__(self, db: AsyncSession):
        super().__init__(Order, db)

    async def get_with_items(self, order_id: UUID, store_id: UUID) -> Optional[Order]:
        result = await self.db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_id, Order.store_id == store_id)
        )
        return result.scalar_one_or_none()

    async def create_sale(
        self,
        *,
        store_id: UUID,
        customer_id: UUID,
        items: list[dict],
        total: float,
        canal_origem: str,
        forma_pagamento: str | None,
        status: OrderStatus,
        observacoes: str,
    ) -> Order:
        subtotal = total
        order = Order(
            store_id=store_id,
            customer_id=customer_id,
            status=status,
            subtotal=subtotal,
            desconto=0.0,
            total=total,
            forma_pagamento=forma_pagamento,
            canal_origem=canal_origem,
            observacoes=observacoes,
        )
        self.db.add(order)
        await self.db.flush()

        for item in items:
            self.db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=item["product_id"],
                    nome_produto=item["nome_produto"],
                    quantidade=item["quantidade"],
                    preco_unitario=item["preco_unitario"],
                    desconto=0.0,
                    subtotal=item["subtotal"],
                )
            )
        await self.db.flush()
        await self.db.refresh(order)
        return order
