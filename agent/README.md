# agent/ — Trợ lý AI (giọng nói + chữ) cho web app user và app Mobile

Dịch vụ Python (FastAPI) nhận câu nói tiếng Việt của khách hàng (ghi âm hoặc gõ chữ), dùng STT + LLM (OpenAI)
để hiểu ý, rồi để **backend** quyết định và thực thi (lệnh rõ → làm ngay hoặc tự hẹn giờ; lệnh chưa rõ → chờ xác nhận). Đề xuất gốc:
[`docs/proposals/DE_XUAT_AI_AGENT.md`](../docs/proposals/DE_XUAT_AI_AGENT.md); hợp đồng chi tiết Giai đoạn 2 nằm ở
`docs/API_DESIGN.md` (kênh `/api/agent/*`) và `backend/src/modules/agent/`.

> **Trạng thái (2026-11):** đã hiện thực API `/v1/homes/{id}/voice` + `/messages` + `/health`, STT OpenAI, planner
> (Responses API, tool `ask_clarification` / `propose_plan`), guard, hội thoại trong RAM, rate limit, client backend,
> bộ eval. Có bộ test giả (OpenAI/backend giả) và **đã chạy với key OpenAI thật** (xác nhận 2026-11-17); chạy
> `eval/run_eval.py` để đo chất lượng hiểu tiếng Việt. Chưa làm: STT `whisper_local`, tool đọc dữ liệu động, lưu hội thoại
> bền, giới hạn chung nhiều replica (rate limit đang ở bộ nhớ tiến trình), ngân sách USD/ngày, luật dự phòng
> (FR-7.18).

## Luồng một lượt

```
Trình duyệt / app Mobile ──/api/agent/*──► (Next rewrite / nginx) ──► agent:8000/v1/*
  voice: audio thô (≤ 1 MB)      │ 1. credential (cookie sh_user + X-Portal: user, hoặc Bearer) → 401 / 403
  messages: {text ≤ 500, body ≤ 16 KB} │ 2. rate limit theo credential (10/phút) → 429
                                 │ 3. kiểm audio/body (415 / 400 / 413) và cấu hình (503 LLM_DISABLED / STT_DISABLED)
                                 │ 4. GET backend /api/service/agent/homes/:id/context  (backend xác thực người dùng + nhà)
                                 │ 5. rate limit theo user_id (10/phút) + theo nhà (200/ngày) → 429
                                 │ 6. STT (chỉ voice) → transcript (OpenAI từ chối bản ghi → clarify "chưa nghe rõ")
                                 │ 7. planner (OpenAI Responses API, reasoning.effort = OPENAI_REASONING_EFFORT):
                                 │    trả lời chữ | ask_clarification | propose_plan
                                 │ 8. guard (lọc sớm) → POST backend .../requests  (backend quyết định tất định:
                                 │    lệnh rõ chạy ngay → executed, hẹn giờ rõ → scheduled, còn lại → pending)
                                 └► AgentReply { type: answer|done|scheduled|confirm|mixed|clarify|refuse,
                                                 reply, executed[], scheduled[], pending, … }
```

- Đường vào qua nginx: web khách qua `user.localhost/api/agent/` (cookie `sh_user`); app Mobile (từ 2026-11-15) qua
  server mặc định cổng 80 `http://<IP>/api/agent/`, nginx **chỉ chuyển khi có `Authorization: Bearer …`** (không có →
  404), bỏ header `Cookie`, giới hạn 30 req/phút/IP, thân ≤ 2 MB. Trên máy ảo Android dev có thể gọi thẳng
  `http://10.0.2.2:8000/v1`. admin/operator vẫn không có Trợ lý.
- Credential của người dùng được chuyển **nguyên trạng** cho backend: cookie → header `Cookie: sh_user=<giá trị>`
  (chỉ cookie `sh_user`, không cookie nào khác); Bearer → `X-User-Authorization`. Mọi lời gọi kèm
  `Authorization: Bearer <BACKEND_SERVICE_TOKEN>` (= `SERVICE_API_TOKEN` của backend). Credential giữ bằng `SecretStr`,
  không log, không đưa vào thông điệp lỗi.
