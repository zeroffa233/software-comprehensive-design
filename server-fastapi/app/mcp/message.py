"""MCP 报文模型与 Agent 错误码（DESIGN.md §7 / report §9）。

请求：request_id、service_account（固定 agent-svc）、skill_id、params（含 user_id）、timestamp(Unix 毫秒)。
响应/错误码：0 成功、4001 参数非法、4003 权限不足、5000 业务错误。
"""
import time
import uuid
from typing import Any

from pydantic import BaseModel, Field


def new_request_id() -> str:
    return uuid.uuid4().hex


class McpRequest(BaseModel):
    request_id: str = Field(default_factory=new_request_id)
    service_account: str = "agent-svc"
    skill_id: str
    params: dict[str, Any] = Field(default_factory=dict)
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))


class McpResult(BaseModel):
    code: int = 0
    msg: str = "success"
    data: Any = None


class McpError(Exception):
    """Skill 层统一异常：4001 参数非法 / 4003 权限不足 / 5000 业务错误。"""

    def __init__(self, code: int, msg: str):
        super().__init__(msg)
        self.code = code
        self.msg = msg


def invalid_params(msg: str) -> McpError:
    return McpError(4001, msg)


def permission_denied(msg: str = "该操作不在 Agent 可用范围内") -> McpError:
    return McpError(4003, msg)


def business_error(msg: str = "系统繁忙，请稍后再试") -> McpError:
    return McpError(5000, msg)
