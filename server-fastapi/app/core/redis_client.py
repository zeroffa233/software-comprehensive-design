"""Redis 客户端：Agent 会话上下文存储。"""
import logging

import redis

from app.core.config import settings

logger = logging.getLogger("agent.redis")

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            settings.REDIS_URL, decode_responses=True,
            socket_connect_timeout=3, socket_timeout=3,
        )
    return _client


def redis_available() -> bool:
    try:
        get_redis().ping()
        return True
    except Exception:
        logger.warning("Redis 不可用")
        return False
