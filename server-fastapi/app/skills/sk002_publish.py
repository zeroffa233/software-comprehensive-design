"""SK-002 商品发布辅助：润色描述、推荐分类，仅生成建议文本供用户预览。

绝不落库发布（report §9 明确禁止直接发布，须用户在页面确认后走业务 API）。
入参：草稿文本（标题+描述）≤2000 字，超出返回 4001。
"""
import logging
import re

from app.core.config import settings
from app.core.springboot import SpringBootError, client
from app.mcp.message import McpRequest, invalid_params
from app.skills.sk001_goods import match_category

logger = logging.getLogger("agent.sk002")

SYSTEM_SK002 = ("你是校园二手平台的发布辅助助手。根据用户提供的商品草稿文本，输出 JSON（仅 JSON）：\n"
                '{"title": "建议标题（5-40字，突出品名/成色/卖点）", '
                '"description": "建议描述（10-500字，包含成色、购买时间、转让原因、价格是否可议等）", '
                '"category": "最匹配的二级分类名称（从候选中选，无法判断则 null）"}\n候选分类：{categories}')


class SK002PublishAssist:
    skill_id = "SK-002"

    def run(self, mcp: McpRequest, llm_compose=None) -> dict:
        draft = (mcp.params or {}).get("draft") or ""
        draft = draft.strip()
        if len(draft) < 5:
            raise invalid_params("请提供商品草稿文本（至少包含品名和大致情况，5 字以上），"
                                 "例如：\"出一辆捷安特自行车，大二买的，骑了一年，九成新\"")
        if len(draft) > settings.DRAFT_MAX_LEN:
            raise invalid_params(f"草稿文本超长（{len(draft)} 字 > {settings.DRAFT_MAX_LEN} 字上限），请精简后重试")

        matched = match_category(draft)
        llm_suggest = self._llm_suggest(draft) if llm_compose else None

        if llm_suggest:
            title = llm_suggest.get("title") or self._tpl_title(draft)
            desc = llm_suggest.get("description") or self._tpl_desc(draft)
            cat_name = llm_suggest.get("category") or (matched or {}).get("name")
        else:
            title, desc = self._tpl_title(draft), self._tpl_desc(draft)
            cat_name = (matched or {}).get("name")

        cat_id = None
        if cat_name:
            for cat in self._flat_categories():
                if cat.get("name") == cat_name:
                    cat_id = cat.get("id")
                    break
            cat_name = cat_name or None

        template = (
            "已根据你的草稿生成发布建议（不会替你发布，请在小程序发布页确认后提交）：\n"
            f"【建议标题】{title}\n【建议描述】{desc}\n"
            + (f"【推荐分类】{cat_name}" + (f"（id={cat_id}）" if cat_id else "") if cat_name
               else "【推荐分类】暂无法判断，建议手工选择二级分类")
            + "\n提示：发布需先上传 1-6 张商品图片，提交后进入\"待审核\"。")

        return {
            "payload": {"draft": draft[:200], "suggestion": {
                "title": title, "description": desc, "category": cat_name, "categoryId": cat_id}},
            "template": template,
            "last_items": [],
        }

    def _llm_suggest(self, draft: str) -> dict | None:
        try:
            from app.agent import llm
            if not llm.llm_available():
                return None
            cats = "、".join(c["name"] for c in self._flat_categories() if c.get("parentId"))
            raw = llm._chat(SYSTEM_SK002.replace("{categories}", cats or "（分类服务暂不可用，可为 null）"),
                            f"商品草稿：{draft}", max_tokens=500)
            if not raw:
                return None
            import json
            m = re.search(r"\{.*\}", raw, re.S)
            return json.loads(m.group(0)) if m else None
        except Exception:
            logger.warning("SK-002 LLM 润色失败，回退模板", exc_info=True)
            return None

    def _flat_categories(self) -> list[dict]:
        try:
            return _flatten(client.get("/api/v1/categories") or [])
        except SpringBootError:
            return []

    def _tpl_title(self, draft: str) -> str:
        head = re.split(r"[。！？;；\n，,]", draft)[0].strip()
        head = head[:38] if head else draft[:38]
        return f"【校园二手】{head}"[:40]

    def _tpl_desc(self, draft: str) -> str:
        body = draft[:450]
        return (f"{body}\n—— 成色与细节可补充：购买时间/使用频率/有无瑕疵；"
                f"价格可小刀，支持校内当面交易。")[:500]


def _flatten(tree: list[dict]) -> list[dict]:
    flat = []
    for top in tree:
        flat.append({"id": top.get("id"), "name": top.get("name"), "parentId": 0})
        for child in top.get("children") or []:
            flat.append({"id": child.get("id"), "name": child.get("name"),
                         "parentId": top.get("id")})
    return flat
