"""
Admin AI orchestrator — chat, confirm, cancel, select, undo.
"""
from __future__ import annotations

import re
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import get_redis
from app.core.security import sanitize_user_input
from app.services.admin_ai import session_store
from app.services.admin_ai.executor import execute_action, undo_action
from app.services.admin_ai.intent_parser import parse_intent
from app.services.admin_ai.preparer import prepare_from_intent


def _can_mutate(role: str) -> bool:
    return role in ("owner", "admin")


async def process_message(
    db: AsyncSession,
    *,
    store_id: UUID,
    user_id: UUID,
    user_name: str,
    role: str,
    message: str,
    selection_index: Optional[int] = None,
) -> dict[str, Any]:
    redis = await get_redis()
    text = sanitize_user_input(message.strip())
    if not text:
        raise HTTPException(400, "Mensagem vazia")

    session = await session_store.load_session(redis, store_id, user_id)
    messages = session.get("messages", [])
    messages.append({"role": "user", "content": text})

    # Handle explicit confirm/cancel in chat
    tl = text.lower()
    pending = await session_store.load_pending(redis, store_id, user_id)
    if pending and re.match(r"^(sim|confirmo|confirmar|ok|pode)$", tl):
        if not _can_mutate(role):
            raise HTTPException(403, "Apenas administradores podem confirmar alterações")
        result = await confirm_pending(db, store_id=store_id, user_id=user_id, user_name=user_name, role=role)
        messages.append({"role": "assistant", "content": result["message"]})
        session["messages"] = messages[-30:]
        await session_store.save_session(redis, store_id, user_id, session)
        return result

    if pending and re.match(r"^(não|nao|cancelar|cancela)$", tl):
        await session_store.clear_pending(redis, store_id, user_id)
        for key in (
            "awaiting_reason",
            "reason_for_intent",
            "awaiting_selection",
            "selection_intent",
            "selection_candidates",
            "selected_product_id",
        ):
            session.pop(key, None)
        reply = "Ação cancelada. Nada foi alterado."
        messages.append({"role": "assistant", "content": reply})
        session["messages"] = messages[-30:]
        await session_store.save_session(redis, store_id, user_id, session)
        return {"response_type": "message", "message": reply, "pending_action": None}

    # Awaiting reason from previous turn
    if session.get("awaiting_reason"):
        intent_data = session.pop("awaiting_reason")
        intent_data["intent"] = session.pop("reason_for_intent", intent_data.get("intent"))
        result = await prepare_from_intent(
            db, store_id, intent_data, motivo=text,
            selected_product_id=session.pop("selected_product_id", None),
        )
        return await _finalize_turn(redis, db, store_id, user_id, user_name, role, messages, session, result)

    # Product selection
    if session.get("awaiting_selection") or selection_index:
        intent_data = session.get("selection_intent") or {}
        candidates = session.get("selection_candidates") or []
        idx = selection_index
        if idx is None:
            m = re.match(r"^(\d+)$", text.strip())
            idx = int(m.group(1)) if m else None
        if not idx or idx < 1 or idx > len(candidates):
            reply = "Informe o número da opção listada (ex: 1, 2, 3)."
            messages.append({"role": "assistant", "content": reply})
            session["messages"] = messages[-30:]
            await session_store.save_session(redis, store_id, user_id, session)
            return {"response_type": "message", "message": reply}
        selected_id = candidates[idx - 1]["id"]
        session.pop("awaiting_selection", None)
        session.pop("selection_intent", None)
        session.pop("selection_candidates", None)
        result = await prepare_from_intent(
            db, store_id, intent_data, selected_product_id=selected_id,
        )
        return await _finalize_turn(redis, db, store_id, user_id, user_name, role, messages, session, result)

    # Undo
    if re.search(r"\b(desfazer|desfaça)\b", tl):
        if not _can_mutate(role):
            raise HTTPException(403, "Apenas administradores podem desfazer ações")
        undo_record = await session_store.pop_undo(redis, store_id, user_id)
        if not undo_record:
            reply = "Não há ação recente para desfazer."
        else:
            out = await undo_action(
                db, store_id=store_id, user_id=user_id, user_name=user_name, undo_record=undo_record,
            )
            await db.commit()
            reply = out["message"]
        messages.append({"role": "assistant", "content": reply})
        session["messages"] = messages[-30:]
        await session_store.save_session(redis, store_id, user_id, session)
        return {"response_type": "message", "message": reply}

    intent_data = await parse_intent(text)
    intent = intent_data.get("intent", "geral")

    if intent in (
        "reposicao", "venda_balcao", "venda_entrega", "correcao_estoque",
        "saida_estoque", "cadastro_produto", "alteracao_produto",
    ) and not _can_mutate(role):
        raise HTTPException(403, "Seu perfil só pode consultar. Alterações exigem perfil administrador.")

    result = await prepare_from_intent(db, store_id, intent_data)
    return await _finalize_turn(redis, db, store_id, user_id, user_name, role, messages, session, result)


