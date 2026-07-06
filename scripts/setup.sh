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
echo "  Frontend : http://localhost:3000"
echo "  Backend  : http://localhost:5000/api/health"
echo ""
echo "  Đăng nhập: admin / 123456"
echo ""
echo "  Xem log  : $COMPOSE_CMD logs -f"
echo "  Dừng     : $COMPOSE_CMD down"
echo ""
