"""
Admin AI Management Assistant endpoints.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.admin_ai import service as admin_ai_service

router = APIRouter()


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    selection_index: Optional[int] = Field(None, ge=1, le=20)


class SelectRequest(BaseModel):
    selection_index: int = Field(..., ge=1, le=20)


@router.get("/history")
async def get_chat_history(
    current_user=Depends(get_current_user),
):
    return await admin_ai_service.get_history(current_user.store_id, current_user.id)


@router.post("/chat")
async def chat(
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        result = await admin_ai_service.process_message(
            db,
            store_id=current_user.store_id,
            user_id=current_user.id,
            user_name=current_user.name,
            role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
            message=body.message,
            selection_index=body.selection_index,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Erro no assistente: {str(e)}") from e


@router.post("/confirm")
async def confirm_action(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    result = await admin_ai_service.confirm_pending(
        db,
        store_id=current_user.store_id,
        user_id=current_user.id,
        user_name=current_user.name,
        role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
    )
    return result


@router.post("/cancel")
async def cancel_action(
    current_user=Depends(get_current_user),
):
    return await admin_ai_service.cancel_pending(current_user.store_id, current_user.id)


@router.post("/reset")
async def reset_chat(
    current_user=Depends(get_current_user),
):
    return await admin_ai_service.reset_session(current_user.store_id, current_user.id)


@router.post("/select")
async def select_product(
    body: SelectRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await admin_ai_service.process_message(
        db,
        store_id=current_user.store_id,
        user_id=current_user.id,
        user_name=current_user.name,
        role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        message=str(body.selection_index),
        selection_index=body.selection_index,
    )
    return result
