"""
Audit helper for admin AI actions.
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AuditLog


async def write_admin_ai_audit(
    db: AsyncSession,
    *,
    store_id: UUID,
    user_id: UUID,
    user_name: str,
    action: str,
    entity_type: str,
    entity_id: str,
    entity_name: str,
    old_value: Optional[dict[str, Any]],
    new_value: dict[str, Any],
    original_message: str = "",
    motivo: str = "",
) -> None:
    payload = {
        **new_value,
        "origem": "admin_ai",
        "mensagem_original": original_message,
        "motivo": motivo,
        "confirmado": True,
    }
    log = AuditLog(
        store_id=store_id,
        user_id=user_id,
        user_name=user_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        old_value=old_value,
        new_value=payload,
        source="ai",
    )
    db.add(log)
