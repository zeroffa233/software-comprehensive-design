"""Agent 编排：鉴权后的单轮对话处理。

链路：会话上下文 → 意图决策（LLM 优先，规则降级）→ MCP 报文 → Skill 执行
（实时调 SpringBoot 取数，绝不硬编码业务数据）→ 组织回复 → 会话留存 → agent_chat_log 留痕。
"""
import json
import logging
import time

from app.agent import llm, rules
from app.agent.session import append_round, load, save
from app.core.config import settings
from app.core.db import log_chat
from app.mcp.message import McpError, McpRequest
from app.skills import SKILL_NAME, registry

logger = logging.getLogger("agent.orchestrator")

LLM_HELP_SYSTEM = (
    "你是\"校园二手物品交易平台\"的智能助手。回答平台使用问题（如何注册登录、如何买/卖、"
    "发布流程、订单状态流转、交易安全提示等），或进行简短友好寒暄。要求：\n"
    "1. 平台流程：发布→待审核→在售；下单→待支付→已支付→已完成；30 分钟未支付自动取消；\n"
    "2. 你只能查询，不能替用户删除/下架/支付，涉及此类请求要说明请到小程序页面操作；\n"
    "3. 简洁友好，不超过 150 字。")

FORBIDDEN_REPLY = rules.DENY_TEXT


class ChatOutcome:
    def __init__(self, code: int, msg: str, data: dict | None, skill_name: str | None,
                 status: str):
        self.code, self.msg, self.data = code, msg, data
        self.skill_name, self.status = skill_name, status


def handle_chat(uid: int, prompt: str, request_id: str) -> ChatOutcome:
    started = time.monotonic()

    def finish(code: int, msg: str, data: dict | None, skill_name: str | None, status: str) -> ChatOutcome:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        reply = (data or {}).get("reply") or ""
        log_chat(user_id=uid, prompt=prompt, response=reply, skill_name=skill_name,
                 status=status, request_id=request_id, elapsed_ms=elapsed_ms)
        logger.info("chat done uid=%s skill=%s status=%s code=%s elapsed=%sms",
                    uid, skill_name, status, code, elapsed_ms)
        return ChatOutcome(code, msg, data, skill_name, status)

    state = load(uid)
    history = state.get("rounds", [])

    # 1) 意图决策：LLM 优先，失败/未配置 → 规则引擎
    use_llm = llm.llm_available()
    decision = llm.decide(prompt, history) if use_llm else None
    mode = "llm" if decision else "rules"
    if decision is None:
        decision = rules.decide(prompt, state)
    d_type = decision.get("type", "FALLBACK")
    params = dict(decision.get("params") or {})
    skill_id = d_type if d_type in registry.ids() else None

    # 2) 分支处理
    if d_type == "FORBIDDEN":
        reply = FORBIDDEN_REPLY if mode == "rules" else (
            llm.compose(prompt, {"denied": "该操作超出 Agent 只读/低风险 Skill 清单，须礼貌拒绝并引导到小程序页面操作"},
                        history)
            or FORBIDDEN_REPLY)
        append_round(state, prompt, reply)
        save(uid, state)
        return finish(4003, reply, {"reply": reply}, None, "DENIED")

    if skill_id:
        # 序号追问：把上一轮同 Skill 的结果列表带入参数（省略主语的指代消解）
        ordinal = params.get("ordinal")
        if ordinal is not None and not params.get("prev_items"):
            li = state.get("last_items")
            prev = (li or {}).get(skill_id) if isinstance(li, dict) else None
            params["prev_items"] = prev or []
        params["user_id"] = uid
        mcp = McpRequest(skill_id=skill_id, params=params)
        skill = registry.get(skill_id)
        try:
            if skill_id == "SK-002":
                result = skill.run(mcp, llm_compose=True)
            else:
                result = skill.run(mcp)
        except McpError as e:
            reply = _mcp_error_reply(e, history)
            append_round(state, prompt, reply)
            save(uid, state)
            status = "ERROR" if e.code != 4003 else "DENIED"
            return finish(e.code, reply, {"reply": reply}, skill_id, status)
        except Exception:
            logger.exception("skill %s 执行异常", skill_id)
            reply = "系统繁忙，请稍后再试。"
            append_round(state, prompt, reply)
            save(uid, state)
            return finish(5000, reply, {"reply": reply}, skill_id, "ERROR")

        # 3) 组织回复：LLM 基于真实业务数据组织；失败 → Skill 模板 + 规则模式声明
        reply = None
        if use_llm:
            reply = llm.compose(prompt, json.dumps(result["payload"], ensure_ascii=False), history)
        if reply is None:
            reply = result["template"] + rules.RULE_MODE_SUFFIX
        append_round(state, prompt, reply, skill_id=skill_id, last_items=result.get("last_items"))
        save(uid, state)
        return finish(0, "success", {"reply": reply, "skillName": skill_id}, skill_id, "OK")

    # 4) HELP / FALLBACK / 4001 提示类
    if d_type == "HELP":
        reply = llm._chat(LLM_HELP_SYSTEM, prompt, history) if use_llm else None
        if reply is None:
            reply = rules.HELP_TEXT + rules.RULE_MODE_SUFFIX
        append_round(state, prompt, reply)
        save(uid, state)
        return finish(0, "success", {"reply": reply}, None, "OK")

    if params.get("hint"):
        reply = params["hint"] + rules.RULE_MODE_SUFFIX
        append_round(state, prompt, reply)
        save(uid, state)
        return finish(4001, reply, {"reply": reply}, None, "ERROR")

    reply = None
    if use_llm:
        reply = llm._chat(LLM_HELP_SYSTEM, prompt, history)
    if reply is None:
        reply = rules.FALLBACK_TEXT + rules.RULE_MODE_SUFFIX
    append_round(state, prompt, reply)
    save(uid, state)
    return finish(0, "success", {"reply": reply}, None, "OK")


def _mcp_error_reply(e: McpError, history: list[dict]) -> str:
    if e.code == 4003:
        return FORBIDDEN_REPLY
    if e.code == 4001:
        return f"{e.msg}"
    return "系统繁忙，请稍后再试。"
