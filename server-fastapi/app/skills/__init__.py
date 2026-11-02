"""Skill 注册表：SK-001~SK-007（v2.1.0 AI 增强：比对/选购建议/下单草稿/识图）。

SK-001~003 对照 DESIGN.md §7 与 report §9；SK-004/005 只读，SK-006 仅生成下单草稿
（绝不调 POST /orders），SK-007 视觉识图仅生成发布草稿文本 —— 全部不写业务库。
超出清单的能力一律在编排层拦截为 4003，不进入 Skill 层。
SK-007 识图走独立 REST 端点（/api/v1/agent/describe-image，非对话意图），不进对话分发。
"""
from app.skills.sk001_goods import SK001GoodsQuery
from app.skills.sk002_publish import SK002PublishAssist
from app.skills.sk003_orders import SK003OrderQuery
from app.skills.sk004_compare import SK004GoodsCompare
from app.skills.sk005_advice import SK005BuyAdvice
from app.skills.sk006_order_draft import SK006OrderDraft

SKILL_NAME = {
    "SK-001": "商品信息查询",
    "SK-002": "商品发布辅助",
    "SK-003": "订单状态查询",
    "SK-004": "商品比对",
    "SK-005": "选购建议",
    "SK-006": "智能下单草稿",
    "SK-007": "识图生成描述",
}


class SkillRegistry:
    def __init__(self) -> None:
        self._skills = {
            "SK-001": SK001GoodsQuery(),
            "SK-002": SK002PublishAssist(),
            "SK-003": SK003OrderQuery(),
            "SK-004": SK004GoodsCompare(),
            "SK-005": SK005BuyAdvice(),
            "SK-006": SK006OrderDraft(),
        }

    def get(self, skill_id: str):
        return self._skills.get(skill_id)

    def ids(self) -> list[str]:
        return list(self._skills)


registry = SkillRegistry()
