"""Điều phối một lượt chat: context → (STT) → planner → guard → backend → AgentReply.

Quyền và mọi quyết định (làm ngay / tự đặt lịch / chờ xác nhận / từ chối) thuộc backend; ở đây
chỉ chuyển tiếp credential của người dùng, lọc sớm và soạn câu trả lời. Mỗi request log MỘT dòng
thời gian từng chặng (context/stt/planner/backend), không log nội dung câu nói.
"""

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Literal

import httpx
from openai import BadRequestError, OpenAIError

from .clients.backend import BackendClient, Credential, HomeContext, build_http_client
from .config import Settings, get_settings
from .conversation import Conversation, ConversationStore
from .errors import AgentError, unavailable
from .guard import GuardResult, guard_plan
from .planner import LlmContext, Planner, PlannerOutcome, build_llm_context, stt_hint
from .ratelimit import RateLimiter
from .reply import AgentReply, RejectedItem, compose_reply, home_tz, reject_message
from .stt import SpeechToText
from .usage import UsageSink, get_usage_reporter

logger = logging.getLogger(__name__)

MAX_UTTERANCE = 500
# Còn ít hơn ngần này giây thì không tạo yêu cầu nữa (backend có thể xử lý sau khi web đã
# báo lỗi). Ngưỡng thật = max(giá trị này, BACKEND_TIMEOUT_S + 2): create_request đã gửi đi thì
# phải kịp nhận trả lời trước hạn tổng, nếu không web nhận 503 trong khi backend vẫn đặt lịch.
MIN_TIME_TO_CREATE_S = 5.0
CREATE_REQUEST_MARGIN_S = 2.0
NOT_HEARD_MESSAGE = "Mình chưa nghe rõ, bạn nói lại giúp mình nhé."
NOTHING_DONE_MESSAGE = "Mình chưa thực hiện được yêu cầu này."


@dataclass
class Runtime:
    """Các thành phần dùng chung của tiến trình (tests thay bằng đồ giả qua get_runtime)."""

    settings: Settings
    http: httpx.AsyncClient
    conversations: ConversationStore
    limiter: RateLimiter
    sink: UsageSink
    llm: Any | None = None  # AsyncOpenAI (hoặc đồ giả có .responses/.audio)
    stt: SpeechToText | None = None
    planner: Planner | None = None

    async def aclose(self) -> None:
        await self.http.aclose()


def build_runtime(settings: Settings | None = None) -> Runtime:
    from .planner.llm import get_openai_client
    from .stt import OpenAiTranscriber

    settings = settings or get_settings()
    sink = get_usage_reporter()
    llm = get_openai_client() if settings.llm_configured else None
    stt = (
        OpenAiTranscriber(llm, settings, sink)
        if llm is not None and settings.stt_provider == "openai"
        else None
    )
    return Runtime(
        settings=settings,
        http=build_http_client(settings.backend_url, settings.backend_timeout_s),
        conversations=ConversationStore(),
        limiter=RateLimiter(settings.rate_limit_per_min, settings.daily_limit_per_home),
        sink=sink,
        llm=llm,
        stt=stt,
        planner=Planner(llm, settings, sink) if llm is not None else None,
    )


