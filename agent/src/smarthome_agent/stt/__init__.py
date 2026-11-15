"""Adapter STT (STT_PROVIDER): `openai` đã có; `whisper_local` để sau; `none` = tắt."""

from typing import Protocol

from .openai_stt import OpenAiTranscriber


class SpeechToText(Protocol):
    async def transcribe(
        self,
        audio: bytes,
        mime_type: str,
        *,
        hint: str = "",
        duration_s: float | None = None,
        home_id: int | None = None,
        user_id: int | None = None,
        request_id: str | None = None,
    ) -> str:
        """Trả văn bản tiếng Việt. Không lưu và không log audio."""
        ...


__all__ = ["OpenAiTranscriber", "SpeechToText"]
