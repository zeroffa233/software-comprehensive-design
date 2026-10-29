"""全局配置：读取 .env / 环境变量，严禁将密钥写入代码或数据库。"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _get(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


class Settings:
    DB_URL: str = _get("DB_URL", "mysql+pymysql://root:campus-root-2026@127.0.0.1:3306/campus_market?charset=utf8mb4")
    REDIS_URL: str = _get("REDIS_URL", "redis://127.0.0.1:6379/0")
    JWT_SECRET: str = _get("JWT_SECRET", "campus-market-dev-2026-SECRET-KEY")
    JWT_ALG: str = "HS256"

    SPRINGBOOT_BASE_URL: str = _get("SPRINGBOOT_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    SPRINGBOOT_WAIT_SECS: int = int(_get("SPRINGBOOT_WAIT_SECS", "600") or 600)

    AGENT_SVC_PHONE: str = _get("AGENT_SVC_PHONE", "13800000000")
    AGENT_SVC_PASSWORD: str = _get("AGENT_SVC_PASSWORD", "Agent@2026")
    AGENT_SVC_TOKEN: str = _get("AGENT_SVC_TOKEN")  # 预置令牌优先于登录换取
    AGENT_SVC_ACCOUNT: str = "agent-svc"  # MCP 报文 service_account 固定值

    LLM_API_KEY: str = _get("LLM_API_KEY")
    LLM_BASE_URL: str = _get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    LLM_MODEL: str = _get("LLM_MODEL", "gpt-4o-mini")

    SESSION_TTL_SECS: int = 30 * 60   # agent:session:{uid} TTL
    SESSION_MAX_ROUNDS: int = 10      # 保留最近 10 轮
    PROMPT_MAX_LEN: int = 1000
    DRAFT_MAX_LEN: int = 2000         # SK-002 草稿文本上限（report/09）


settings = Settings()