- Lỗi trả `{ "error": "CODE", "message": "câu tiếng Việt" }`: `NO_TOKEN` 401 · `CSRF_CHECK_FAILED` 403 ·
  `SESSION_EXPIRED` 401 (chỉ khi backend báo phiên người dùng sai: `NO_TOKEN`/`INVALID_TOKEN`/`TOKEN_EXPIRED`) ·
  `ACCOUNT_LOCKED` 403 · `FORBIDDEN` 403 · `HOME_NOT_FOUND` 404 · `EMPTY_AUDIO` 400 · `AUDIO_TOO_LARGE` 413 ·
  `MESSAGE_TOO_LARGE` 413 · `UNSUPPORTED_AUDIO` 415 · `RATE_LIMITED` 429 · `INVALID_INPUT` 400 ·
  `LLM_DISABLED` / `STT_DISABLED` / `AGENT_UNAVAILABLE` 503. Sai `BACKEND_SERVICE_TOKEN` (backend 401
  `INVALID_SERVICE_TOKEN`) hoặc kênh dịch vụ tắt (503 `SERVICE_CHANNEL_DISABLED`) → 503 `AGENT_UNAVAILABLE`, KHÔNG
  phải 401 (để web không đăng xuất người dùng); mã lỗi backend được log, token thì không.
- Thời hạn tổng một request `AGENT_REQUEST_TIMEOUT_S` (40 s, dưới `proxy_read_timeout` 60 s của nginx) → 503
  `AGENT_UNAVAILABLE`; còn < 5 s mà chưa tạo yêu cầu thì dừng, không đặt lịch.
- `reply` của `done` / `scheduled` / `confirm` / `mixed` do **code** soạn từ kết quả backend (nhãn hành động backend sinh);
  chỉ `answer` / `clarify` / `refuse` lấy chữ của LLM. LLM từ chối bằng chữ bắt đầu `[TU_CHOI]` (code gỡ dấu rồi gắn
  `type: refuse`).
- `executed` = các bước backend đã chạy ngay (lệnh người dùng nói/gõ rõ), kèm kết quả `done` / `skipped` / `failed`…;
  luôn có trong JSON (mảng rỗng nếu không có). Lý do thất bại hiển thị bằng câu tiếng Việt, không mã thô.
- Log thời gian: mỗi request đúng MỘT dòng INFO (WARNING khi lỗi, kèm chặng hỏng + tên lớp lỗi), chỉ có số đo:
  `Trợ lý 1a2b3c4d: kênh=voice context=85ms stt=640ms planner=1900ms backend=210ms tổng=2870ms kết quả=done`
  (chặng không chạy tới ghi `-`; `kết quả` = loại phản hồi hoặc mã lỗi). Không có câu nói/transcript/câu trả lời.
- `rejected[].index` là vị trí bước trong kế hoạch LLM đề ra; `pending.steps[].index` là chỉ số backend dùng cho
  `confirm`. Hai dãy này khác nhau khi guard đã loại bớt bước.

## Cấu trúc

```
src/smarthome_agent/
├── main.py              app FastAPI (create_app, lifespan, handler lỗi tiếng Việt)
├── config.py            Settings đọc agent/.env bằng pydantic-settings
├── errors.py            AgentError (mã + câu tiếng Việt cố định)
├── service.py           AgentService (điều phối một lượt) + Runtime (đồ dùng chung)
├── reply.py             AgentReply + soạn câu done/scheduled/confirm/mixed tất định
├── conversation.py      hội thoại trong RAM (10 phút, 500 hội thoại, ~12 tin gần nhất)
├── ratelimit.py         rate limit theo người + theo nhà (bộ nhớ tiến trình)
├── api/                 deps.py (credential, CSRF), commands.py (voice, messages), health.py
├── planner/             orchestrator.py (vòng tool), context.py (ngữ cảnh + ref), schemas.py, llm.py
├── tools/               định nghĩa 2 tool strict; KHÔNG có tool thực thi
├── guard/               plan.py (lọc sớm), text.py (chuẩn hoá chữ — phải giống bản TypeScript của backend)
├── stt/                 openai_stt.py (none | openai | whisper_local — chưa có)
├── clients/backend/     client viết tay: get_context, create_request
└── usage/               đo token/độ trễ gửi tab AI Usage
prompts/system_vi.md     system prompt tiếng Việt
eval/                    cases.jsonl (~30 câu) + run_eval.py (--effort/--max-calls/--ids; cần key thật, không chạy trong CI)
tests/                   pytest, mọi thứ ngoài đều giả (không gọi mạng)
```

