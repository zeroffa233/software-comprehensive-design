"""SK-003 订单状态查询：仅查询当前用户本人订单（属主校验由 SpringBoot 按 X-User-Id 强制）。

入参：订单号（须属于发起对话的用户）/ 序号（追问）；出参：订单状态、下单/支付/完成时间。
禁止：查询他人订单、取消/修改订单、模拟支付（编排层 4003 拦截，属主不符业务侧 403 → 5000 话术）。
"""
import logging

from app.core.springboot import SpringBootError, client
from app.mcp.message import McpRequest, business_error, invalid_params

logger = logging.getLogger("agent.sk003")


def _fmt_key_times(key_times) -> str:
    """keyTimes 形如 {"createdAt": "...", "payTime": ...}，按序拼接时间线。"""
    if isinstance(key_times, dict):
        pairs = [f"{k} {v}" for k, v in key_times.items() if v]
        return "；".join(pairs)
    if isinstance(key_times, list):
        return "；".join(str(x) for x in key_times)
    return ""


class SK003OrderQuery:
    skill_id = "SK-003"

    def run(self, mcp: McpRequest) -> dict:
        params = mcp.params or {}
        order_no = params.get("orderNo")
        ordinal = params.get("ordinal")

        if order_no:
            return self._detail(str(order_no), mcp.params.get("user_id"))
        if ordinal is not None:
            return self._resolve_ordinal(ordinal, params, mcp.params.get("user_id"))

        data = client.get("/api/v1/orders", uid=mcp.params.get("user_id"),
                          params={"page": 1, "pageSize": 10})
        orders = (data or {}).get("list") or []
        total = (data or {}).get("total", 0)
        items = [{
            "orderNo": o.get("orderNo"), "goodsTitle": o.get("goodsTitle"),
            "dealPrice": o.get("dealPrice"), "num": o.get("num"),
            "status": o.get("status"), "keyTimes": o.get("keyTimes"),
        } for o in orders]
        return {"payload": {"total": total, "orders": items}, "last_items": items,
                "template": self._list_template(total, items)}

    def _list_template(self, total: int, items: list[dict]) -> str:
        if not items:
            return "你目前没有任何订单。可以去小程序逛逛在售商品，下单后我就能帮你查进度啦。"
        lines = []
        for i, o in enumerate(items, 1):
            kt = _fmt_key_times(o.get("keyTimes"))
            lines.append(f"{i}. 订单 {o['orderNo']}：{o['goodsTitle']} ×{o['num']}"
                         f" · 实付 ¥{o['dealPrice']} · 状态【{o['status']}】"
                         + (f" · {kt}" if kt else ""))
        more = f"\n共 {total} 单。" if total > len(items) else ""
        return "你最近的订单如下：\n" + "\n".join(lines) + more + \
            "\n可以追问\"第二个呢\"看具体某单的详情。"

    def _resolve_ordinal(self, ordinal: int, params: dict, uid: int | None) -> dict:
        items = params.get("prev_items") or []
        if not items:
            raise invalid_params("当前没有可追问的订单列表，请先说\"我的订单\"查询一次")
        if ordinal < 1 or ordinal > len(items):
            raise invalid_params(f"序号超出范围（1~{len(items)}），共 {len(items)} 单")
        detail = self._detail(str(items[ordinal - 1]["orderNo"]), uid)
        # 保留原列表，支持继续追问"第三个呢"
        detail["last_items"] = items
        return detail

    def _detail(self, order_no: str, uid: int | None) -> dict:
        if not order_no or len(order_no) < 6:
            raise invalid_params("订单号格式不正确，请核对后重试")
        try:
            detail = client.get(f"/api/v1/orders/{order_no}", uid=uid)
        except SpringBootError as e:
            if e.code == 404:
                raise invalid_params(f"订单 {order_no} 不存在，请核对订单号")
            if e.code == 403:
                # 属主校验失败：越权语义由 MCP 映射为 4003（report §9）
                from app.mcp.message import permission_denied
                raise permission_denied()
            raise business_error()
        timeline = detail.get("timeline") or []
        tl_text = " → ".join(f"{t.get('action')} {t.get('time')}" for t in timeline if t.get("time"))
        payload = {
            "orderNo": detail.get("orderNo"), "status": detail.get("status"),
            "dealPrice": detail.get("dealPrice"), "num": detail.get("num"),
            "remark": detail.get("remark"), "timeline": timeline,
        }
        template = (f"订单 {detail.get('orderNo')} 当前状态【{detail.get('status')}】，"
                    f"实付 ¥{detail.get('dealPrice')}（数量 {detail.get('num')}）。\n"
                    f"流转时间线：{tl_text or '暂无记录'}")
        items = [{"orderNo": detail.get("orderNo"), "goodsTitle": detail.get("goodsTitle")
                  or "", "dealPrice": detail.get("dealPrice"), "num": detail.get("num"),
                  "status": detail.get("status"), "keyTimes": detail.get("keyTimes")}]
        return {"payload": payload, "template": template, "last_items": items}
