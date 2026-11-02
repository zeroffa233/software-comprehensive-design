"""SK-004/005/006 共用商品取数与解析工具：实时调 SpringBoot，绝不硬编码业务数据。

后端契约（v2.1.0）：GET /api/v1/goods 列表项含 urgent/viewCount/cartCount/freight；
GET /api/v1/goods/{id} 详情含 seller/negotiable/createTime。字段读取做新旧契约兼容回退
（后端增强未上线时热度/运费等以 None/0 呈现，不阻塞功能）。
"""
import re
from datetime import datetime

from app.core.springboot import SpringBootError, client
from app.mcp.message import invalid_params

_CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
           "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

# "比对/比较/对比 A 和 B"：提取比对对象
_COMPARE_SPLIT_RE = re.compile(r"和|与|跟|、|还有|同|vs|VS|Vs")
_COMPARE_STRIP_RE = re.compile(
    r"^(帮(我|忙)?|请|麻烦)?(一下|下)?(比对|比较|对比|对比?一下|pk|PK)"
    r"(一下|下)?(这|那)?(两|2|二)?(个|件|样|本|部|台|只)?(商品|宝贝)?(看看)?[,，:：]?\s*")
# 下单数量："买2个 / 来三本"
_NUM_RE = re.compile(r"([0-9]+|[一二两三四五六七八九十]+)\s*(个|件|本|台|部|只|样)")
_ORDINAL_TOKEN_RE = re.compile(r"^第?\s*([0-9]+|[一二两三四五六七八九十]+)\s*(个|件|本|台|部|只|条)?$")


def _g(obj: dict, *keys, default=None):
    """多候选键取值（camelCase 新契约优先，snake_case 兼容回退）。"""
    for k in keys:
        if obj.get(k) is not None:
            return obj[k]
    return default


def normalize_goods(g: dict) -> dict:
    """商品统一视图：列表项与详情项均可；缺失字段以 None 呈现。"""
    if not isinstance(g, dict):
        return {}
    seller = g.get("seller") or {}
    created = _g(g, "createTime", "createdAt", "publishTime", "create_time")
    return {
        "id": g.get("id"),
        "title": g.get("title"),
        "price": _g(g, "price", "currentPrice"),
        "negotiable": _g(g, "negotiable", "canBargain", "bargainable"),
        "freight": _g(g, "freight", "freightAmount", "shippingFee"),
        "stock": g.get("stock"),
        "urgent": bool(_g(g, "urgent", "isUrgent", default=False)),
        "viewCount": _g(g, "viewCount", "view_count", "views"),
        "cartCount": _g(g, "cartCount", "cart_count", "favoriteCount"),
        "categoryName": _g(g, "categoryName", "category_name") or g.get("categoryPath"),
        "categoryId": _g(g, "categoryId", "category_id"),
        "sellerName": _g(g, "sellerName", "seller_name")
                      or (seller.get("nickname") if isinstance(seller, dict) else None),
        "description": g.get("description"),
        "mainImage": _g(g, "mainImage", "main_image") or g.get("coverUrl"),
        "createdAt": created,
        "publishDays": publish_days(created),
    }


def publish_days(created) -> int | None:
    """发布至今天数；解析失败返回 None。"""
    if not created:
        return None
    try:
        dt = datetime.strptime(str(created)[:19], "%Y-%m-%d %H:%M:%S")
        return max(0, (datetime.now() - dt).days)
    except ValueError:
        return None


def search_goods(keyword: str, *, uid: int | None = None, category_id: int | None = None,
                 page: int = 1, page_size: int = 5) -> list[dict]:
    """GET /goods 在售搜索，返回规范化列表。"""
    query: dict = {"page": page, "pageSize": page_size}
    if category_id:
        query["categoryId"] = category_id
    if keyword:
        query["keyword"] = str(keyword)[:50]
    data = client.get("/api/v1/goods", uid=uid, params=query) or {}
    return [normalize_goods(g) for g in (data.get("list") or [])]


def goods_detail(goods_id, uid: int | None = None) -> dict:
    """GET /goods/{id} 详情；不存在/非法 → 4001。"""
    try:
        gid = int(goods_id)
    except (TypeError, ValueError):
        raise invalid_params(f"商品ID非法：{goods_id!r}")
    try:
        data = client.get(f"/api/v1/goods/{gid}", uid=uid)
    except SpringBootError:
        raise invalid_params(f"商品不存在或已下架（id={gid}）")
    if not data:
        raise invalid_params(f"商品不存在（id={gid}）")
    return normalize_goods(data)


