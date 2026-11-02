"""SK-007 识图生成描述：POST /api/v1/agent/describe-image。

入参：multipart image（jpg/png/webp，≤5MB，最短边 ≥14px）或 JSON {imageUrl}
（仅允许指向后端 /images/** 静态路径，防 SSRF）。视觉 LLM（glm-5.3-flash，
content 数组 image_url）生成 {title, description, categoryHint, tags[]} 供发布页
一键回填；不落业务库，调用留痕 agent_chat_log（skill_name=SK-007）。
LLM 无视觉/识别失败 → 4001。
"""
import io
import logging
import re

import httpx
from PIL import Image

from app.agent import llm
from app.core.config import settings
from app.mcp.message import invalid_params

logger = logging.getLogger("agent.sk007")

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MIN_SHORT_EDGE = 14
_IMAGE_PATH_RE = re.compile(r"^/images/[A-Za-z0-9._\-/]+$")


def validate_image_bytes(data: bytes) -> str:
    """校验图片字节：大小 ≤5MB、格式 jpg/png/webp（魔数）、最短边 ≥14px。
    返回 mime；不合法抛 4001。"""
    if not data:
        raise invalid_params("图片内容为空")
    if len(data) > MAX_IMAGE_BYTES:
        raise invalid_params(f"图片超过 5MB 上限（{len(data)} 字节）")
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = (im.format or "").upper()
            w, h = im.size
    except Exception:
        raise invalid_params("无法识别的图片文件（仅支持 jpg/png/webp）")
    mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(fmt)
    if not mime:
        raise invalid_params(f"不支持的图片格式：{fmt or '未知'}（仅支持 jpg/png/webp）")
    if min(w, h) < MIN_SHORT_EDGE:
        raise invalid_params(f"图片过小（{w}x{h}），最短边需 ≥{MIN_SHORT_EDGE}px")
    return mime


def load_image_url(image_url: str) -> bytes:
    """JSON 方式：imageUrl 仅允许后端 /images/** 静态路径，拉取字节后走同一校验。"""
    path = (image_url or "").strip()
    if not _IMAGE_PATH_RE.match(path) or ".." in path:
        raise invalid_params("imageUrl 非法：仅支持后端 /images/** 路径（如 /images/seed/g1.png）")
    url = f"{settings.SPRINGBOOT_BASE_URL}{path}"
    try:
        resp = httpx.get(url, timeout=10.0, follow_redirects=False)
    except Exception:
        raise invalid_params("图片拉取失败，请稍后再试")
    if resp.status_code != 200:
        raise invalid_params(f"图片拉取失败（HTTP {resp.status_code}）：{path}")
    return validate_image_bytes(resp.content)


def describe(image_bytes: bytes, mime: str) -> dict:
    """调视觉 LLM 生成发布草稿；无视觉/失败/输出不合法 → 4001。"""
    result = llm.describe_image(image_bytes, mime)
    if result is None:
        raise invalid_params("当前 LLM 不支持图片识别或识别失败（错误码 4001），请直接填写商品信息")
    data = {
        "title": str(result.get("title") or "")[:40],
        "description": str(result.get("description") or "")[:200],
        "categoryHint": result.get("categoryHint"),
        "tags": result.get("tags") or [],
    }
    if len(data["title"]) < 2 or len(data["description"]) < 5:
        raise invalid_params("识别结果不完整，请重新上传或直接填写商品信息")
    return data
