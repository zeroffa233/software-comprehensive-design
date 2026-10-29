"""Skill 注册表：SK-001 商品查询 / SK-002 发布辅助 / SK-003 订单查询。

清单严格对照 DESIGN.md §7 与 report §9 —— 仅 3 项只读/低风险 Skill，
超出清单的能力一律在编排层拦截为 4003，不进入 Skill 层。
"""
from app.skills.sk001_goods import SK001GoodsQuery
from app.skills.sk002_publish import SK002PublishAssist
from app.skills.sk003_orders import SK003OrderQuery

SKILL_NAME = {
    "SK-001": "商品信息查询",
    "SK-002": "商品发布辅助",
    "SK-003": "订单状态查询",
}


class SkillRegistry:
    def __init__(self) -> None:
        self._skills = {
            "SK-001": SK001GoodsQuery(),
            "SK-002": SK002PublishAssist(),
            "SK-003": SK003OrderQuery(),
        }

    def get(self, skill_id: str):
        return self._skills.get(skill_id)

    def ids(self) -> list[str]:
        return list(self._skills)


registry = SkillRegistry()
