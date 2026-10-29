"""内置规则引擎：LLM 不可用/调用失败时的真实降级实现（非占位）。

覆盖：查商品(SK-001)、发布辅助(SK-002)、查订单(SK-003)、平台帮助、
追问与省略主语（"第二个呢"→沿用上一轮 Skill 与结果列表）、越权拦截、兜底话术。
"""
import re

CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
          "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

FORBIDDEN_PATTERNS = [
    r"(删除|删掉|删了|清空|移除).{0,8}(商品|订单|用户|库存|记录|评论)",
    r"(把|将).{0,10}(所有|全部|平台).{0,6}(商品|订单|东西|数据).{0,6}(删|下架|清)",
    r"(批量)?下架|批量上架|违规.{0,4}(下架|删除)",
    r"封禁|解封|拉黑|封号",
    r"(修改|篡改|改动|改).{0,6}(价格|订单|库存|商品信息|别人)",
    r"改价|改密码|换绑|改手机号",
    r"(取消|退)(订单|单|款)",
    r"(去支付|模拟支付|帮我?付|代付|支付订单|付款|直接购买|自动下单)",
    r"(冒充|假扮|假装|以).{0,4}(管理员|admin)",
    r"(查|获取|要|给我).{0,6}(别人|他人|其他用户|对方|卖家)的?(手机号|订单|地址|隐私)",
    r"(直接)?(发布|上架|落库).{0,6}(商品)?(吧|,|，)?(不要?问我|不用确认|跳过确认)",
]

ORDER_PATTERNS = r"(我的?订单|订单(状态|列表|进度|到哪|怎么样|记录)|查订单|下单了|买(了|过的?)(东西|记录)|支付(状态|了吗|时间)|发货|收货|物流|退款进度|交易记录)"
GOODS_NOUNS = ("教材", "书", "课本", "数码", "电器", "手机", "电脑", "平板", "耳机",
               "键盘", "鼠标", "台灯", "自行车", "电动车", "吉他", "椅子", "桌子",
               "柜子", "衣架", "水壶", "雨伞", "生活用品", "其他", "宝贝", "商品", "东西")
GOODS_PATTERNS = r"(查|搜|找|看看|浏览|有没有|求购|收一?个|推荐|多少钱|什么价|价格|多少钱|在卖|在售|二手|出(售|一件)?|有哪些).{0,12}"
HELP_PATTERNS = r"(你是谁|你能(做|干)什么|有什么功能|怎么用|如何使用|使用帮助|帮助|帮助我|新手指南|怎么(注册|登录|买|卖|发布|退货)|平台规则|介绍一下|在吗|你好|您好|hi|hello)"
PUBLISH_PATTERNS = r"(润色|优化).{0,6}(描述|文案|介绍)|(帮我|给我)(写|生成).{0,6}(描述|文案|标题|介绍)|(推荐|建议).{0,4}(分类|类目)|发布.{0,4}(辅助|建议|帮助)|怎么写(商品|描述|标题)|(商品|宝贝).{0,4}描述.{0,6}(怎么|帮)"

ORDINAL_RE = re.compile(r"第\s*([0-9一二两三四五六七八九十]+)\s*[个条件只台本]?")


def _cn_to_int(s: str) -> int | None:
    s = s.strip()
    if s.isdigit():
        return int(s)
    return CN_NUM.get(s)


def parse_ordinal(prompt: str) -> int | None:
    m = ORDINAL_RE.search(prompt)
    if not m:
        return None
    return _cn_to_int(m.group(1))


def parse_order_no(prompt: str) -> str | None:
    m = re.search(r"订单号?[:：]?\s*([A-Za-z0-9]{8,32})", prompt)
    if m and not m.group(1).isdigit() or (m and len(m.group(1)) >= 10):
        return m.group(1)
    return None


def _is_forbidden(prompt: str) -> bool:
    return any(re.search(p, prompt) for p in FORBIDDEN_PATTERNS)


