"""
AgroRaiz - Redis Client
Async connection pool for sessions, cache, pub/sub.
"""
from typing import Optional
import redis.asyncio as aioredis
import redis as sync_redis

from app.core.config import settings

_async_pool: Optional[aioredis.Redis] = None
_sync_pool: Optional[sync_redis.Redis] = None


async def init_redis():
    global _async_pool
    _async_pool = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )
    # Verify connection
    await _async_pool.ping()


async def get_redis() -> aioredis.Redis:
    global _async_pool
    if _async_pool is None:
        await init_redis()
    return _async_pool


def get_redis_sync() -> sync_redis.Redis:
    """Sync client for use inside Celery tasks."""
    global _sync_pool
    if _sync_pool is None:
        _sync_pool = sync_redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _sync_pool


async def close_redis():
    global _async_pool
    if _async_pool:
        await _async_pool.aclose()
        _async_pool = None
