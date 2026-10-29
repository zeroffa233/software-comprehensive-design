"""多轮会话上下文：Redis key agent:session:{uid}，TTL 30 分钟，保留最近 10 轮。

结构：{"rounds": [{"u": 用户输入, "a": Agent 回复}], "last_skill": SK-xxx|null,
      "last_items": [上一轮 Skill 结果条目（供"第二个呢"等指代消解）]}
Redis 不可用时优雅降级为进程内 dict（仅当前实例内多轮）。
"""
import json
import logging
from typing import Any

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger("agent.session")

_fallback: dict[str, dict] = {}


def _key(uid: int | str) -> str:
    return f"agent:session:{uid}"


def load(uid: int | str) -> dict:
    try:
        raw = get_redis().get(_key(uid))
        if raw:
            return json.loads(raw)
    except Exception:
        logger.warning("会话读取失败，使用进程内存降级", exc_info=True)
    return _fallback.get(str(uid), {"rounds": [], "last_skill": None, "last_items": []})


def save(uid: int | str, state: dict) -> None:
    state["rounds"] = state.get("rounds", [])[-settings.SESSION_MAX_ROUNDS:]
    payload = json.dumps(state, ensure_ascii=False)
    _fallback[str(uid)] = state
    try:
        get_redis().set(_key(uid), payload, ex=settings.SESSION_TTL_SECS)
    except Exception:
        logger.warning("会话写入失败（Redis 不可用），仅保留进程内存", exc_info=True)


def append_round(state: dict, user_prompt: str, reply: str, skill_id: str | None = None,
                 last_items: list | None = None) -> None:
    state.setdefault("rounds", []).append({"u": user_prompt, "a": reply})
    state["rounds"] = state["rounds"][-settings.SESSION_MAX_ROUNDS:]
    if skill_id is not None:
        state["last_skill"] = skill_id
    if last_items is not None:
        # 按 Skill 命名空间存最近结果，避免跨 Skill 指代串扰（商品列表 ≠ 订单列表）
        li = state.get("last_items")
        if not isinstance(li, dict):
            li = {}
        li[skill_id or "_"] = last_items
        state["last_items"] = li


def resolve_ordinal(state: dict, skill_id: str, ordinal: int) -> dict[str, Any] | None:
    """将"第 N 个/条"解析为该 Skill 上一轮结果条目；1 起。"""
    items = (state.get("last_items") or {}).get(skill_id) or []
    if 1 <= ordinal <= len(items):
        return items[ordinal - 1]
    return None
