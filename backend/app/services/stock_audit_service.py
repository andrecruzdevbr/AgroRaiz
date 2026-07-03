"""
AgroRaiz - Stock audit helper for manual inventory adjustments.
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AuditLog


async def write_stock_audit(
    db: AsyncSession,
    *,
    store_id: UUID,
    user_id: UUID,
    user_name: str,
    product_id: UUID,
    product_name: str,
    action: str,
    old_stock: int,
    new_stock: int,
    operation: str,
    quantity: int,
    motivo: str,
) -> None:
    log = AuditLog(
        store_id=store_id,
        user_id=user_id,
        user_name=user_name,
        action=action,
        entity_type="product",
        entity_id=str(product_id),
        entity_name=product_name,
        old_value={"estoque": old_stock},
        new_value={
            "estoque": new_stock,
            "operation": operation,
            "quantity": quantity,
            "motivo": motivo,
        },
        source="manual",
    )
    db.add(log)