def decide(prompt: str, state: dict) -> dict:
    """规则意图识别。返回 {"type": ..., "params": {...}}。type ∈
    SK-001/SK-002/SK-003/HELP/FORBIDDEN/FALLBACK。"""
    p = prompt.strip()
    if _is_forbidden(p):
        return {"type": "FORBIDDEN", "params": {}}

    ordinal = parse_ordinal(p)
    # 追问/省略主语："第二个呢" → 沿用上一轮命中的 Skill
    if ordinal is not None and len(p) <= 12 and not GOODS_PATTERNS_match(p):
        last = state.get("last_skill")
        if last in ("SK-001", "SK-003"):
            return {"type": last, "params": {"ordinal": ordinal}}
        return {"type": "FALLBACK", "params": {
            "hint": "你想问的\"第N个\"我还不清楚指什么，请先告诉我查商品还是查订单"}}

    order_no = parse_order_no(p)
    if re.search(ORDER_PATTERNS, p) or order_no:
        return {"type": "SK-003", "params": {"ordinal": ordinal, "orderNo": order_no}}

    if re.search(PUBLISH_PATTERNS, p):
        draft = _extract_draft(p)
        return {"type": "SK-002", "params": {"draft": draft}}

    if re.search(HELP_PATTERNS, p):
        return {"type": "HELP", "params": {}}

    if re.search(GOODS_PATTERNS, p) or any(n in p for n in GOODS_NOUNS):
        return {"type": "SK-001", "params": {"prompt": p, "ordinal": ordinal}}

    return {"type": "FALLBACK", "params": {}}


def GOODS_PATTERNS_match(p: str) -> bool:
    return bool(re.search(GOODS_PATTERNS, p) or any(n in p for n in GOODS_NOUNS))


def _extract_draft(p: str) -> str:
    """从发布辅助请求中截取草稿文本：去掉指令性前缀。"""
    draft = re.sub(r"^(帮(我|忙)?|请|麻烦)?(润色|优化|改写|写|生成|看看?|检查)(一下|下)?(这个|这个商品|商品)?(的)?(描述|文案|介绍|标题)?[,，:：]?", "", p)
    return draft.strip() or p


# ---- 规则模式话术模板 ----

DENY_TEXT = ("抱歉，该操作不在 Agent 可用范围内。出于平台安全设计（report §9），"
             "我只能提供三类只读/低风险能力：①查询在售商品 ②商品发布辅助（仅生成建议文本）"
             "③查询你本人订单状态。删除/下架/支付/查询他人信息等高风险操作请到小程序对应页面登录后操作。")

HELP_TEXT = (
    "你好，我是校园二手平台智能助手 🤖 我能帮你：\n"
    "1）查在售商品：如\"帮我找一本高数教材\"\"有没有便宜的手机\"；\n"
    "2）查你的订单：如\"我的订单\"\"第一个订单到哪一步了\"（支持追问\"第二个呢\"）；\n"
    "3）发布辅助：把商品草稿发给我，我帮你润色标题与描述、推荐分类。\n"
    "为保护账号与交易安全，我不执行删除、下架、支付等高风险操作。")

FALLBACK_TEXT = ("抱歉，我没太理解你的意思。你可以试试：\n"
                 "· \"帮我查在售的手机\" → 查商品\n"
                 "· \"我的订单\" → 查订单状态\n"
                 "· \"帮我润色商品描述：<粘贴草稿>\" → 发布辅助")

RULE_MODE_SUFFIX = "\n（以上回复由内置规则引擎生成——未配置或未连通 LLM 服务）"

NO_ORDINAL_CONTEXT = "你想问的\"第N个\"我还不清楚指什么，请先告诉我查商品还是查订单。"
ORDINAL_OUT_OF_RANGE = "这个序号超出上一轮结果范围了，共 {n} 条，可以说\"第一个\"到\"第{n}个\"。"
ORDINAL_NO_CONTEXT = NO_ORDINAL_CONTEXT
