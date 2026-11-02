"""SK-005 选购建议："XX 值不值得买 / 帮我看看 X / 选哪个" →
取目标商品 + 同分类在售列表，基于热度(viewCount/cartCount)/急售/价格 vs 同类均价/
运费/库存/发布时长给出"建议买/再等等/建议对比"结论与理由，结论后附免责声明。
只读：仅查询，不写业务库。
"""
import json
import logging

from app.agent import llm
from app.mcp.message import McpRequest, invalid_params
from app.skills.goods_common import (_f, advice_verdict, fmt_freight,
                                     fmt_int, goods_detail, resolve_token,
                                     search_goods)

logger = logging.getLogger("agent.sk005")

SYSTEM_SK005 = """你是"校园二手物品交易平台"的选购建议助手。基于给出的真实业务数据（目标商品 + 同分类在售商品列表及均价），输出：
1. 第一行给结论，三选一：**建议买** / **再等等** / **建议对比**；
2. 随后用 2-4 条理由支撑，必须覆盖：热度（浏览量/加购数 与同类对比）、价格 vs 同类均价、运费（0=包邮）、库存、是否急售、发布时长；
3. 最后一行固定附：\"（以上建议仅供参考，请以商品实际信息与当面验货为准）\"。
只用给定数据，不得编造；数据缺失的维度如实写"暂无数据"。
"""

DISCLAIMER = "（以上建议仅供参考，请以商品实际信息与当面验货为准）"


class SK005BuyAdvice:
    skill_id = "SK-005"

    def run(self, mcp: McpRequest) -> dict:
        params = mcp.params or {}
        uid = params.get("user_id")
        prompt: str = params.get("prompt") or ""

        target = None
        if params.get("goodsId"):
            target = goods_detail(params["goodsId"], uid)
        else:
            token = (params.get("keyword") or "").strip()
            if not token:
                token = self._extract_keyword(prompt)
            if not token:
                raise invalid_params("请告诉我要看哪件商品，例如：\"高等数学教材 值不值得买\"。")
            target = resolve_token(token, params.get("context_items") or [], uid)
        if not target:
            raise invalid_params("没找到这件商品，请确认商品名称（或先搜索商品再说\"第一个值不值得买\"）。")

        # 同分类在售列表作为参照系；分类缺失时用关键词搜索结果
        category_id = target.get("categoryId")
        if category_id:
            peers = search_goods("", uid=uid, category_id=category_id, page_size=10)
        else:
            peers = search_goods(target.get("title") or "", uid=uid, page_size=10)
        peers = [p for p in peers if p.get("id") != target.get("id")]
        prices = [_f(p.get("price")) for p in peers if _f(p.get("price")) > 0]
        avg_price = round(sum(prices) / len(prices), 2) if prices else None

        payload = {
            "target": target,
            "peerCategoryName": target.get("categoryName"),
            "peerCount": len(peers),
            "peerAvgPrice": avg_price,
            "peers": [{"id": p.get("id"), "title": p.get("title"), "price": p.get("price"),
                       "viewCount": p.get("viewCount"), "cartCount": p.get("cartCount"),
                       "freight": p.get("freight"), "urgent": p.get("urgent")}
                      for p in peers[:10]],
        }
        reply = self._llm_reply(prompt, payload)
        verdict, reason = advice_verdict(target, peers)
        template = self._template(target, peers, verdict, reason, avg_price)
        return {"payload": payload, "template": template, "reply": reply,
                "last_items": [target] + peers[:9]}

    def _llm_reply(self, prompt: str, payload: dict) -> str | None:
        reply = llm.compose_with_system(
            SYSTEM_SK005, prompt or "这件商品值不值得买",
            json.dumps(payload, ensure_ascii=False), history=None)
        if reply and DISCLAIMER not in reply:
            reply += "\n" + DISCLAIMER
        return reply

    def _extract_keyword(self, prompt: str) -> str:
        text = prompt or ""
        for pat in ("值不值得买", "值得买吗", "值不值", "值得入手吗", "建议买吗", "划算吗",
                    "选哪个", "哪个好", "帮我看看", "看一下", "看看", "帮我"):
            text = text.replace(pat, " ")
        return text.strip(" 　?？,，。、的吗呢")

    def _template(self, target: dict, peers: list[dict], verdict: str,
                  reason: str, avg_price) -> str:
        title = target.get("title") or f"商品{target.get('id')}"
        lines = [f"结论：{verdict} —— {title}",
                 f"理由：{reason}",
                 f"运费：{fmt_freight(target.get('freight'))}；"
                 f"热度：浏览 {fmt_int(target.get('viewCount'))}/加购 {fmt_int(target.get('cartCount'))}"
                 + (f"；同类均价 ¥{avg_price}（参照 {len(peers)} 件在售）" if avg_price else ""),
                 DISCLAIMER]
        return "\n".join(lines)
