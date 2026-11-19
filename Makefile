# TẠM — lối tắt cho các lệnh hay dùng. Cần GNU make (Linux/macOS/WSL; Windows: Git Bash có cài make).
# Ví dụ: make dev · make certs IP=192.168.1.100 · make test-security ARGS="http://localhost:5000 <GW_ID> ..."
.PHONY: dev prod certs gateway-cert revoke-gateway test-mqtt-acl migrate test-security agent-venv agent-test

# venv do py launcher (Windows) tạo có .venv/Scripts, Linux/macOS có .venv/bin — chọn lúc chạy.
AGENT_BIN = { [ -d .venv/Scripts ] && B=.venv/Scripts || B=.venv/bin; }

dev: ## Stack dev (compose.yaml + compose.override.yaml); -V làm mới anonymous volume node_modules theo image vừa build
	docker compose up --build --renew-anon-volumes

prod: ## Stack prod
	docker compose -f compose.prod.yaml up -d --build

certs: ## Sinh CA + cert Broker MQTT, nginx HTTPS, client MQTT của backend, CRL (IP LAN máy chạy broker)
	bash infra/pki/gen_mqtt_certs.sh $(IP)

gateway-cert: ## Cấp chứng chỉ client MQTT (mTLS) cho gateway: make gateway-cert GW=<gateway_id>
	bash infra/pki/gen_mqtt_client.sh $(GW)

revoke-gateway: ## Thu hồi chứng chỉ gateway rồi khởi động lại broker: make revoke-gateway GW=<gateway_id>
	bash infra/pki/gen_mqtt_client.sh --revoke $(GW) && docker compose restart mqtt-broker

test-mqtt-acl: ## Kiểm mTLS + ACL của broker đang chạy: make test-mqtt-acl GW=<gateway_id>
	bash tests/security/check_mqtt_acl.sh $(GW)

migrate: ## Chưa có lệnh riêng
	@echo "Backend tự chạy migration khi khởi động (backend/src/infrastructure/database/migrate.ts) — chưa có service migrate riêng."

test-security: ## Kịch bản tấn công demo (backend phải đang chạy)
	bash tests/security/attack_demo.sh $(ARGS)

agent-venv: ## Tạo agent/.venv (Python 3.12) và cài requirements-dev.txt
	cd agent && (py -3.12 -m venv .venv 2>/dev/null || python3.12 -m venv .venv) && $(AGENT_BIN) && $$B/python -m pip install -r requirements-dev.txt

agent-test: ## ruff + pytest của agent (giống job CI "Agent")
	cd agent && $(AGENT_BIN) && $$B/ruff check . && $$B/ruff format --check . && $$B/python -m pytest
