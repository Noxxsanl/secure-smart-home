# agent/ — AI Agent trợ lý điều khiển thiết bị

Dịch vụ Python (FastAPI) nhận câu lệnh tiếng Việt từ web/mobile và gateway, dùng LLM (OpenAI) lập
kế hoạch điều khiển thiết bị, rồi để **backend** kiểm duyệt và thực thi. Thiết kế:
[`docs/proposals/DE_XUAT_AI_AGENT.md`](../docs/proposals/DE_XUAT_AI_AGENT.md) (**draft chờ duyệt**).

> **Trạng thái:** mới có khung — `/health` và `POST /v1/homes/{home_id}/messages` (trả 501).
> Planner, tools, guard, STT, client backend chưa hiện thực. Phần setup (venv, requirements, compose, CI) đã xong.

## Cấu trúc

```
src/smarthome_agent/
├── main.py              app FastAPI (create_app, run)
├── config.py            Settings đọc agent/.env bằng pydantic-settings
├── api/                 health.py, commands.py
├── planner/             llm.py (client OpenAI), schemas.py (ProposedPlan/PlanStep)
├── tools/               tool đọc + propose_plan; KHÔNG có tool thực thi
├── guard/               kiểm tra sơ bộ; backend vẫn kiểm duyệt lại
├── stt/                 adapter STT (none | openai | whisper_local)
└── clients/backend/     sinh từ contracts/openapi.json (chưa có)
prompts/                 system prompt
eval/                    bộ câu lệnh tiếng Việt có nhãn
tests/
```

## Phụ thuộc

- `requirements.txt` — phụ thuộc chạy, ghim bản; Docker và CI cài từ đây.
- `requirements-dev.txt` — thêm pytest, pytest-asyncio, ruff.
- `pyproject.toml` — metadata gói + cấu hình ruff/pytest. Nâng phiên bản thì sửa cả hai nơi.

## Chạy local (Python 3.12)

```bash
cp agent/.env.example agent/.env   # scripts/setup.sh tự làm; rồi điền OPENAI_API_KEY
make agent-venv                    # tạo agent/.venv + cài requirements-dev.txt
make agent-test                    # ruff check + ruff format --check + pytest (giống CI)

cd agent
.venv/Scripts/activate             # Linux/macOS: source .venv/bin/activate
pip install --no-deps -e .         # để có lệnh smarthome-agent
smarthome-agent                    # http://localhost:8000/health, /docs
```

Không có `make`: chạy tay `py -3.12 -m venv .venv`, `.venv/Scripts/pip install -r requirements-dev.txt`,
`.venv/Scripts/ruff check .`, `.venv/Scripts/python -m pytest`.

Test không đọc key thật: `tests/conftest.py` ghi đè `OPENAI_API_KEY` rỗng, không gọi OpenAI.

## Docker

- Dev: service `agent` trong `compose.yaml` — `docker compose up --build agent` (không cần backend để khởi động),
  cổng `127.0.0.1:8000`, bind-mount `src/` + reload. Thiếu `agent/.env` vẫn chạy.
- Prod: service `agent` trong `compose.prod.yaml` — `AGENT_ENV=production`, không publish cổng, chưa qua nginx;
  bắt buộc `agent/.env` có `OPENAI_API_KEY`.

## CI

Job **Agent (ruff, pytest)** trong `.github/workflows/ci.yml`, chạy khi `agent/**` đổi: Python 3.12,
`pip install -r requirements-dev.txt`, `ruff check .`, `ruff format --check .`, `pytest`.

## Nguyên tắc an toàn

- Agent không có tài khoản hệ thống: mọi lời gọi backend dùng Bearer token của người đang chat,
  backend kiểm RBAC 2 tầng (404 / 403).
- LLM chỉ đọc và **đề xuất** (`propose_plan`); không tồn tại tool `execute`/`send_command`/`confirm`.
  Mức rủi ro do policy tất định gán, không do LLM khai.
- `OPENAI_API_KEY` là `SecretStr`, không log/không trả qua API. `agent/.env` gitignored, không copy vào image.
- Không gửi lên LLM: secret thiết bị, token, mật khẩu, WiFi, email/SĐT, ID thật trong DB (đề xuất §8.3).