## Phụ thuộc

- `requirements.txt` — phụ thuộc chạy, ghim bản; Docker và CI cài từ đây.
- `requirements-dev.txt` — thêm pytest, pytest-asyncio, ruff.
- `pyproject.toml` — metadata gói + cấu hình ruff/pytest. Nâng phiên bản thì sửa cả hai nơi.

## Chạy local (Python 3.12)

```bash
cp agent/.env.example agent/.env   # scripts/setup.sh tự làm; rồi điền OPENAI_API_KEY + BACKEND_SERVICE_TOKEN
make agent-venv                    # tạo agent/.venv + cài requirements-dev.txt
make agent-test                    # ruff check + ruff format --check + pytest (giống CI)

cd agent
.venv/Scripts/activate             # Linux/macOS: source .venv/bin/activate
pip install --no-deps -e .         # để có lệnh smarthome-agent
smarthome-agent                    # http://localhost:8000/health, /docs
```

Không có `make`: chạy tay `py -3.12 -m venv .venv`, `.venv/Scripts/pip install -r requirements-dev.txt`,
`.venv/Scripts/ruff check .`, `.venv/Scripts/ruff format --check .`, `.venv/Scripts/python -m pytest`.

Test không đọc key thật: `tests/conftest.py` ghi đè `OPENAI_API_KEY`, `BACKEND_SERVICE_TOKEN` rỗng; OpenAI giả,
backend giả bằng `httpx.MockTransport`, dependency override của FastAPI.

### Biến môi trường chính (đầy đủ: `.env.example`)

