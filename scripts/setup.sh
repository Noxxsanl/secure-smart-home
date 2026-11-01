#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC}    $1"; }
info() { echo -e "${CYAN}[INFO]${NC}  $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Resolve script directory → workspace root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo ""
echo " ==================================="
echo "  IoT Device Manager - Setup"
echo " ==================================="
echo ""

# Check Docker
command -v docker &>/dev/null || err "Docker không tìm thấy. Cài đặt tại: https://docs.docker.com/get-docker/"
docker info &>/dev/null        || err "Docker daemon chưa chạy. Khởi động Docker rồi thử lại."
ok "Docker sẵn sàng."

# Check docker-compose (v1 hoặc v2 plugin)
if command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    err "docker-compose không tìm thấy. Cài đặt tại: https://docs.docker.com/compose/install/"
fi
ok "Docker Compose sẵn sàng ($COMPOSE_CMD)."

# .env gốc cho docker compose — mật khẩu PostgreSQL ngẫu nhiên, không commit
if ! grep -q '^POSTGRES_APP_PASSWORD=.' .env 2>/dev/null; then
    gen_pw() { openssl rand -hex 16 2>/dev/null || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; }
    # Nối thêm (>>) thay vì ghi đè: .env cũ (bản MySQL) có thể còn biến khác; dòng trống đầu tiên
    # đóng dòng cuối nếu file cũ không kết thúc bằng xuống dòng.
    {
        echo ""
        echo "POSTGRES_PASSWORD=$(gen_pw)"
        echo "POSTGRES_DB=secure_smart_home_iot"
        echo "POSTGRES_APP_USER=secure_smart_home_app"
        echo "POSTGRES_APP_PASSWORD=$(gen_pw)"
    } >> .env
    ok "Đã tạo biến PostgreSQL trong .env (mật khẩu ngẫu nhiên)."
    if docker volume ls -q | grep -q '_pg_data$'; then
        warn "Volume pg_data đã tồn tại với mật khẩu cũ (POSTGRES_* chỉ áp dụng lần khởi tạo đầu) — đổi bằng 'docker exec -it iot-postgres psql -U postgres -c \"ALTER ROLE <POSTGRES_APP_USER> PASSWORD '...'\"' hoặc 'docker compose down -v' (mất dữ liệu)."
    fi
    if docker volume ls -q | grep -q '_mysql_data$'; then
        info "Volume mysql_data (MySQL cũ) không còn được dùng — xoá khi không cần dữ liệu cũ: docker volume rm <tên volume>."
    fi
else
    ok ".env (PostgreSQL) đã tồn tại."
fi

# Setup backend .env
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        cp "backend/.env.example" "backend/.env"
        ok "Đã tạo backend/.env từ .env.example"
    else
        warn "Không tìm thấy backend/.env.example — bỏ qua."
    fi
else
    ok "backend/.env đã tồn tại."
fi

# Setup agent .env (OPENAI_API_KEY để trống — agent vẫn chạy, chỉ báo llm_configured=false)
if [ ! -f "agent/.env" ]; then
    cp "agent/.env.example" "agent/.env"
    ok "Đã tạo agent/.env từ .env.example — điền OPENAI_API_KEY để dùng trợ lý AI."
else
    ok "agent/.env đã tồn tại."
fi

# Chứng chỉ TLS cho MQTT Broker 2 — tham số của setup.sh (IP LAN) được chuyển tiếp
if [ ! -f "infra/mosquitto/certs/server.crt" ]; then
    info "Chưa có chứng chỉ MQTT TLS — đang sinh..."
    bash infra/pki/gen_mqtt_certs.sh "$@"
else
    ok "Chứng chỉ MQTT TLS đã có (sinh lại: bash infra/pki/gen_mqtt_certs.sh <IP LAN>)."
fi

# Build and start
echo ""
info "Đang build và khởi động services..."
echo ""

$COMPOSE_CMD up --build -d

echo ""
echo " ==================================="
echo "  Khởi động thành công!"
echo " ==================================="
echo ""
echo "  Admin    : http://localhost:3001"
echo "  Operator : http://localhost:3002"
echo "  Khách hàng: http://localhost:3003"
echo "  Backend  : http://localhost:5000/api/health"
echo ""
echo "  Đăng nhập Admin: tài khoản seed 'admin' — mật khẩu xem docs/guides/CHAY_LOCAL.md, đổi khi dùng thật"
echo ""
echo "  Xem log  : $COMPOSE_CMD logs -f"
echo "  Dừng     : $COMPOSE_CMD down"
echo ""
