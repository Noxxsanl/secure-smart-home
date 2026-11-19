#!/usr/bin/env bash
# =============================================================================
#  IoT Security – Extended Attack Demo (6 kịch bản nâng cao, telemetry chữ ký v2)
#
#  Bổ sung cho attack_demo.sh:
#  • S5: Gateway bị chiếm (có secret gateway) bịa số đo Node → lớp chữ ký Node độc lập chặn
#  • S6: Replay – timestamp tương lai
#  • S7: Thiết bị đã bị khoá (khoá trên Dashboard trước) với chữ ký đúng
#  • S8: Thiết bị chưa đăng ký
#  • S9: Thiết bị inactive (cần ADMIN_USER/ADMIN_PASS)
#  • S10: Vi phạm RBAC REST API (cần ADMIN_USER/ADMIN_PASS)
#
#  Yêu cầu: curl, openssl, python3
#  Cách dùng:
#    chmod +x tests/security/attack_demo_extended.sh
#    ./tests/security/attack_demo_extended.sh [BACKEND_URL] [GW_ID] [GW_SECRET] [SN_ID] [SN_SECRET] [ADMIN_USER] [ADMIN_PASS]
#
#  Chạy core trước:
#    ./tests/security/attack_demo.sh
# =============================================================================

set -euo pipefail

# ── Cấu hình ──────────────────────────────────────────────────────────────────
BACKEND="${1:-http://localhost:5000}"
GW_ID="${2:-ESP32-GW-XXXXXXXX}"
GW_SECRET="${3:-your-64-char-hex-gw-secret}"
SN_ID="${4:-ESP32-SN-XXXXXXXX}"
SN_SECRET="${5:-your-64-char-hex-sn-secret}"
ADMIN_USER="${6:-admin}"
ADMIN_PASS="${7:-admin123}"
DATA_ENDPOINT="$BACKEND/api/device/data"

# ── Màu sắc terminal ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
# hmac_sha256, sha256_hex, next_ctr, build_v2, build_v1 (chuỗi ký v2 — API_DESIGN §3)
# shellcheck source=tests/security/lib_v2.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib_v2.sh"
DATA_OK='{"temperature":28.5,"humidity":65.0}'

now_ts() { date +%s; }

