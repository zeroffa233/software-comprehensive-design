"""agent_chat_log 留痕：本服务对 campus_market 库只读写这一张表。

表结构以 design/db-用户及权限.md §3 为准；为避免与 SpringBoot migration 竞态，
采用 CREATE TABLE IF NOT EXISTS（若对方已建表则为空操作），并在首次写入时探测
实际列集合：若表中存在 request_id / elapsed_ms 等扩展列则一并落库。
"""
import logging
import threading
from datetime import datetime

from sqlalchemy import create_engine, text

from app.core.config import settings

logger = logging.getLogger("agent.db")

engine = create_engine(settings.DB_URL, pool_pre_ping=True, pool_recycle=1800, future=True)

_ensured = False
_columns: set[str] | None = None
_lock = threading.Lock()

DDL = """
CREATE TABLE IF NOT EXISTS agent_chat_log (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT UNSIGNED DEFAULT NULL COMMENT '发起用户',
    prompt VARCHAR(1000) NOT NULL COMMENT '用户输入原文',
    response VARCHAR(2000) DEFAULT NULL COMMENT 'Agent 响应摘要',
    skill_name VARCHAR(32) DEFAULT NULL COMMENT '命中 Skill',
    status ENUM('OK','DENIED','ERROR') NOT NULL COMMENT 'OK/DENIED=越权拦截/ERROR',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '时间',
    INDEX idx_user_time (user_id, create_time),
    INDEX idx_skill_status (skill_name, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def _detect_columns() -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                 "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_chat_log'")
        ).fetchall()
        return {r[0] for r in rows}


def ensure_table() -> None:
    global _ensured, _columns
    with _lock:
        if _ensured:
            return
        try:
            with engine.begin() as conn:
                conn.execute(text(DDL))
            _columns = _detect_columns()
            _ensured = True
            logger.info("agent_chat_log ready, columns=%s", sorted(_columns))
        except Exception:
            logger.exception("agent_chat_log 初始化失败（MySQL 未就绪？），首次写入将重试")


def log_chat(*, user_id: int | None, prompt: str, response: str,
             skill_name: str | None, status: str,
             request_id: str | None = None, elapsed_ms: int | None = None) -> None:
    """留痕一条调用记录；写日志失败仅告警，不影响业务返回（report/09 安全约束 5）。"""
    try:
        if not _ensured:
            ensure_table()
        cols: dict = {
            "user_id": user_id,
            "prompt": prompt[:1000],
            "response": (response or "")[:2000],
            "skill_name": skill_name[:32] if skill_name else None,
            "status": status,
            "create_time": datetime.now(),
        }
        if _columns:
            if "request_id" in _columns and request_id is not None:
                cols["request_id"] = request_id[:64]
            if "elapsed_ms" in _columns and elapsed_ms is not None:
                cols["elapsed_ms"] = elapsed_ms
        keys = ", ".join(cols)
        binds = ", ".join(f":{k}" for k in cols)
        with engine.begin() as conn:
            conn.execute(text(f"INSERT INTO agent_chat_log ({keys}) VALUES ({binds})"), cols)
    except Exception:
        logger.exception("agent_chat_log 写入失败")