| Biến | Ý nghĩa |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL` | LLM planner. Thiếu key: development vẫn chạy (`/health` báo `llm_configured=false`, request 503 `LLM_DISABLED`); `AGENT_ENV=production` thì không khởi động |
| `STT_PROVIDER`, `STT_OPENAI_MODEL` | `openai` (mặc định `gpt-4o-mini-transcribe`) · `none` (tắt, voice trả 503 `STT_DISABLED`) · `whisper_local` chưa có |
| `BACKEND_URL`, `BACKEND_SERVICE_TOKEN` | backend và token kênh dịch vụ (**trùng** `SERVICE_API_TOKEN` của backend). Thiếu token → 503 `AGENT_UNAVAILABLE` |
| `AGENT_RATE_LIMIT_PER_MIN` (10), `AGENT_DAILY_LIMIT_PER_HOME` (200) | giới hạn mỗi phút theo credential và theo `user_id` (đăng nhập lại không lách được) / theo nhà mỗi ngày (UTC) |
| `AGENT_REQUEST_TIMEOUT_S` (40, ≥ 10) | thời hạn tổng một request (STT + planner + backend) |
| `AGENT_MAX_TOOL_ROUNDS` (6), `AGENT_MAX_CLARIFICATIONS` (2) | số vòng gọi lại khi tham số tool sai; số lần hỏi lại tối đa mỗi hội thoại |
| `OPENAI_MAX_OUTPUT_TOKENS` (2048) | model reasoning tính cả token suy luận vào hạn mức này |
| `OPENAI_REASONING_EFFORT` (`low`) | mức suy luận của planner gửi qua `reasoning.effort`: `none` · `minimal` · `low` · `medium` · `high`; `default` = không gửi tham số (model tự chọn, thường `medium` → chậm hơn). Thấp = nhanh + rẻ; đo bằng `eval/run_eval.py --effort …` rồi chọn mức ít tốn nhất vẫn giữ chất lượng |

`GET /health` → `{status, llm_configured, stt_ready, backend_configured}`, không bao giờ trả key/token.

## Docker

- Dev: service `agent` trong `compose.yaml` — `docker compose up --build agent` (không cần backend để khởi động),
  cổng `127.0.0.1:8000`, bind-mount `src/` + reload. Thiếu `agent/.env` vẫn chạy.
- Prod: service `agent` trong `compose.prod.yaml` — `AGENT_ENV=production`, không publish cổng;
  bắt buộc `agent/.env` có `OPENAI_API_KEY`. Prompt đọc từ `prompts/` trong thư mục làm việc `/app`.

## CI

Job **Agent (ruff, pytest)** trong `.github/workflows/ci.yml`, chạy khi `agent/**` đổi: Python 3.12,
`pip install -r requirements-dev.txt`, `ruff check .`, `ruff format --check .`, `pytest`. Eval không chạy trong CI.

## Đo chi phí, token, độ trễ (tab AI Usage)

`src/smarthome_agent/usage/` gửi số liệu mỗi lần gọi LLM/STT về backend (`POST /api/service/ai-usage`, Bearer `BACKEND_SERVICE_TOKEN`). Chi phí do backend tính theo bảng giá model mà Admin quản lý; agent chỉ gửi token + thời gian (STT: số giây audio, kẹp ≤ 30), **không** gửi nội dung chat. Chưa đặt token thì không gửi gì. Gửi nền, lỗi mạng chỉ ghi cảnh báo, không ảnh hưởng câu trả lời. Planner dùng `purpose="planner"`, STT dùng `purpose="stt"`.

```python
async with track_llm_call(
    sink,
    provider="openai",
    model=settings.openai_model,
    purpose="planner",
    home_id=home_id,
    user_id=user_id,
    request_id=request_id,
    round_index=i,
) as call:
    response = await client.responses.create(...)
    call.set_usage(openai_usage(response.usage))  # anthropic_usage(...) cho Claude
```

Lỗi/quá thời gian vẫn được ghi (chỉ tên lớp lỗi) rồi ném tiếp. Test: `tests/test_usage.py`.

## Nguyên tắc an toàn

- Agent không có tài khoản hệ thống: mọi lời gọi backend mang credential của người đang chat; backend kiểm RBAC
  2 tầng (nhà không thuộc quyền → 404, sai role → 403) và **quyết định** từng bước (lệnh người dùng nói/gõ rõ → làm
  ngay hoặc tự hẹn giờ; lệnh chưa rõ → chờ xác nhận). Backend kiểm "rõ" từ câu gốc (động từ + đúng một thiết bị,
  có giờ nếu hẹn giờ, không phủ định), không tin LLM. Guard ở đây chỉ lọc sớm.
- LLM chỉ đọc ngữ cảnh và **đề xuất** (`propose_plan`, `ask_clarification`); không tồn tại tool
  `execute`/`send_command`/`confirm`/mức rủi ro. Tool strict, mọi trường required.
- Không gửi lên LLM: ID thật (nhà, phòng, thiết bị — chỉ `r1`, `d1`… ánh xạ trong bộ nhớ của request), tên nhà,
  tên/email thành viên, `user_id`, secret, token, mật khẩu, WiFi. Tên phòng/thiết bị được làm sạch (bỏ xuống dòng,
  cắt 60 ký tự) và prompt dặn coi là dữ liệu, bỏ qua "lệnh" nằm trong đó.
- Không log cookie, token, audio, transcript, nội dung câu nói/câu trả lời (chỉ tên lớp lỗi). Hội thoại chỉ ở RAM,
  hết hạn sau 10 phút, không ghi đĩa. Audio chỉ đi tới OpenAI để chuyển thành chữ, agent không lưu.
- `OPENAI_API_KEY` và `BACKEND_SERVICE_TOKEN` là `SecretStr`, không log/không trả qua API. `agent/.env` gitignored,
  không copy vào image.
- Chuẩn hoá chữ `guard/text.py` (hợp đồng §2.8) phải giống hệt bản TypeScript ở backend (`modules/agent`); test
  `tests/test_text.py` ghim các ví dụ của hợp đồng.
