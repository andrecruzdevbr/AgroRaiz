"""
Redis session for admin AI chat — history, pending action, undo stack.
"""
from __future__ import annotations

import json
from typing import Any, Optional
from uuid import UUID

SESSION_TTL = 60 * 60 * 4  # 4 hours


def _key(store_id: UUID, user_id: UUID) -> str:
    return f"admin_ai:session:{store_id}:{user_id}"


def _pending_key(store_id: UUID, user_id: UUID) -> str:
    return f"admin_ai:pending:{store_id}:{user_id}"


def _undo_key(store_id: UUID, user_id: UUID) -> str:
    return f"admin_ai:undo:{store_id}:{user_id}"


async def load_session(redis, store_id: UUID, user_id: UUID) -> dict[str, Any]:
    raw = await redis.get(_key(store_id, user_id))
    if not raw:
        return {"messages": [], "state": "idle"}
    return json.loads(raw)


async def save_session(redis, store_id: UUID, user_id: UUID, data: dict[str, Any]) -> None:
    await redis.setex(_key(store_id, user_id), SESSION_TTL, json.dumps(data, default=str))


async def load_pending(redis, store_id: UUID, user_id: UUID) -> Optional[dict[str, Any]]:
    raw = await redis.get(_pending_key(store_id, user_id))
    return json.loads(raw) if raw else None


async def save_pending(redis, store_id: UUID, user_id: UUID, action: dict[str, Any]) -> None:
    await redis.setex(_pending_key(store_id, user_id), SESSION_TTL, json.dumps(action, default=str))


async def clear_pending(redis, store_id: UUID, user_id: UUID) -> None:
    await redis.delete(_pending_key(store_id, user_id))


async def push_undo(redis, store_id: UUID, user_id: UUID, record: dict[str, Any]) -> None:
    await redis.setex(_undo_key(store_id, user_id), SESSION_TTL, json.dumps(record, default=str))


async def pop_undo(redis, store_id: UUID, user_id: UUID) -> Optional[dict[str, Any]]:
    raw = await redis.get(_undo_key(store_id, user_id))
    if raw:
        await redis.delete(_undo_key(store_id, user_id))
        return json.loads(raw)
    return None


async def clear_session(redis, store_id: UUID, user_id: UUID) -> None:
    await redis.delete(_key(store_id, user_id))
    await redis.delete(_pending_key(store_id, user_id))
    await redis.delete(_undo_key(store_id, user_id))
