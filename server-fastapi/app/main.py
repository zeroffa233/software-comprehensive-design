"""FastAPI 入口：Agent 对话真入口（小程序 → SpringBoot :8080 薄代理 → 本服务 :8100）。

统一返回 {code, msg, data}；HTTP 状态码仅用于鉴权(401)/参数(400)，业务错误码
4001/4003/5000 以响应体 code 表达（与 server-springboot 一致）。
"""
import json
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, Response
from pydantic import BaseModel, Field

from app.agent import llm
from app.agent.orchestrator import handle_chat
from app.core import db
from app.core.config import settings
from app.core.security import AuthError, decode_user_token
from app.core.springboot import client as sb_client

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("agent.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.ensure_table()
    logger.info("Agent 服务启动：SpringBoot=%s LLM=%s",
                "已配置" if settings.SPRINGBOOT_BASE_URL else "未配置",
                "LLM 模式" if llm.llm_available() else "规则模式（未配置 LLM_API_KEY）")
    yield


app = FastAPI(title="campus-market-agent", version="1.0.0", lifespan=lifespan)


class ChatRequest(BaseModel):
    prompt: str = Field(..., description="用户自然语言输入，≤1000 字")
    requestId: str | None = Field(None, description="链路追踪 ID，缺省自动生成")
    userId: int | None = Field(None, description="SpringBoot 代理转发时的用户上下文（可选）")


@app.get("/health")
def health():
    return {"status": "ok", "service": "agent", "port": 8100,
            "springbootReady": sb_client.ready, "llmMode": llm.llm_available()}


def _resolve_uid(authorization: str | None, x_user_id: str | None,
                 body_user_id: int | None) -> tuple[int | None, dict | None]:
    """用户上下文解析（双通道兼容）：
    1) SpringBoot 代理：X-User-Id 头（代理侧已完成用户鉴权），优先；
    2) 直连：Authorization Bearer 用户 JWT（验签+有效期，role ∈ USER/ADMIN）。
    返回 (uid, err_response_dict)。"""
    if x_user_id:
        try:
            return int(x_user_id), None
        except ValueError:
            return None, {"code": 400, "msg": "X-User-Id 头格式非法", "data": None}
    if authorization:
        token = authorization.removeprefix("Bearer ").strip()
        try:
            payload = decode_user_token(token)
        except AuthError as e:
            return None, {"code": 401, "msg": e.msg, "data": None}
        if payload.get("role") in ("USER", "ADMIN"):
            return int(payload["uid"]), None
        if payload.get("role") == "AGENT_SVC":
            if body_user_id:
                return int(body_user_id), None
            return None, {"code": 401, "msg": "服务令牌调用须携带 X-User-Id 用户上下文", "data": None}
        return None, {"code": 401, "msg": "角色无权访问 Agent", "data": None}
    if body_user_id:
        return int(body_user_id), None
    return None, {"code": 401, "msg": "未登录或缺少用户上下文，请先登录", "data": None}


@app.post("/api/v1/agent/chat")
def agent_chat(body: ChatRequest, authorization: str | None = Header(default=None),
               x_user_id: str | None = Header(default=None)):
    uid, err = _resolve_uid(authorization, x_user_id, body.userId)
    if err:
        return _json_err(err)

    prompt = (body.prompt or "").strip()
    if not prompt:
        return _json_err({"code": 400, "msg": "prompt 不能为空", "data": None})
    if len(prompt) > settings.PROMPT_MAX_LEN:
        return _json_err({"code": 400, "msg": f"prompt 超长（{len(prompt)} > {settings.PROMPT_MAX_LEN} 字）", "data": None})
    request_id = (body.requestId or uuid.uuid4().hex)[:64]

    outcome = handle_chat(uid, prompt, request_id)
    return {"code": outcome.code, "msg": outcome.msg,
            "data": outcome.data if outcome.code == 0 else None}


def _json_err(err: dict):
    """带 HTTP 状态码的错误返回（401/400 语义化；其余 200+业务码）。"""
    status = err["code"] if err["code"] in (400, 401) else 200
    return Response(content=json.dumps(err, ensure_ascii=False),
                    status_code=status, media_type="application/json")
