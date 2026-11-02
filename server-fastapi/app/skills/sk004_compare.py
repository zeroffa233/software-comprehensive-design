"""SK-004 商品比对：解析"比对 A 和 B"（支持"第一个/第二个"指代上一轮结果），
实时取 GET /goods 搜索 + GET /goods/{id} 结构化数据，LLM 输出对比表+结论+风险提示。
只读：仅查询，不写业务库。商品不足两件 → 4001 追问补齐。
"""
import json
import logging

from app.agent import llm
from app.mcp.message import McpRequest, invalid_params
from app.skills.goods_common import (fmt_freight, fmt_int, fmt_value,
                                     parse_compare_tokens, resolve_token)

logger = logging.getLogger("agent.sk004")

SYSTEM_SK004 = """你是"校园二手物品交易平台"的商品比对助手。基于给出的真实业务数据（两件商品的 JSON），输出：
1. 一个 Markdown 表格，逐行对比：价格、是否可议价、运费（0=包邮）、库存、浏览量、加购数、是否急售、卖家、发布时长（数据缺失写"暂无"）；
2. 一句简短结论（各自适合什么需求的买家）；
3. 风险提示（最多 2 条：如急售需警惕、价格明显异常、发布过久、库存仅 1 件等；无风险则不写）。
只用给定数据，不得编造；表格 + 结论控制在 250 字内。"""


class SK004GoodsCompare:
    skill_id = "SK-004"

    def run(self, mcp: McpRequest) -> dict:
        params = mcp.params or {}
        uid = params.get("user_id")
        prompt: str = params.get("prompt") or ""
        # 对象词：LLM 决策给的 items 优先，否则从 prompt 兜底解析
        tokens = [str(t) for t in (params.get("items") or []) if str(t).strip()]
        if len(tokens) < 2:
            extra = parse_compare_tokens(prompt)
            tokens = (tokens + [t for t in extra if t not in tokens])[:2]
        context_items = params.get("context_items") or []
        if not tokens:
            raise invalid_params("请告诉我要比对哪两件商品，例如：\"比对 高数教材 和 iPhone\"，"
                                 "或先用商品名搜索再说\"比对第一个和第二个\"。")

        goods = []
        missing = []
        for tok in tokens:
            g = resolve_token(tok, context_items, uid)
            (goods.append(g) if g else missing.append(tok))
        # 商品不足两个 → 追问补齐（不编造）
        if len(goods) < 2:
            found = "、".join(f"《{g['title']}》" for g in goods) or "暂无"
            hint = f"已找到：{found}。" if goods else ""
            miss = f"没找到\"{'、'.join(missing)}\"。" if missing else ""
            raise invalid_params(
                f"比对需要两件商品。{miss}{hint}"
                f"请补充商品名称（如\"比对 {tokens[0] if tokens else 'XX'} 和 另一件商品名\"），"
                f"或先搜索商品再说\"比对第一个和第二个\"。")

        payload = {"goods": goods[:2]}
        reply = self._llm_reply(prompt, payload)
        template = self._template(goods[:2])
        return {"payload": payload, "template": template, "reply": reply,
                "last_items": goods[:2]}

    def _llm_reply(self, prompt: str, payload: dict) -> str | None:
        return llm.compose_with_system(
            SYSTEM_SK004, prompt or "比对这两件商品",
            json.dumps(payload, ensure_ascii=False), history=None)

    def _template(self, goods: list[dict]) -> str:
        """规则模式兜底：字段对齐的文本对比表。"""
        a, b = goods
        rows = [
            ("价格", f"¥{fmt_value(a['price'])}", f"¥{fmt_value(b['price'])}"),
            ("可议价", "可议" if a.get("negotiable") else ("不可议" if a.get("negotiable") is not None else "暂无"),
             "可议" if b.get("negotiable") else ("不可议" if b.get("negotiable") is not None else "暂无")),
            ("运费", fmt_freight(a.get("freight")), fmt_freight(b.get("freight"))),
            ("库存", fmt_value(a.get("stock")), fmt_value(b.get("stock"))),
            ("浏览量", fmt_value(a.get("viewCount")), fmt_value(b.get("viewCount"))),
            ("加购数", fmt_value(a.get("cartCount")), fmt_value(b.get("cartCount"))),
            ("急售", "是" if a.get("urgent") else "否", "是" if b.get("urgent") else "否"),
            ("卖家", fmt_value(a.get("sellerName")), fmt_value(b.get("sellerName"))),
            ("发布时长", f"{a.get('publishDays')}天前" if a.get("publishDays") is not None else "暂无",
             f"{b.get('publishDays')}天前" if b.get("publishDays") is not None else "暂无"),
        ]
        ta = (a.get("title") or f"商品{a.get('id')}")[:20]
        tb = (b.get("title") or f"商品{b.get('id')}")[:20]
        lines = [f"《{ta}》 vs 《{tb}》", "-" * 40]
        for name, va, vb in rows:
            lines.append(f"{name}｜{va}  vs  {vb}")
        return "\n".join(lines) + f"\n（热度合计：{fmt_int(a.get('viewCount')) + 5 * fmt_int(a.get('cartCount'))} vs {fmt_int(b.get('viewCount')) + 5 * fmt_int(b.get('cartCount'))}，浏览+5×加购）"
