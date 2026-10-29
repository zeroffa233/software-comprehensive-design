"""SpringBoot 业务 API 客户端。

鉴权约定（与 server-springboot 兼容的双通道）：
1. 预置令牌：env AGENT_SVC_TOKEN 直接作为服务令牌；
2. 登录换取：启动后向 SpringBoot POST /api/v1/auth/login（agent-svc 凭证）换取
   role=AGENT_SVC 的服务令牌并缓存，401 时自动重取。
所有业务取数请求携带 Bearer {服务令牌} + X-User-Id（当前用户上下文）。
"""
import logging
import threading
import time

import httpx

from app.core.config import settings

logger = logging.getLogger("agent.springboot")


class SpringBootError(Exception):
    def __init__(self, msg: str, code: int = 5000):
        super().__init__(msg)
        self.code = code
        self.msg = msg


class SpringBootClient:
    def __init__(self) -> None:
        self._token: str | None = settings.AGENT_SVC_TOKEN or None
        self._token_role: str = "AGENT_SVC" if settings.AGENT_SVC_TOKEN else ""
        self._lock = threading.Lock()
        self._client = httpx.Client(
            base_url=settings.SPRINGBOOT_BASE_URL, timeout=10.0,
            headers={"Content-Type": "application/json"},
        )
        self.ready: bool = False
        self._start_waiter()

    # ---- 服务令牌 ----
    def _fetch_service_token(self) -> str | None:
        try:
            resp = self._client.post("/api/v1/auth/login", json={
                "phone": settings.AGENT_SVC_PHONE,
                "password": settings.AGENT_SVC_PASSWORD,
                "loginType": "PASSWORD",
            }, timeout=8.0)
            body = resp.json()
        except Exception as e:
            logger.warning("agent-svc 登录换取服务令牌失败: %s", e)
            return None
        if body.get("code") == 0 and (body.get("data") or {}).get("token"):
            data = body["data"]
            role = data.get("role") or "AGENT_SVC"
            logger.info("agent-svc 服务令牌获取成功（role=%s）", role)
            return data["token"]
        logger.warning("agent-svc 登录被拒绝: code=%s msg=%s", body.get("code"), body.get("msg"))
        return None

    def _get_token(self, force_refresh: bool = False) -> str | None:
        with self._lock:
            if force_refresh or not self._token:
                self._token = self._fetch_service_token()
            return self._token

    # ---- 就绪轮询（SpringBoot 未就绪时最多等 SPRINGBOOT_WAIT_SECS） ----
    def _start_waiter(self) -> None:
        def wait_ready() -> None:
            deadline = time.monotonic() + settings.SPRINGBOOT_WAIT_SECS
            while time.monotonic() < deadline:
                try:
                    resp = self._client.get("/api/v1/categories", timeout=4.0)
                    if resp.status_code < 500:
                        self.ready = True
                        logger.info("SpringBoot 已就绪（%s），Agent Skill 链路可用", resp.status_code)
                        self._get_token()
                        return
                except Exception:
                    pass
                time.sleep(5)
            logger.warning("等待 SpringBoot 超时（%ss），Skill 调用将在请求时惰性重试",
                           settings.SPRINGBOOT_WAIT_SECS)
        threading.Thread(target=wait_ready, name="sb-waiter", daemon=True).start()

    # ---- 业务调用 ----
    def request(self, method: str, path: str, *, uid: int | None = None,
                params: dict | None = None, json_body: dict | None = None,
                user_token: str | None = None) -> dict:
        """统一返回体 {code,msg,data}；网络异常映射 5000，业务 code!=0 原样抛 SpringBootError。"""
        headers: dict[str, str] = {}
        if user_token:  # 用户 JWT 直通模式（与 agent-svc 服务令牌二选一）
            headers["Authorization"] = f"Bearer {user_token}"
        else:
            token = self._get_token()
            if not token:
                raise SpringBootError("Agent 服务账号尚未就绪，请稍后再试", 5000)
            headers["Authorization"] = f"Bearer {token}"
            if uid is not None:
                headers["X-User-Id"] = str(uid)
        try:
            resp = self._client.request(method, path, params=params, json=json_body, headers=headers)
        except httpx.HTTPError as e:
            raise SpringBootError(f"业务服务暂不可用：{e.__class__.__name__}", 5000)

        if resp.status_code == 401 and not user_token:
            # 服务令牌失效 → 强制刷新一次后重试
            token = self._get_token(force_refresh=True)
            if token:
                headers["Authorization"] = f"Bearer {token}"
                try:
                    resp = self._client.request(method, path, params=params, json=json_body, headers=headers)
                except httpx.HTTPError as e:
                    raise SpringBootError(f"业务服务暂不可用：{e.__class__.__name__}", 5000)
        try:
            body = resp.json()
        except ValueError:
            raise SpringBootError(f"业务服务响应异常（HTTP {resp.status_code}）", 5000)
        code = body.get("code", 5000 if resp.status_code >= 500 else 0)
        if code != 0:
            raise SpringBootError(body.get("msg") or f"业务错误 code={code}", code)
        return body.get("data")

    def get(self, path: str, *, uid: int | None = None, params: dict | None = None,
            user_token: str | None = None) -> dict:
        return self.request("GET", path, uid=uid, params=params, user_token=user_token)

    def post(self, path: str, *, uid: int | None = None, json_body: dict | None = None,
             user_token: str | None = None) -> dict:
        return self.request("POST", path, uid=uid, json_body=json_body, user_token=user_token)


client = SpringBootClient()
