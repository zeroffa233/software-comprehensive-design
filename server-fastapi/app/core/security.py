"""JWT 解析：用户 JWT（uid+role+iat+exp）由 SpringBoot 签发，本服务仅验签与校验期。"""
from datetime import datetime, timezone

import jwt

from app.core.config import settings


class AuthError(Exception):
    def __init__(self, msg: str):
        super().__init__(msg)
        self.msg = msg


def decode_user_token(token: str) -> dict:
    """校验 Bearer JWT，返回载荷；任何失败抛 AuthError。"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise AuthError("登录已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise AuthError("Token 无效")
    # agent-svc 服务令牌载荷为 uid=0（用户上下文由 X-User-Id 提供），其余令牌必须带 uid
    if not payload.get("uid") and payload.get("role") != "AGENT_SVC":
        raise AuthError("Token 缺少用户标识")
    exp = payload.get("exp")
    if exp and exp < datetime.now(timezone.utc).timestamp() - 5:
        raise AuthError("登录已过期，请重新登录")
    return payload


def issue_service_token(role: str = "AGENT_SVC", ttl_secs: int = 7200) -> str:
    """自签 agent-svc 服务令牌（仅当与 SpringBoot 约定直接签发时使用）。"""
    now = int(datetime.now(timezone.utc).timestamp())
    payload = {"uid": 0, "role": role, "iat": now, "exp": now + ttl_secs}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)
