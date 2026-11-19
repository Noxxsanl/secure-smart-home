"""Cấu hình đọc từ biến môi trường / agent/.env (xem .env.example)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# agent/.env — tính từ vị trí file để chạy được ở bất kỳ thư mục làm việc nào.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Dịch vụ
    env: Literal["development", "production"] = Field("development", alias="AGENT_ENV")
    host: str = Field("0.0.0.0", alias="AGENT_HOST")
    port: int = Field(8000, alias="AGENT_PORT")
    log_level: Literal["critical", "error", "warning", "info", "debug"] = Field(
        "info", alias="AGENT_LOG_LEVEL"
    )
    cors_origins_raw: str = Field("http://localhost:3003", alias="AGENT_CORS_ORIGINS")

    # LLM: OpenAI. SecretStr để key không lọt vào repr/log (bất biến số 2).
    openai_api_key: SecretStr = Field(SecretStr(""), alias="OPENAI_API_KEY")
    openai_model: str = Field("gpt-5-mini", alias="OPENAI_MODEL")
    openai_base_url: str | None = Field(None, alias="OPENAI_BASE_URL")
    openai_org_id: str | None = Field(None, alias="OPENAI_ORG_ID")
    openai_project_id: str | None = Field(None, alias="OPENAI_PROJECT_ID")
    openai_timeout_s: float = Field(15, gt=0, alias="OPENAI_TIMEOUT_S")
    # Model reasoning tính cả token suy luận vào hạn mức này → để rộng hơn câu trả lời dự kiến.
    openai_max_output_tokens: int = Field(2048, gt=0, alias="OPENAI_MAX_OUTPUT_TOKENS")
    # Mức suy luận của planner (Responses API `reasoning.effort`): thấp = nhanh + rẻ hơn.
    # "default" = KHÔNG gửi tham số `reasoning` (model tự dùng mức mặc định, hoặc không suy luận).
    openai_reasoning_effort: Literal["default", "none", "minimal", "low", "medium", "high"] = Field(
        "low", alias="OPENAI_REASONING_EFFORT"
    )

    # Giới hạn vòng lặp và chi phí
    max_tool_rounds: int = Field(6, ge=1, alias="AGENT_MAX_TOOL_ROUNDS")
    max_clarifications: int = Field(2, ge=0, alias="AGENT_MAX_CLARIFICATIONS")
    rate_limit_per_min: int = Field(10, ge=1, alias="AGENT_RATE_LIMIT_PER_MIN")
    daily_limit_per_home: int = Field(200, ge=1, alias="AGENT_DAILY_LIMIT_PER_HOME")
    # Thời hạn tổng một request (STT + planner + backend). Phải nhỏ hơn proxy_read_timeout của
    # nginx (60 s) để web không báo lỗi trong khi agent vẫn tạo lịch phía sau.
    request_timeout_s: float = Field(40, ge=10, alias="AGENT_REQUEST_TIMEOUT_S")

    # Backend
    backend_url: str = Field("http://localhost:5000", alias="BACKEND_URL")
    backend_timeout_s: float = Field(10, gt=0, alias="BACKEND_TIMEOUT_S")
    # Token kênh dịch vụ /api/service của backend (cùng giá trị SERVICE_API_TOKEN trong
    # backend/.env): lấy context nhà + tạo request cho Trợ lý, và gửi số liệu dùng LLM
    # (tab AI Usage). Trống = Trợ lý không gọi được backend (503), không gửi số liệu.
    # SecretStr: không lọt vào log.
    backend_service_token: SecretStr = Field(SecretStr(""), alias="BACKEND_SERVICE_TOKEN")

    # STT
    stt_provider: Literal["none", "openai", "whisper_local"] = Field("none", alias="STT_PROVIDER")
    stt_language: str = Field("vi", alias="STT_LANGUAGE")
    stt_openai_model: str = Field("gpt-4o-mini-transcribe", alias="STT_OPENAI_MODEL")
    stt_whisper_model: str = Field("small", alias="STT_WHISPER_MODEL")
    stt_max_audio_seconds: int = Field(30, ge=1, alias="STT_MAX_AUDIO_SECONDS")

    @model_validator(mode="before")
    @classmethod
    def _drop_blank(cls, data: dict) -> dict:
        # Dòng "OPENAI_BASE_URL=" trong .env là chuỗi rỗng → coi như không đặt, dùng mặc định.
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if v != ""}
        return data

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        # Chỉ production mới bắt buộc có key. Ở development thiếu key (kể cả STT_PROVIDER=openai)
        # không làm crash: /health báo llm_configured/stt_ready = false, request trả 503 rõ ràng.
        if self.env == "production" and not self.llm_configured:
            raise ValueError("OPENAI_API_KEY bắt buộc khi AGENT_ENV=production")
        return self

    @property
    def llm_configured(self) -> bool:
        return bool(self.openai_api_key.get_secret_value())

    @property
    def stt_ready(self) -> bool:
        """STT dùng được: hiện chỉ có nhà cung cấp OpenAI (whisper_local để sau)."""
        return self.stt_provider == "openai" and self.llm_configured

    @property
    def backend_configured(self) -> bool:
        """Đã có token kênh dịch vụ để gọi /api/service/agent/** của backend."""
        return bool(self.backend_service_token.get_secret_value())

    @property
    def usage_reporting_enabled(self) -> bool:
        return bool(self.backend_service_token.get_secret_value())

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
