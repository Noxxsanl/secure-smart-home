"""STT qua OpenAI (`audio.transcriptions`). Không lưu, không log audio và transcript."""

from typing import Any

from ..config import Settings
from ..usage import UsageSink, track_llm_call

# MIME (đã bỏ `;codecs=…`) → tên file giả cho SDK (OpenAI đoán định dạng theo đuôi).
_EXTENSIONS = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/x-m4a": "m4a",
}
MAX_BILLED_SECONDS = 30.0


class OpenAiTranscriber:
    def __init__(self, client: Any, settings: Settings, sink: UsageSink) -> None:
        self._client = client
        self._settings = settings
        self._sink = sink

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
        settings = self._settings
        filename = f"audio.{_EXTENSIONS.get(mime_type, 'webm')}"
        kwargs: dict[str, Any] = {
            "model": settings.stt_openai_model,
            "file": (filename, audio, mime_type),
            "language": settings.stt_language,
        }
        if hint:
            kwargs["prompt"] = hint[:200]
        async with track_llm_call(
            self._sink,
            provider="openai",
            model=settings.stt_openai_model,
            purpose="stt",
            home_id=home_id,
            user_id=user_id,
            request_id=request_id,
        ) as call:
            if duration_s is not None:
                call.set_audio_seconds(min(max(duration_s, 0.0), MAX_BILLED_SECONDS))
            result = await self._client.audio.transcriptions.create(**kwargs)
        text = getattr(result, "text", None)
        if text is None and isinstance(result, dict):
            text = result.get("text")
        return (text or "").strip()
