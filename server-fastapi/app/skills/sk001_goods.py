"""SK-001 商品信息查询：按条件查询在售商品公开信息。

入参：分类id、关键词、页码；出参白名单：商品id、标题、价格、状态（report §9）。
实现：调 SpringBoot GET /api/v1/goods（游客可读，仅"在售"），分类名→id 经 GET /api/v1/categories。
"""
import logging
import re
import threading
import time

from app.core.springboot import client
from app.mcp.message import McpRequest, invalid_params

logger = logging.getLogger("agent.sk001")

_STRIP_WORDS = ["帮我", "帮我找", "帮忙找", "查询", "查一下", "查查", "搜一下", "搜索",
                "找一下", "找找", "看看", "我想", "想要", "有没有", "求购", "推荐一下",
                "推荐", "一下", "在卖的", "在售的", "二手", "便宜", "找一本", "找一件",
                "找一部", "找一台", "一本", "一件", "一部", "一台", "点", "呢", "吗",
                "请问", "现在", "平台", "上边", "上面", "有哪些", "什么", "的", "一个"]
_STRIP_RES = [re.compile(w) for w in _STRIP_WORDS]

_cat_cache: dict = {"tree": None, "leaves": None, "at": 0.0}
_cat_lock = threading.Lock()


def _categories() -> list[dict]:
    """缓存 5 分钟的分类树，返回叶子/一级分类的扁平列表 [{id,name,parentId}]。"""
    with _cat_lock:
        if _cat_cache["tree"] is not None and time.monotonic() - _cat_cache["at"] < 300:
            return _cat_cache["leaves"]
    try:
        tree = client.get("/api/v1/categories") or []
    except Exception:
        return _cat_cache["leaves"] or []
    flat: list[dict] = []
    for top in tree:
        flat.append({"id": top.get("id"), "name": top.get("name"), "parentId": 0})
        for child in top.get("children") or []:
            flat.append({"id": child.get("id"), "name": child.get("name"),
                         "parentId": top.get("id")})
    with _cat_lock:
        _cat_cache.update({"tree": tree, "leaves": flat, "at": time.monotonic()})
    return flat


def match_category(prompt: str) -> dict | None:
    """从 prompt 中匹配分类名（长名优先）。"""
    best = None
    for cat in _categories():
        name = cat.get("name") or ""
        if len(name) >= 2 and name in prompt:
            if best is None or len(name) > len(best["name"]):
                best = cat
    return best


def extract_keyword(prompt: str) -> str:
    text = prompt
    for pattern in _STRIP_RES:
        text = pattern.sub("", text)
    return text.strip(" 　?？,，。、的")


class SK001GoodsQuery:
    skill_id = "SK-001"

    def run(self, mcp: McpRequest) -> dict:
        """返回 {"payload": 供 LLM 组织回复的数据 JSON, "template": 规则模式模板回复,
        "last_items": 供序号追问的结果列表}。"""
        params = mcp.params or {}
        prompt: str = params.get("prompt") or ""
        page = params.get("page") or 1
        ordinal = params.get("ordinal")
        try:
            page = max(1, int(page))
        except (TypeError, ValueError):
            raise invalid_params("页码必须是正整数")

        # 追问"第 N 个"：直接解析上一轮结果列表，不重新检索
        if ordinal is not None:
            return self._resolve_ordinal(ordinal, params.get("prev_items") or [])

        keyword = extract_keyword(prompt) if prompt else (params.get("keyword") or "")
        cat = match_category(prompt) if prompt else None
        if cat:
            keyword = extract_keyword(prompt.replace(cat["name"], ""))
        query: dict = {"page": page, "pageSize": 10}
        if cat:
            query["categoryId"] = cat["id"]
        if keyword:
            query["keyword"] = keyword[:50]

        data = client.get("/api/v1/goods", uid=mcp.params.get("user_id"), params=query)
        goods = (data or {}).get("list") or []
        total = (data or {}).get("total", 0)

        items = [{"id": g.get("id"), "title": g.get("title"), "price": g.get("price"),
                  "status": g.get("status"), "categoryName": g.get("categoryName"),
                  "stock": g.get("stock")} for g in goods]

        scope = f"分类「{cat['name']}」" if cat else ""
        kw = f"关键词\"{keyword}\"" if keyword else ""
        header = f"在{scope}{kw}范围内" if (scope or kw) else "平台上"
        if not items:
            template = (f"{header}暂时没有找到在售商品。可以换个关键词（如\"教材\"\"手机\"），"
                        f"或告诉我分类名称再试一次。")
        else:
            lines = [f"{i}. {it['title']} · ¥{it['price']} · {it.get('categoryName') or ''}"
                     for i, it in enumerate(items, 1)]
            more = f" 共 {total} 件，需要看更多可以说\"下一页\"。" if total > len(items) else ""
            template = f"{header}找到以下在售商品：\n" + "\n".join(lines) + more
        return {
            "payload": {"query": query, "total": total, "goods": items},
            "template": template,
            "last_items": items,
        }

    def _resolve_ordinal(self, ordinal: int, items: list[dict]) -> dict:
        if not items:
            raise invalid_params("当前没有可追问的结果列表，请先查询一次商品")
        if ordinal < 1 or ordinal > len(items):
            raise invalid_params(f"序号超出范围（1~{len(items)}），共 {len(items)} 件结果")
        goods_id = items[ordinal - 1]["id"]
        detail = client.get(f"/api/v1/goods/{goods_id}")
        it = {
            "id": detail.get("id"), "title": detail.get("title"),
            "price": detail.get("price"), "status": detail.get("status"),
            "categoryName": (detail.get("categoryPath") or [""])[-1],
            "description": (detail.get("description") or "")[:80],
            "seller": (detail.get("seller") or {}).get("nickname"),
            "stock": detail.get("stock"),
        }
        template = (f"第 {ordinal} 个商品：{it['title']} · ¥{it['price']}"
                    f" · 分类「{it['categoryName']}」 · 库存 {it.get('stock', '-')} 件"
                    f" · 卖家 {it.get('seller') or '匿名'}\n简介：{it['description'] or '（无）'}")
        return {"payload": {"ordinal": ordinal, "goods": it}, "template": template,
                "last_items": items}