async def _finalize_turn(redis, db, store_id, user_id, user_name, role, messages, session, result) -> dict:
    rtype = result.get("response_type")

    if rtype == "reason_required":
        session["awaiting_reason"] = result.get("intent_data", {})
        session["reason_for_intent"] = result.get("pending_reason_for")
        reply = result["message"]
    elif rtype == "selection_required":
        session["awaiting_selection"] = True
        session["selection_intent"] = result.get("intent_data", {})
        session["selection_candidates"] = result.get("candidates", [])
        reply = result["message"] + "\n" + "\n".join(
            f"{c['index']}. {c['nome']} (estoque: {c['estoque']})" for c in result.get("candidates", [])
        )
    elif rtype == "confirm_required":
        if not _can_mutate(role):
            raise HTTPException(403, "Apenas administradores podem confirmar alterações")
        await session_store.save_pending(redis, store_id, user_id, result["pending_action"])
        preview = result.get("preview") or {}
        preview_lines = "\n".join(f"• {k}: {v}" for k, v in preview.items())
        reply = result["message"] + ("\n\n" + preview_lines if preview_lines else "") + "\n\nResponda **Sim** para confirmar ou **Cancelar**."
    else:
        reply = result.get("message", "Ok.")
        await session_store.clear_pending(redis, store_id, user_id)

    messages.append({"role": "assistant", "content": reply})
    session["messages"] = messages[-30:]
    await session_store.save_session(redis, store_id, user_id, session)

    return {
        "response_type": rtype,
        "message": reply,
        "preview": result.get("preview"),
        "candidates": result.get("candidates"),
        "pending_action": result.get("pending_action"),
        "history": session["messages"],
    }


async def confirm_pending(
    db: AsyncSession,
    *,
    store_id: UUID,
    user_id: UUID,
    user_name: str,
    role: str,
) -> dict[str, Any]:
    if not _can_mutate(role):
        raise HTTPException(403, "Apenas administradores podem confirmar alterações")
    redis = await get_redis()
    pending = await session_store.load_pending(redis, store_id, user_id)
    if not pending:
        raise HTTPException(400, "Nenhuma ação pendente para confirmar")

    out = await execute_action(
        db, store_id=store_id, user_id=user_id, user_name=user_name, action=pending,
    )
    await db.commit()
    await session_store.clear_pending(redis, store_id, user_id)
    if out.get("undo"):
        await session_store.push_undo(redis, store_id, user_id, out["undo"])
    return {
        "response_type": "executed",
        "message": out["message"],
        "pending_action": None,
        "order_id": out.get("order_id"),
    }


async def cancel_pending(store_id: UUID, user_id: UUID) -> dict[str, Any]:
    redis = await get_redis()
    await session_store.clear_pending(redis, store_id, user_id)
    session = await session_store.load_session(redis, store_id, user_id)
    for key in (
        "awaiting_reason",
        "reason_for_intent",
        "awaiting_selection",
        "selection_intent",
        "selection_candidates",
        "selected_product_id",
    ):
        session.pop(key, None)
    await session_store.save_session(redis, store_id, user_id, session)
    return {"response_type": "message", "message": "Ação cancelada.", "pending_action": None}


async def get_history(store_id: UUID, user_id: UUID) -> dict[str, Any]:
    redis = await get_redis()
    session = await session_store.load_session(redis, store_id, user_id)
    pending = await session_store.load_pending(redis, store_id, user_id)
    return {"history": session.get("messages", []), "pending_action": pending}
