"""Adapter nhà cung cấp LLM. Đổi nhà cung cấp chỉ cần viết adapter mới (đề xuất §11.1)."""

import os
from functools import lru_cache

from openai import AsyncOpenAI

from ..config import get_settings

OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"

# SDK openai tự đọc các biến này khi tham số tương ứng là None và coi chuỗi rỗng là giá trị
# thật. Docker compose (env_file) biến dòng "OPENAI_BASE_URL=" của agent/.env thành biến môi
# trường RỖNG → base URL rỗng (mọi lời gọi APIConnectionError/UnsupportedProtocol) và header
# OpenAI-Organization/OpenAI-Project rỗng. Settings là nguồn cấu hình duy nhất: rỗng = không đặt.
_SDK_ENV_FALLBACKS = ("OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID")


def _drop_blank_sdk_env() -> None:
    for name in _SDK_ENV_FALLBACKS:
        if name in os.environ and not os.environ[name].strip():
            del os.environ[name]


@lru_cache
def get_openai_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.llm_configured:
        raise RuntimeError("Chưa đặt OPENAI_API_KEY trong agent/.env")
    _drop_blank_sdk_env()
    return AsyncOpenAI(
        api_key=settings.openai_api_key.get_secret_value(),
        base_url=settings.openai_base_url or OPENAI_DEFAULT_BASE_URL,
        organization=settings.openai_org_id,
        project=settings.openai_project_id,
        timeout=settings.openai_timeout_s,
        # Hết giờ thì chuyển fallback ngay, không thử lại kéo dài độ trễ.
        max_retries=0,
    )