def fuzzy_search_goods(token: str, uid: int | None = None) -> dict | None:
    """关键词搜索无结果时的兜底：拉取在售列表本地做字符二元组相似度匹配，
    支持"高数教材"→"高等数学教材"这类缩写/口语叫法。无高于阈值的候选返回 None。"""
    token = (token or "").strip()
    if len(token) < 2:
        return None
    data = client.get("/api/v1/goods", uid=uid, params={"page": 1, "pageSize": 50}) or {}
    goods = [normalize_goods(g) for g in (data.get("list") or [])]
    bigrams = {token[i:i + 2] for i in range(len(token) - 1)}
    unigrams = set(token)
    best, best_score = None, 0
    for g in goods:
        title = str(g.get("title") or "")
        if not title:
            continue
        score = sum(2 for b in bigrams if b in title) + sum(1 for c in unigrams if c in title)
        if g.get("categoryName") and g["categoryName"] in token:
            score += 2
        if score > best_score:
            best, best_score = g, score
    return best if best_score >= 4 else None


def resolve_token(token: str, context_items: list[dict], uid: int | None = None) -> dict | None:
    """把一个比对/建议对象解析为商品：序号指代 → 商品ID → 关键词搜索，失败返回 None。"""
    token = (token or "").strip(" 　?？,，。、的")
    if not token:
        return None
    # 1) "第一个/第2个/2" → 上一轮 SK-001 结果列表指代
    m = _ORDINAL_TOKEN_RE.match(token)
    if m:
        raw = m.group(1)
        n = int(raw) if raw.isdigit() else _CN_NUM.get(raw)
        if n and 1 <= n <= len(context_items):
            item = context_items[n - 1]
            gid = item.get("id")
            if gid:
                return goods_detail(gid, uid)
            return item
        return None
    # 2) 纯数字 → 商品ID 直查，失败回退关键词搜索
    if token.isdigit():
        try:
            return goods_detail(int(token), uid)
        except Exception:
            pass
    # 3) 关键词搜索取第一条；无结果时模糊匹配兜底
    hits = search_goods(token, uid=uid, page_size=5)
    if hits:
        return hits[0]
    return fuzzy_search_goods(token, uid)


def parse_compare_tokens(prompt: str) -> list[str]:
    """从"比对/比较/对比 A 和 B"中提取对象词列表（规则模式兜底解析）。"""
    text = _COMPARE_STRIP_RE.sub("", prompt.strip()).strip(" 　?？,，。、的")
    if not text:
        return []
    parts = [p.strip(" 　?？,，。、的") for p in _COMPARE_SPLIT_RE.split(text)]
    return [p for p in parts if p]


def parse_num(prompt: str, default: int = 1) -> int:
    """解析下单数量（"买2个/来三本"），默认 1，上限 99。"""
    m = _NUM_RE.search(prompt or "")
    if not m:
        return default
    raw = m.group(1)
    n = int(raw) if raw.isdigit() else _CN_NUM.get(raw)
    if not n or n < 1:
        return default
    return min(n, 99)


def fmt_freight(freight) -> str:
    if freight is None:
        return "未知"
    try:
        f = float(freight)
    except (TypeError, ValueError):
        return "未知"
    return "包邮" if f <= 0 else f"¥{f:g}"


def fmt_value(v) -> str:
    return "暂无数据" if v in (None, "") else str(v)


def fmt_int(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def advice_verdict(target: dict, peers: list[dict]) -> tuple[str, str]:
    """规则模式选购建议启发式：返回 (结论, 理由)。价格 vs 同类均价 + 热度。"""
    price = _f(target.get("price"))
    prices = [_f(p.get("price")) for p in peers if _f(p.get("price")) > 0]
    avg = sum(prices) / len(prices) if prices else 0.0
    hot = fmt_int(target.get("viewCount")) + 5 * fmt_int(target.get("cartCount"))
    peer_hot = [fmt_int(p.get("viewCount")) + 5 * fmt_int(p.get("cartCount")) for p in peers]
    peer_hot_avg = sum(peer_hot) / len(peer_hot) if peer_hot else 0.0
    reasons = []
    if avg > 0 and price > 0:
        ratio = price / avg
        if ratio <= 0.85:
            reasons.append(f"价格 ¥{price:g} 低于同类均价 ¥{avg:.2f}")
        elif ratio >= 1.15:
            reasons.append(f"价格 ¥{price:g} 高于同类均价 ¥{avg:.2f}")
        else:
            reasons.append(f"价格 ¥{price:g} 与同类均价 ¥{avg:.2f} 接近")
    if target.get("urgent"):
        reasons.append("卖家标注急售，可能有小刀空间，但需当面验货")
    if hot >= peer_hot_avg > 0:
        reasons.append(f"热度（浏览 {fmt_int(target.get('viewCount'))}/加购 {fmt_int(target.get('cartCount'))}）不低于同类平均")
    stock = target.get("stock")
    if isinstance(stock, int) and stock <= 1:
        reasons.append("库存仅 1 件，看中要抓紧")
    if price > 0 and avg > 0 and price / avg <= 0.85 and (target.get("urgent") or hot >= peer_hot_avg):
        return "建议买", "；".join(reasons) if reasons else "综合条件不错"
    if price > 0 and avg > 0 and price / avg >= 1.15:
        return "建议对比", "；".join(reasons) if reasons else "价格偏高，建议先对比同类商品"
    return "再等等", "；".join(reasons) if reasons else "各项条件中规中矩"


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0
