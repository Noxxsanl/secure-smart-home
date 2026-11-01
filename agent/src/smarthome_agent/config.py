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
    openai_max_output_tokens: int = Field(1024, gt=0, alias="OPENAI_MAX_OUTPUT_TOKENS")

    # Giới hạn vòng lặp và chi phí
    max_tool_rounds: int = Field(6, ge=1, alias="AGENT_MAX_TOOL_ROUNDS")
    max_clarifications: int = Field(2, ge=0, alias="AGENT_MAX_CLARIFICATIONS")
    rate_limit_per_min: int = Field(10, ge=1, alias="AGENT_RATE_LIMIT_PER_MIN")
    daily_limit_per_home: int = Field(200, ge=1, alias="AGENT_DAILY_LIMIT_PER_HOME")
    daily_budget_usd: float = Field(2, ge=0, alias="AGENT_DAILY_BUDGET_USD")
    allow_r1_auto: bool = Field(True, alias="AGENT_ALLOW_R1_AUTO")

    # Backend
    backend_url: str = Field("http://localhost:5000", alias="BACKEND_URL")
    backend_timeout_s: float = Field(10, gt=0, alias="BACKEND_TIMEOUT_S")

    # STT
    stt_provider: Literal["none", "openai", "whisper_local"] = Field("none", alias="STT_PROVIDER")
    stt_language: str = Field("vi", alias="STT_LANGUAGE")
    stt_openai_model: str = Field("whisper-1", alias="STT_OPENAI_MODEL")
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
        if self.env == "production" and not self.llm_configured:
            raise ValueError("OPENAI_API_KEY bắt buộc khi AGENT_ENV=production")
        if self.stt_provider == "openai" and not self.llm_configured:
            raise ValueError("STT_PROVIDER=openai cần OPENAI_API_KEY")
        return self

    @property
    def llm_configured(self) -> bool:
        return bool(self.openai_api_key.get_secret_value())

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
