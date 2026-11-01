"""Adapter STT: Whisper tự host hoặc dịch vụ đám mây (STT_PROVIDER)."""

from typing import Protocol


class SpeechToText(Protocol):
    async def transcribe(self, audio: bytes, mime_type: str) -> str:
        """Trả văn bản tiếng Việt. Không lưu và không log audio."""
        ...
