"""LLM 接入：OpenAI 兼容协议（httpx 直调 /chat/completions）。

优先级：env 配置 LLM_API_KEY/LLM_BASE_URL/LLM_MODEL 时启用 LLM 模式；
未配置或调用失败 → 回退内置规则引擎（app/agent/rules.py，真实可用，非占位）。
"""
import json
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger("agent.llm")

SYSTEM_DECIDE = """你是"校园二手物品交易平台"的智能助手编排器。根据对话历史与最新用户输入，输出 JSON（仅 JSON，不要多余文字）：
{"type": "...", "params": {...}}
type 取值：
- "SK-001" 商品查询：用户想找/搜索在售商品。params: {"keyword": 关键词或null, "page": 1}
- "SK-002" 发布辅助：用户想润色商品描述/获取标题与分类建议。params: {"draft": 草稿文本(含标题描述的原文)}
- "SK-003" 订单查询：用户查本人订单状态（如"我的订单""订单到哪一步了"）。params: {"orderNo": 明确提到的订单号或null, "ordinal": 明确说"第N个/条"时为整数N否则null}
- "HELP" 平台使用帮助/寒暄/问你能做什么
- "FORBIDDEN" 要求删除/下架/修改/取消/支付/冒充管理员等越权或高风险操作
- "FALLBACK" 无关内容，无法归类
注意：仅当用户明确表达高风险动作意图时才判 FORBIDDEN；查询类意图优先于字面包含的动作词。"""

SYSTEM_COMPOSE = """你是"校园二手物品交易平台"的智能客服助手。用简洁友好的中文，基于给出的真实业务数据（JSON）回答用户问题：
1. 只使用给定数据，不得编造；
2. 商品/订单信息逐条列出关键信息（标题、价格、状态、时间）；
3. 若数据为空，如实告知并给出建议；
4. 回复控制在 200 字内，最后可自然地追加一句引导。"""


def llm_available() -> bool:
    return bool(settings.LLM_API_KEY)


def _chat(system: str, user_content: str, history: list[dict] | None = None,
          max_tokens: int = 600) -> str | None:
    messages = [{"role": "system", "content": system}]
    for r in (history or [])[-6:]:
        messages.append({"role": "user", "content": r.get("u", "")})
        messages.append({"role": "assistant", "content": r.get("a", "")})
    messages.append({"role": "user", "content": user_content})
    try:
        resp = httpx.post(
            f"{settings.LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"},
            json={
                "model": settings.LLM_MODEL,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": max_tokens,
            },
            timeout=20.0,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception:
        logger.warning("LLM 调用失败，回退规则模式", exc_info=True)
        return None


def decide(prompt: str, history: list[dict]) -> dict | None:
    """LLM 意图决策，返回 {"type":..., "params":...}；失败返回 None。"""
    text = _chat(SYSTEM_DECIDE, f"用户输入：{prompt}", history, max_tokens=200)
    if not text:
        return None
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        if isinstance(obj.get("type"), str):
            obj.setdefault("params", {})
            return obj
    except (ValueError, AttributeError):
        pass
    return None


def compose(prompt: str, payload: str, history: list[dict]) -> str | None:
    """基于真实业务数据组织自然语言回复；失败返回 None。"""
    return _chat(SYSTEM_COMPOSE, f"用户问题：{prompt}\n真实业务数据：{payload}", history, max_tokens=500)