class AgentService:
    def __init__(self, runtime: Runtime, credential: Credential) -> None:
        self._rt = runtime
        self._deadline = 0.0  # đặt lại ở _within_deadline (mỗi request một AgentService)
        # Đo thời gian từng chặng của request (chỉ số đo, không nội dung — bất biến 2).
        self._request_id = uuid.uuid4().hex
        self._channel: Literal["voice", "text"] = "text"
        self._started = time.perf_counter()
        self._stage_ms: dict[str, int] = {}
        self._failed_stage: tuple[str, str] | None = None
        self._backend = BackendClient(
            runtime.http, runtime.settings.backend_service_token, credential
        )

    # --- kiểm cấu hình (trước khi tốn tiền / gọi backend) ---

    def ensure_llm(self) -> None:
        if self._rt.planner is None:
            raise AgentError(
                503,
                "LLM_DISABLED",
                "Trợ lý chưa được bật. Bạn vẫn có thể bật/tắt hoặc hẹn giờ thủ công.",
            )
        if not self._rt.settings.backend_configured:
            # Thiếu BACKEND_SERVICE_TOKEN thì không gọi được context/requests của backend.
            raise unavailable()

    def ensure_stt(self) -> SpeechToText:
        if self._rt.stt is None:
            raise AgentError(
                503,
                "STT_DISABLED",
                "Nhận dạng giọng nói chưa được bật. Bạn gõ chữ giúp mình nhé.",
            )
        return self._rt.stt

    # --- luồng chính ---

    @asynccontextmanager
    async def _stage(self, name: str) -> AsyncIterator[None]:
        """Đo thời gian một chặng (context | stt | planner | backend); ghi lại chặng bị lỗi."""
        start = time.perf_counter()
        try:
            yield
        except BaseException as exc:
            self._failed_stage = (name, type(exc).__name__)
            raise
        finally:
            self._stage_ms[name] = int((time.perf_counter() - start) * 1000)

    def _log_timing(self, result: str, *, failed: bool = False) -> None:
        """Một dòng mỗi request: thời gian từng chặng + kết quả. KHÔNG có nội dung câu nói."""

        def fmt(name: str) -> str:
            ms = self._stage_ms.get(name)
            return "-" if ms is None else f"{ms}ms"

        if failed and self._failed_stage is not None:
            stage, error = self._failed_stage
            result = f"{result} (chặng {stage}: {error})"
        total_ms = int((time.perf_counter() - self._started) * 1000)
        logger.log(
            logging.WARNING if failed else logging.INFO,
            "Trợ lý %s: kênh=%s context=%s stt=%s planner=%s backend=%s tổng=%dms kết quả=%s",
            self._request_id[:8],
            self._channel,
            fmt("context"),
            fmt("stt"),
            fmt("planner"),
            fmt("backend"),
            total_ms,
            result,
        )

    async def _within_deadline(
        self, channel: Literal["voice", "text"], work: Callable[[], Awaitable[AgentReply]]
    ) -> AgentReply:
        """Bọc cả request trong thời hạn tổng (AGENT_REQUEST_TIMEOUT_S) và log thời gian chặng."""
        self._channel = channel
        self._request_id = uuid.uuid4().hex
        self._started = time.perf_counter()
        self._deadline = asyncio.get_running_loop().time() + self._rt.settings.request_timeout_s
        try:
            async with asyncio.timeout_at(self._deadline):
                reply = await work()
        except TimeoutError:
            if self._failed_stage is not None:
                self._failed_stage = (self._failed_stage[0], "TimeoutError")
            logger.warning("Request quá thời hạn tổng")
            self._log_timing("AGENT_UNAVAILABLE", failed=True)
            raise unavailable() from None
        except AgentError as exc:
            self._log_timing(exc.code, failed=True)
            raise
        except Exception as exc:
            self._log_timing(type(exc).__name__, failed=True)
            raise
        self._log_timing(reply.type)
        return reply

    def _check_time_left(self) -> None:
        """Gần hết thời hạn thì KHÔNG tạo yêu cầu: tránh web báo lỗi trong khi lịch vẫn được đặt."""
        backend_window = self._rt.settings.backend_timeout_s + CREATE_REQUEST_MARGIN_S
        needed = max(MIN_TIME_TO_CREATE_S, backend_window)
        if self._deadline - asyncio.get_running_loop().time() < needed:
            logger.warning("Còn quá ít thời gian, bỏ qua tạo yêu cầu")
            raise unavailable()

    def _hit_limits(self, home_id: int, user_id: int) -> None:
        # Sau khi backend xác nhận người dùng + nhà: giới hạn theo user_id và theo nhà.
        self._rt.limiter.hit_account(user_id)
        self._rt.limiter.hit_home(home_id)

    async def handle_text(self, home_id: int, text: str, conversation_id: str | None) -> AgentReply:
        return await self._within_deadline(
            "text", lambda: self._handle_text(home_id, text, conversation_id)
        )

    async def handle_voice(
        self,
        home_id: int,
        audio: bytes,
        mime_type: str,
        duration_s: float | None,
        conversation_id: str | None,
    ) -> AgentReply:
        return await self._within_deadline(
            "voice",
            lambda: self._handle_voice(home_id, audio, mime_type, duration_s, conversation_id),
        )

    async def _handle_text(
        self, home_id: int, text: str, conversation_id: str | None
    ) -> AgentReply:
        self.ensure_llm()
        async with self._stage("context"):
            context = await self._backend.get_context(home_id)
        self._hit_limits(home_id, context.actor.user_id)
        return await self._respond(
            context, text, conversation_id, input_kind="text", transcript=None
        )

    async def _handle_voice(
        self,
        home_id: int,
        audio: bytes,
        mime_type: str,
        duration_s: float | None,
        conversation_id: str | None,
    ) -> AgentReply:
        self.ensure_llm()
        stt = self.ensure_stt()
        # Backend xác thực người dùng + nhà TRƯỚC khi tốn tiền STT.
        async with self._stage("context"):
            context = await self._backend.get_context(home_id)
        self._hit_limits(home_id, context.actor.user_id)
        try:
            async with self._stage("stt"):
                transcript = await stt.transcribe(
                    audio,
                    mime_type,
                    hint=stt_hint(context),
                    duration_s=duration_s,
                    home_id=home_id,
                    user_id=context.actor.user_id,
                    request_id=self._request_id,
                )
        except BadRequestError as exc:
            # OpenAI từ chối bản ghi (quá ngắn/hỏng/không giải mã được): lỗi của đầu vào, không
            # phải lỗi dịch vụ → xin người dùng nói lại thay vì báo "Trợ lý đang tạm bận".
            # code/param là mã lỗi của OpenAI (không có nội dung audio) — để phân biệt bản ghi hỏng
            # với cấu hình sai (STT_LANGUAGE/model) vốn sẽ 400 mãi.
            logger.warning(
                "STT từ chối bản ghi: BadRequestError code=%s param=%s",
                getattr(exc, "code", None),
                getattr(exc, "param", None),
            )
            transcript = ""
        except (OpenAIError, httpx.HTTPError, TimeoutError) as exc:
            logger.warning("STT thất bại: %s", type(exc).__name__)
            raise unavailable() from None
        if not transcript:
            conversation = self._rt.conversations.open(
                conversation_id, context.actor.user_id, home_id
            )
            return AgentReply(
                conversation_id=conversation.id,
                type="clarify",
                reply=NOT_HEARD_MESSAGE,
                transcript="",
            )
        return await self._respond(
            context, transcript, conversation_id, input_kind="voice", transcript=transcript
        )

    async def _respond(
        self,
        context: HomeContext,
        text: str,
        conversation_id: str | None,
        *,
        input_kind: Literal["voice", "text"],
        transcript: str | None,
    ) -> AgentReply:
        rt = self._rt
        assert rt.planner is not None  # ensure_llm đã kiểm
        home_id = context.home.id
        user_id = context.actor.user_id
        conversation = rt.conversations.open(conversation_id, user_id, home_id)
        llm_context = build_llm_context(context)

        try:
            async with self._stage("planner"):
                outcome = await rt.planner.run(
                    user_text=text,
                    context=llm_context,
                    history=list(conversation.messages),
                    clarifications_used=conversation.clarifications,
                    home_id=home_id,
                    user_id=user_id,
                    request_id=self._request_id,
                )
        except (OpenAIError, httpx.HTTPError, TimeoutError) as exc:
            logger.warning("Planner thất bại: %s", type(exc).__name__)
            raise unavailable() from None

        reply = await self._finish(
            outcome, context, llm_context, conversation, text, input_kind, transcript
        )
        rt.conversations.add(conversation, "user", text)
        rt.conversations.add(conversation, "assistant", reply.reply)
        return reply

    async def _finish(
        self,
        outcome: PlannerOutcome,
        context: HomeContext,
        llm_context: LlmContext,
        conversation: Conversation,
        text: str,
        input_kind: Literal["voice", "text"],
        transcript: str | None,
    ) -> AgentReply:
        base: dict[str, Any] = {"conversation_id": conversation.id, "transcript": transcript}

        if outcome.kind == "clarify":
            conversation.clarifications += 1
            return AgentReply(
                **base,
                type="clarify",
                reply=outcome.text,
                clarification=outcome.clarification,
            )
        if outcome.kind in ("answer", "refuse") or outcome.plan is None:
            return AgentReply(**base, type=outcome.kind, reply=outcome.text)

        guard = guard_plan(outcome.plan, llm_context.refs)
        rejected = [RejectedItem(**vars(r)) for r in guard.rejected]
        if not guard.steps:
            return AgentReply(
                **base, type="refuse", reply=_refusal_text(rejected), rejected=rejected
            )

        payload = {
            "input_kind": input_kind,
            "utterance": text[:MAX_UTTERANCE],
            "summary": outcome.plan.summary.strip()[:200] or "Yêu cầu của bạn",
            "steps": guard.steps,
        }
        self._check_time_left()
        async with self._stage("backend"):
            result = await self._backend.create_request(context.home.id, payload)
        conversation.clarifications = 0

        rejected += self._backend_rejections(result.rejected, guard, outcome, llm_context)
        rejected.sort(key=lambda r: r.index)

        executed = result.executed
        scheduled = result.scheduled
        pending = result.pending if result.pending and result.pending.get("steps") else None
        if not executed and not scheduled and pending is None:
            return AgentReply(
                **base, type="refuse", reply=_refusal_text(rejected), rejected=rejected
            )

        tz = home_tz(context.home.timezone, context.home.local_now)
        reply_type, reply_text = compose_reply(
            executed, scheduled, pending, tz, context.home.local_now
        )
        return AgentReply(
            **base,
            type=reply_type,
            reply=reply_text,
            executed=executed,
            scheduled=scheduled,
            pending=pending,
            rejected=rejected,
        )

    @staticmethod
    def _backend_rejections(
        items: list[Any], guard: GuardResult, outcome: PlannerOutcome, llm_context: LlmContext
    ) -> list[RejectedItem]:
        """Đổi index của backend (vị trí trong mảng đã gửi) về vị trí gốc trong kế hoạch LLM."""
        assert outcome.plan is not None
        out: list[RejectedItem] = []
        for item in items:
            if not 0 <= item.index < len(guard.plan_indexes):
                continue
            plan_index = guard.plan_indexes[item.index]
            name = llm_context.refs.device_label(outcome.plan.steps[plan_index].device_ref)
            out.append(
                RejectedItem(
                    index=plan_index, code=item.code, message=reject_message(item.code, name)
                )
            )
        return out


def _refusal_text(rejected: list[RejectedItem]) -> str:
    if not rejected:
        return NOTHING_DONE_MESSAGE
    return "Mình chưa làm được: " + " ".join(r.message for r in rejected)