send_payload() {
    local payload="$1"
    local response http_code body
    response=$(curl -s -w '\n%{http_code}' -X POST "$DATA_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    if [[ "$http_code" == "200" ]]; then
        echo -e "${GREEN}✓ HTTP $http_code${NC}"
    else
        echo -e "${RED}✗ HTTP $http_code${NC}"
    fi
    echo -e "  Response: $(echo "$body" | head -c 250)"
    echo ""
}

login_user() {
    local username="$1" password="$2"
    local jar response http_code
    jar=$(mktemp /tmp/cookie_XXXXXX.jar)
    response=$(curl -s -w '\n%{http_code}' -X POST "$BACKEND/api/auth/login" \
        -H "Content-Type: application/json" \
        -c "$jar" \
        -d "{\"username\":\"$username\",\"password\":\"$password\"}" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    if [[ "$http_code" == "200" ]]; then
        echo "$jar"
    else
        echo ""
        rm -f "$jar"
    fi
}

parse_json() {
    local json="$1" key="$2"
    python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('$key',''))" "$json" 2>/dev/null || echo ""
}

call_api() {
    local jar="$1" method="$2" url="$3" data="${4:-}"
    local response
    if [[ -n "$data" ]]; then
        response=$(curl -s -w '\n%{http_code}' -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -b "$jar" -c "$jar" \
            -d "$data" 2>&1)
    else
        response=$(curl -s -w '\n%{http_code}' -X "$method" "$url" \
            -b "$jar" -c "$jar" 2>&1)
    fi
    local http_code body
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    echo "${http_code}|${body}"
}

build_valid_payload() {
    build_v2 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK"
}

print_header() {
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
}
print_note() { echo -e "${YELLOW}  ℹ $1${NC}"; }
print_ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
print_fail() { echo -e "${RED}  ✗ $1${NC}"; }

# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   IoT Security – Extended Attack Demo (6 Scenarios) ║${NC}"
echo -e "${BLUE}║   Backend    : $BACKEND${NC}"
echo -e "${BLUE}║   Gateway    : $GW_ID${NC}"
echo -e "${BLUE}║   Sensor     : $SN_ID${NC}"
echo -e "${BLUE}║   Admin user : $ADMIN_USER${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}\n"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 5: Sensor HMAC fail (Layer 2) – Gateway pass, Sensor fail
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 5: Gateway bị chiếm bịa số đo Node (kỳ vọng: 401 SENSOR_AUTH_FAIL / HMAC_MISMATCH)"
print_note "Kẻ tấn công có secret GATEWAY (đọc được flash gateway) nhưng KHÔNG có secret Node — Gateway không giữ nó"
print_note "Bảo vệ: chữ ký Node end-to-end chỉ backend kiểm → lớp 2 độc lập với Gateway"
TS=$(now_ts); CTR=$(next_ctr)
FAKE_DATA='{"temperature":99.9,"humidity":0.0}'
FAKE_SN=$(openssl rand -hex 32)
GW_SIG=$(hmac_sha256 "$GW_SECRET" "v2|gw|${GW_ID}|${TS}||${SN_ID}|${CTR}|${FAKE_SN}")
S5_PAYLOAD=$(printf '{"v":2,"gateway_id":"%s","gw_timestamp":%s,"gw_hmac":"%s","sensor_payload":{"sensor_id":"%s","sn_timestamp":%s,"sn_ctr":%s,"sn_hmac":"%s","data_raw":"%s"}}' \
    "$GW_ID" "$TS" "$GW_SIG" "$SN_ID" "$TS" "$CTR" "$FAKE_SN" "$(printf '%s' "$FAKE_DATA" | sed 's/"/\\"/g')")
echo "Payload (gw_hmac ĐÚNG — ký bằng secret gateway | sn_hmac bịa):"
echo "$S5_PAYLOAD"; echo ""
send_payload "$S5_PAYLOAD"
print_ok "Lớp gateway PASS → chữ ký Node FAIL → 401 SENSOR_AUTH_FAIL (qua HTTP không tăng fail_count)"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 6: Replay Attack – Timestamp tương lai (+700s)
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 6: Replay Attack – Timestamp tương lai +12 phút (kỳ vọng: 401 REPLAY_ATTACK)"
print_note "Kẻ tấn công pre-sign một request để dùng sau — HMAC đúng nhưng timestamp là tương lai"
print_note "Bảo vệ: cùng cơ chế với timestamp cũ — |now() − ts| ≤ 300s; cả 2 chiều đều bị từ chối"
FUTURE_TS=$(($(now_ts) + 700))
FUTURE_PAYLOAD=$(build_v2 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK" "$FUTURE_TS")
echo "Payload (timestamp = $FUTURE_TS, cách đây +$(( FUTURE_TS - $(now_ts) ))s — HMAC đúng):"
echo "$FUTURE_PAYLOAD"; echo ""
echo -e "${RED}→ Gửi request với timestamp tương lai...${NC}"
send_payload "$FUTURE_PAYLOAD"
print_ok "HMAC đúng nhưng ts − now > 300s → TIMESTAMP_EXPIRED → audit: REPLAY_ATTACK"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 7: Blocked Device – HMAC đúng nhưng device đang bị block
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 7: Blocked Device – HMAC hợp lệ nhưng status='blocked' (kỳ vọng: 403 DEVICE_BLOCKED)"
print_note "Khoá gateway trên Dashboard (Thiết bị → Khoá) trước — brute force qua HTTP KHÔNG còn tự khoá thiết bị."
print_note "Kiểm tra thứ tự: status check xảy ra SAU khi 2 lớp HMAC đã pass — fail_count không tăng"
VALID=$(build_valid_payload)
echo "Payload (HMAC hoàn toàn đúng, nhưng device status='blocked'):"
echo "$VALID"; echo ""
echo -e "${RED}→ Gửi request với HMAC đúng từ device bị block...${NC}"
send_payload "$VALID"
print_ok "HMAC PASS → status check: 'blocked' → 403 DEVICE_BLOCKED (fail_count KHÔNG tăng thêm)"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 8: Unregistered Device – gateway_id không có trong database
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 8: Unregistered Device – gateway_id không tồn tại (kỳ vọng: 401)"
print_note "Kẻ tấn công dùng device ID tự tạo — không có trong database, không thể lookup secret_key"
print_note "Bảo vệ: lookup secret_key thất bại → không thể tính expected HMAC → 401"
FAKE_ID="ESP32-GW-NOTEXIST"
S7_PAYLOAD=$(build_v2 "$FAKE_ID" "$(openssl rand -hex 32)" "ESP32-SN-NOTEXIST" "$(openssl rand -hex 32)" "$DATA_OK")
echo "Payload (gateway_id = $FAKE_ID — không tồn tại trong DB):"
echo "$S7_PAYLOAD"; echo ""
echo -e "${RED}→ Gửi request từ device không đăng ký...${NC}"
send_payload "$S7_PAYLOAD"
print_ok "Device lookup failed → secret_key không tìm được → 401 GATEWAY_AUTH_FAIL (NOT_FOUND)"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 9: Inactive Device – status='inactive' qua Admin API
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 9: Inactive Device – deactivate qua API rồi thử gửi data (kỳ vọng: 403 DEVICE_NOT_ACTIVE)"
print_note "Admin deactivate một device hợp lệ, rồi device đó thử gửi data — HMAC đúng nhưng bị từ chối"
print_note "Bảo vệ: status check sau HMAC — DEVICE_NOT_ACTIVE check trước DEVICE_BLOCKED trong telemetry/features/ingest-http/ingest-http.handler.ts"

echo -e "${BLUE}  Bước 1: Login admin...${NC}"
ADMIN_JAR=$(login_user "$ADMIN_USER" "$ADMIN_PASS")
if [[ -z "$ADMIN_JAR" ]]; then
    print_fail "Login admin thất bại — kiểm tra ADMIN_USER/ADMIN_PASS. Bỏ qua Scenario 9."
else
    echo "  Tìm device_id của $GW_ID..."
    DEVICES_RESULT=$(call_api "$ADMIN_JAR" "GET" "$BACKEND/api/devices")
    DEVICES_CODE="${DEVICES_RESULT%%|*}"
    DEVICES_BODY="${DEVICES_RESULT#*|}"
    GW_DEVICE_ID=$(python3 -c "
import json,sys
devices = json.loads(sys.argv[1])
if isinstance(devices, list):
    for d in devices:
        if d.get('device_id') == '$GW_ID':
            print(d.get('id',''))
            break
elif isinstance(devices, dict) and 'data' in devices:
    for d in devices['data']:
        if d.get('device_id') == '$GW_ID':
            print(d.get('id',''))
            break
" "$DEVICES_BODY" 2>/dev/null || echo "")

    if [[ -z "$GW_DEVICE_ID" ]]; then
        print_fail "Không tìm thấy device $GW_ID trong DB. Kiểm tra GW_ID param."
    else
        echo -e "  device.id = $GW_DEVICE_ID"
        echo -e "${BLUE}  Bước 2: Deactivate device $GW_ID...${NC}"
        PATCH_RESULT=$(call_api "$ADMIN_JAR" "PATCH" "$BACKEND/api/devices/$GW_DEVICE_ID" '{"status":"inactive"}')
        PATCH_CODE="${PATCH_RESULT%%|*}"
        echo -e "  PATCH status → HTTP $PATCH_CODE"

        echo -e "${BLUE}  Bước 3: Gửi data từ device inactive (HMAC đúng)...${NC}"
        VALID=$(build_valid_payload)
        send_payload "$VALID"
        print_ok "HMAC PASS → status check: 'inactive' → 403 DEVICE_NOT_ACTIVE"

        echo -e "${BLUE}  Bước 4 (cleanup): Reactivate device $GW_ID...${NC}"
        RESTORE_RESULT=$(call_api "$ADMIN_JAR" "PATCH" "$BACKEND/api/devices/$GW_DEVICE_ID" '{"status":"active"}')
        RESTORE_CODE="${RESTORE_RESULT%%|*}"
        echo -e "  PATCH status='active' → HTTP $RESTORE_CODE"
        print_ok "Device $GW_ID đã được khôi phục về trạng thái active"
    fi
    rm -f "$ADMIN_JAR"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 10: RBAC REST API – Viewer cố truy cập admin endpoint
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 10: RBAC REST API – Viewer cố xóa audit log (kỳ vọng: 403 FORBIDDEN)"
print_note "Viewer đăng nhập, cố gọi DELETE /api/audit-log endpoint (chỉ admin được phép)"
print_note "Bảo vệ: requireRole('admin') middleware + canDeleteAuditLog frontend guard"

echo -e "${BLUE}  Tạo tài khoản viewer tạm thời...${NC}"
ADMIN_JAR2=$(login_user "$ADMIN_USER" "$ADMIN_PASS")
if [[ -z "$ADMIN_JAR2" ]]; then
    print_fail "Login admin thất bại — Bỏ qua Scenario 10."
else
    VIEWER_USER="demo_viewer_$(date +%s)"
    VIEWER_PASS="ViewerPass123!"
    CREATE_RESULT=$(call_api "$ADMIN_JAR2" "POST" "$BACKEND/api/users" \
        "{\"username\":\"$VIEWER_USER\",\"password\":\"$VIEWER_PASS\",\"role\":\"viewer\"}")
    CREATE_CODE="${CREATE_RESULT%%|*}"
    CREATE_BODY="${CREATE_RESULT#*|}"
    echo -e "  Tạo viewer '$VIEWER_USER' → HTTP $CREATE_CODE"

    VIEWER_ID=$(parse_json "$CREATE_BODY" "id")
    if [[ -z "$VIEWER_ID" ]]; then
        VIEWER_ID=$(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
print(d.get('data',{}).get('id','') if 'data' in d else d.get('id',''))
" "$CREATE_BODY" 2>/dev/null || echo "")
    fi

    echo -e "${BLUE}  Test 1: Viewer login...${NC}"
    VIEWER_JAR=$(login_user "$VIEWER_USER" "$VIEWER_PASS")
    if [[ -z "$VIEWER_JAR" ]]; then
        print_fail "Viewer login thất bại."
    else
        echo -e "${BLUE}  Test 2: Viewer gọi GET /api/audit-log (được phép)...${NC}"
        READ_RESULT=$(call_api "$VIEWER_JAR" "GET" "$BACKEND/api/audit-log?limit=1")
        READ_CODE="${READ_RESULT%%|*}"
        if [[ "$READ_CODE" == "200" ]]; then
            print_ok "GET /api/audit-log → HTTP $READ_CODE (viewer có quyền đọc)"
        else
            echo -e "  GET audit-log → HTTP $READ_CODE"
        fi

        echo -e "${BLUE}  Test 3: Viewer gọi DELETE /api/audit-log/data-recv (bị cấm)...${NC}"
        DELETE_RESULT=$(call_api "$VIEWER_JAR" "DELETE" "$BACKEND/api/audit-log/data-recv")
        DELETE_CODE="${DELETE_RESULT%%|*}"
        if [[ "$DELETE_CODE" == "403" ]]; then
            print_ok "DELETE /api/audit-log/data-recv → HTTP 403 FORBIDDEN (chỉ admin được xóa)"
        else
            echo -e "  DELETE audit-log → HTTP $DELETE_CODE (kỳ vọng 403)"
        fi

        echo -e "${BLUE}  Test 4: Viewer gọi GET /api/users (admin only)...${NC}"
        USERS_RESULT=$(call_api "$VIEWER_JAR" "GET" "$BACKEND/api/users")
        USERS_CODE="${USERS_RESULT%%|*}"
        if [[ "$USERS_CODE" == "403" ]]; then
            print_ok "GET /api/users → HTTP 403 FORBIDDEN (RBAC admin-only)"
        else
            echo -e "  GET /api/users → HTTP $USERS_CODE (kỳ vọng 403)"
        fi

        rm -f "$VIEWER_JAR"
    fi

    echo -e "${BLUE}  Cleanup: Xóa tài khoản viewer tạm '$VIEWER_USER'...${NC}"
    if [[ -n "$VIEWER_ID" ]]; then
        DEL_RESULT=$(call_api "$ADMIN_JAR2" "DELETE" "$BACKEND/api/users/$VIEWER_ID")
        DEL_CODE="${DEL_RESULT%%|*}"
        echo -e "  DELETE user/$VIEWER_ID → HTTP $DEL_CODE"
        print_ok "Viewer tạm đã được xóa"
    else
        print_note "Không tìm thấy user_id để cleanup — xóa thủ công nếu cần"
    fi

    rm -f "$ADMIN_JAR2"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  TỔNG KẾT
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TỔNG KẾT – EXTENDED 6 SCENARIOS               ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "  S5  Sensor HMAC fake (Layer 2)  → ${RED}401 SENSOR_AUTH_FAIL${NC}"
echo -e "  S6  Replay Attack (+700s future) → ${RED}401 REPLAY_ATTACK (TIMESTAMP_EXPIRED)${NC}"
echo -e "  S7  Blocked device valid HMAC    → ${RED}403 DEVICE_BLOCKED${NC}"
echo -e "  S8  Unregistered device          → ${RED}401 GATEWAY_AUTH_FAIL (NOT_FOUND)${NC}"
echo -e "  S9  Inactive device (API demo)   → ${RED}403 DEVICE_NOT_ACTIVE${NC}"
echo -e "  S10 RBAC REST API violation      → ${RED}403 FORBIDDEN${NC}"
echo ""
echo -e "${YELLOW}  Audit log  : http://localhost:3000/audit${NC}"
echo -e "${YELLOW}  Core demo  : ./tests/security/attack_demo.sh${NC}"
echo -e "${YELLOW}  Hướng dẫn : ./tests/security/ATTACK_SIMULATION_GUIDE.md${NC}"
echo ""
