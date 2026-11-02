"""SK-006 智能下单草稿："帮我下单/买 X" → 取商品数据生成草稿
{goodsId, title, num, unitPrice, freight, totalAmount}，reply 明确"已生成订单草稿，
请到商品页确认下单"。**不调 POST /orders**（data.draft 供小程序一键确认），
report §9 只读红线：真正的下单/支付必须由用户在页面确认。
"""
import logging

from app.mcp.message import McpRequest, invalid_params
from app.skills.goods_common import (_f, fmt_freight, goods_detail,
                                     parse_num, resolve_token)

logger = logging.getLogger("agent.sk006")

CONFIRM_TEXT = "已生成订单草稿，请到商品页确认下单"


class SK006OrderDraft:
    skill_id = "SK-006"

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
                raise invalid_params("请告诉我要下单哪件商品，例如：\"帮我下单 高等数学教材\"。")
            target = resolve_token(token, params.get("context_items") or [], uid)
        if not target:
            raise invalid_params("没找到这件商品，无法生成下单草稿；请确认商品名称后再试。")

        num = params.get("num") or parse_num(prompt)
        try:
            num = max(1, min(int(num), 99))
        except (TypeError, ValueError):
            num = 1

        unit_price = round(_f(target.get("price")), 2)
        freight = round(_f(target.get("freight")), 2) if target.get("freight") is not None else 0.0
        total = round(unit_price * num + freight, 2)
        draft = {
            "goodsId": target.get("id"),
            "title": target.get("title"),
            "num": num,
            "unitPrice": unit_price,
            "freight": freight,
            "totalAmount": total,
        }
        reply = (
            f"{CONFIRM_TEXT}：\n"
            f"· 商品：《{draft['title']}》 × {num}\n"
            f"· 单价 ¥{unit_price:g}；运费 {fmt_freight(freight)}\n"
            f"· 合计 ¥{total:g}\n"
            f"（Agent 不会替你真正下单或支付，请到商品页核对后确认）")
        return {"payload": {"draft": draft, "confirmText": CONFIRM_TEXT},
                "template": reply, "reply": reply,
                "extra": {"draft": draft},
                "last_items": [target]}

    def _extract_keyword(self, prompt: str) -> str:
        text = prompt or ""
        for pat in ("帮我下单", "帮我买", "给我下单", "给我买", "下个单", "下一单", "下单",
                    "我想买", "我要买", "想买", "要买", "购买", "买下", "帮我", "给我"):
            text = text.replace(pat, " ")
        return text.strip(" 　?？,，。、的")
