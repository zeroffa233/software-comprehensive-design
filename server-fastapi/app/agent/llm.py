"""LLM 接入：OpenAI 兼容协议（httpx 直调 /chat/completions）。

优先级：env 配置 LLM_API_KEY/LLM_BASE_URL/LLM_MODEL 时启用 LLM 模式；
未配置或调用失败 → 回退内置规则引擎（app/agent/rules.py，真实可用，非占位）。
glm-5.3-flash 支持文本+视觉（messages content 数组 image_url），供 SK-007 识图。
"""
import base64
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
- "SK-004" 商品比对：用户想对比两件商品（如"比对A和B"，可用"第一个/第二个/它"指代上一轮查询结果中的商品）。params: {"items": ["名称或商品ID或'第N个'指代", ...]}
- "SK-005" 选购建议：用户问某商品值不值得买/帮我看看X/选哪个/哪个划算。params: {"keyword": 商品名或null, "goodsId": 明确商品ID或null}
- "SK-006" 下单草稿：用户让 Agent 帮忙下单/买某商品（仅生成草稿不真正下单）。params: {"keyword": 商品名或null, "goodsId": 明确商品ID或null, "num": 数量(默认1)}
- "HELP" 平台使用帮助/寒暄/问你能做什么
- "FORBIDDEN" 要求删除/下架/修改/取消/支付/冒充管理员等越权或高风险操作（注意："帮我下单"只生成草稿、不支付，属于 SK-006 而非 FORBIDDEN）
- "FALLBACK" 无关内容，无法归类
注意：仅当用户明确表达高风险动作意图时才判 FORBIDDEN；查询类意图优先于字面包含的动作词。"""

SYSTEM_COMPOSE = """你是"校园二手物品交易平台"的智能客服助手。用简洁友好的中文，基于给出的真实业务数据（JSON）回答用户问题：
1. 只使用给定数据，不得编造；
2. 商品/订单信息逐条列出关键信息（标题、价格、状态、时间）；
3. 若数据为空，如实告知并给出建议；
4. 回复控制在 200 字内，最后可自然地追加一句引导。"""

SYSTEM_DESCRIBE = """你是"校园二手物品交易平台"的商品识图助手。根据图片中的物品，输出 JSON（仅 JSON，不要多余文字）：
{"title": "商品标题（5-40字，突出品名/型号/成色）",
 "description": "商品描述（30-200字，客观描述外观/功能/适用场景，适合二手平台发布；不确定的成色用中性表述，不得编造）",
 "categoryHint": "最可能的分类名称（如：计算机教材、手机、自行车）",
 "tags": ["标签1", "标签2", "标签3"]}"""


def llm_available() -> bool:
    return bool(settings.LLM_API_KEY)


def _history_messages(history: list[dict] | None) -> list[dict]:
    messages: list[dict] = []
    for r in (history or [])[-6:]:
        messages.append({"role": "user", "content": r.get("u", "")})
        messages.append({"role": "assistant", "content": r.get("a", "")})
    return messages


def _post(messages: list[dict], max_tokens: int) -> str | None:
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
            timeout=45.0,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"] or ""
        # glm-5.3-flash 为推理模型：reasoning 占满 max_tokens 时 content 为空，按失败回退
        return content if content.strip() else None
    except Exception:
        logger.warning("LLM 调用失败，回退规则模式", exc_info=True)
        return None


def _chat(system: str, user_content: str, history: list[dict] | None = None,
          max_tokens: int = 1000) -> str | None:
    messages = [{"role": "system", "content": system}]
    messages.extend(_history_messages(history))
    messages.append({"role": "user", "content": user_content})
    return _post(messages, max_tokens)


def _parse_json(text: str | None) -> dict | None:
    """从 LLM 回复中提取第一个 JSON 对象；失败返回 None。"""
    if not text:
        return None
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except (ValueError, AttributeError):
        return None


def decide(prompt: str, history: list[dict]) -> dict | None:
    """LLM 意图决策，返回 {"type":..., "params":...}；失败返回 None。
    推理模型会先输出思考内容，max_tokens 需覆盖 reasoning+JSON。"""
    obj = _parse_json(_chat(SYSTEM_DECIDE, f"用户输入：{prompt}", history, max_tokens=700))
    if obj and isinstance(obj.get("type"), str):
        obj.setdefault("params", {})
        return obj
    return None


def compose(prompt: str, payload: str, history: list[dict]) -> str | None:
    """基于真实业务数据组织自然语言回复；失败返回 None。"""
    return _chat(SYSTEM_COMPOSE, f"用户问题：{prompt}\n真实业务数据：{payload}", history, max_tokens=1200)


def compose_with_system(system: str, prompt: str, payload: str,
                        history: list[dict], max_tokens: int = 2000) -> str | None:
    """Skill 专用回复组织：自定义 system 提示词 + 真实业务数据。"""
    return _chat(system, f"用户问题：{prompt}\n真实业务数据：{payload}", history, max_tokens)


def describe_image(image_bytes: bytes, mime: str) -> dict | None:
    """视觉识图（SK-007）：图片转 base64 data URL 走 content 数组；
    模型无视觉/调用失败/输出不合法 → None（上层映射 4001）。"""
    b64 = base64.b64encode(image_bytes).decode()
    content = [
        {"type": "text", "text": "请识别这张图片中的物品并生成二手发布信息。"},
        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
    ]
    messages = [{"role": "system", "content": SYSTEM_DESCRIBE},
                {"role": "user", "content": content}]
    obj = _parse_json(_post(messages, max_tokens=1500))
    if not obj or not isinstance(obj.get("title"), str) or not isinstance(obj.get("description"), str):
        return None
    obj.setdefault("categoryHint", None)
    tags = obj.get("tags")
    obj["tags"] = [str(t) for t in tags] if isinstance(tags, list) else []
    return obj
