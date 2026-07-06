#!/usr/bin/env bash
# =============================================================================
#  IoT Security – Core Attack Demo (5 kịch bản quan trọng nhất)
#
#  Bao phủ 4 loại tấn công chính: Spoofing, Replay, DoS/Brute-Force,
#  Privilege Escalation — mỗi loại một cơ chế phòng thủ khác nhau.
#
#  Yêu cầu: curl, openssl
#  Cách dùng:
#    chmod +x scripts/attack_demo.sh
#    ./scripts/attack_demo.sh [BACKEND_URL] [GW_ID] [GW_SECRET] [SN_ID] [SN_SECRET]
#
#  Tham số mặc định:
#    BACKEND_URL = http://localhost:5000
#
#  Xem thêm kịch bản nâng cao:
#    ./scripts/attack_demo_extended.sh
# =============================================================================

set -euo pipefail

# ── Cấu hình ──────────────────────────────────────────────────────────────────
BACKEND="${1:-http://localhost:5000}"
GW_ID="${2:-ESP32-GW-XXXXXXXX}"
GW_SECRET="${3:-your-64-char-hex-gw-secret}"
SN_ID="${4:-ESP32-SN-XXXXXXXX}"
SN_SECRET="${5:-your-64-char-hex-sn-secret}"
DATA_ENDPOINT="$BACKEND/api/device/data"

# ── Màu sắc terminal ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
hmac_sha256() {
    local key="$1" msg="$2"
    # Backend dùng secret_key hex string trực tiếp làm key — KHÔNG decode sang binary
    echo -n "$msg" | openssl dgst -sha256 -hmac "$key" -hex 2>/dev/null \
        | sed 's/^.* //'
}

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

build_valid_payload() {
    local gw_ts sn_ts gw_hmac sn_hmac
    gw_ts=$(now_ts); sn_ts=$(now_ts)
    gw_hmac=$(hmac_sha256 "$GW_SECRET" "${GW_ID}:${gw_ts}")
    sn_hmac=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${sn_ts}")
    cat <<PAYLOAD
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $gw_ts,
  "gw_hmac":      "$gw_hmac",
  "sensor_payload": {
    "sensor_id":    "$SN_ID",
    "sn_timestamp": $sn_ts,
    "sn_hmac":      "$sn_hmac",
    "data":         { "temperature": 28.5, "humidity": 65.0 }
  }
}
PAYLOAD
}

print_header() {
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
}
print_note() { echo -e "${YELLOW}  ℹ $1${NC}"; }
print_ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }

# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   IoT Security – Core Attack Demo (5 Scenarios)     ║${NC}"
echo -e "${BLUE}║   Backend : $BACKEND${NC}"
echo -e "${BLUE}║   Gateway : $GW_ID${NC}"
echo -e "${BLUE}║   Sensor  : $SN_ID${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}\n"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 0: Baseline – Request hợp lệ
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 0: Baseline – Request hợp lệ (kỳ vọng: 200 OK)"
print_note "Xác nhận hệ thống hoạt động bình thường — điểm đối chiếu cho các tấn công"
VALID=$(build_valid_payload)
echo "Payload:"; echo "$VALID"; echo ""
echo -e "${GREEN}→ Gửi request hợp lệ...${NC}"
send_payload "$VALID"
print_ok "DATA_RECV ghi vào audit_log"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 1: Device Spoofing – HMAC giả mạo
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 1: Device Spoofing – HMAC giả mạo (kỳ vọng: 401 GATEWAY_AUTH_FAIL)"
print_note "Kẻ tấn công biết gateway_id nhưng không có secret_key → tự bịa HMAC 64 hex"
print_note "Bảo vệ: HMAC-SHA256 + timingSafeEqual() — không thể giả mạo nếu không có key"
GW_TS=$(now_ts); SN_TS=$(now_ts)
SPOOF_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $GW_TS,
  "gw_hmac":      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  "sensor_payload": {
    "sensor_id":    "$SN_ID",
    "sn_timestamp": $SN_TS,
    "sn_hmac":      "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe00",
    "data":         { "temperature": 99.9, "humidity": 0.0 }
  }
}
EOF
)
echo "Payload (gw_hmac = deadbeef... — bịa đặt):"; echo "$SPOOF_PAYLOAD"; echo ""
echo -e "${RED}→ Gửi request với HMAC giả mạo...${NC}"
send_payload "$SPOOF_PAYLOAD"
print_ok "timingSafeEqual(expected, 'deadbeef...') = false → 401 GATEWAY_AUTH_FAIL + HMAC_MISMATCH"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 2: Replay Attack – Timestamp cũ (−700s)
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 2: Replay Attack – Timestamp cũ 12 phút (kỳ vọng: 401 REPLAY_ATTACK)"
print_note "Kẻ tấn công chặn request hợp lệ và gửi lại sau 12 phút — HMAC đúng kỹ thuật"
print_note "Bảo vệ: |now() − timestamp| ≤ 300s — mỗi request chỉ hợp lệ trong ±5 phút"
OLD_TS=$(($(now_ts) - 700))
GW_HMAC_OLD=$(hmac_sha256 "$GW_SECRET" "${GW_ID}:${OLD_TS}")
SN_HMAC_OLD=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${OLD_TS}")
REPLAY_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $OLD_TS,
  "gw_hmac":      "$GW_HMAC_OLD",
  "sensor_payload": {
    "sensor_id":    "$SN_ID",
    "sn_timestamp": $OLD_TS,
    "sn_hmac":      "$SN_HMAC_OLD",
    "data":         { "temperature": 25.0, "humidity": 60.0 }
  }
}
EOF
)
echo "Payload (timestamp = $OLD_TS, cách đây $(( $(now_ts) - OLD_TS ))s — HMAC đúng):"
echo "$REPLAY_PAYLOAD"; echo ""
echo -e "${RED}→ Gửi request với timestamp cũ...${NC}"
send_payload "$REPLAY_PAYLOAD"
print_ok "HMAC đúng nhưng |now − $OLD_TS| > 300s → TIMESTAMP_EXPIRED → audit: REPLAY_ATTACK"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 3: Brute Force – 6 request HMAC sai → auto-block sau lần thứ 5
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 3: Brute Force → Auto Block (kỳ vọng: 401×5 rồi 403 DEVICE_BLOCKED)"
print_note "Kẻ tấn công gửi HMAC ngẫu nhiên liên tiếp — bị block sau 5 lần"
print_note "Bảo vệ: fail_count tăng mỗi lần fail, đạt BLOCK_THRESHOLD=5 → status='blocked'"
for i in $(seq 1 6); do
    GW_TS=$(now_ts); SN_TS=$(now_ts)
    BRUTE_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$GW_ID",
  "gw_timestamp": $GW_TS,
  "gw_hmac":      "$(openssl rand -hex 32)",
  "sensor_payload": {
    "sensor_id":    "$SN_ID",
    "sn_timestamp": $SN_TS,
    "sn_hmac":      "$(openssl rand -hex 32)",
    "data":         { "temperature": 20.0, "humidity": 50.0 }
  }
}
EOF
    )
    echo -ne "${RED}  Lần $i: ${NC}"
    response=$(curl -s -w '\n%{http_code}' -X POST "$DATA_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$BRUTE_PAYLOAD" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1 | head -c 150)
    echo -e "HTTP $http_code | $body"
    sleep 0.5
done
echo ""
print_ok "Lần 5: fail_count ≥ 5 → blockDevice() → DEVICE_BLOCKED ghi audit"
print_note "Gateway $GW_ID hiện status='blocked' — chạy attack_demo_extended.sh để demo tiếp"

# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 4: Privilege Escalation – Sensor đóng vai Gateway
# ══════════════════════════════════════════════════════════════════════════════
print_header "SCENARIO 4: Privilege Escalation – Sensor giả làm Gateway (kỳ vọng: 403 PRIVILEGE_ESCALATION)"
print_note "Sensor có secret_key hợp lệ → HMAC đúng kỹ thuật, nhưng device_type='sensor' ≠ 'gateway'"
print_note "Bảo vệ: RBAC device_type check trong data.routes.ts sau khi cả 2 HMAC đã pass"
PRIV_TS=$(now_ts)
SN_HMAC_AS_GW=$(hmac_sha256 "$SN_SECRET" "${SN_ID}:${PRIV_TS}")
PRIV_PAYLOAD=$(cat <<EOF
{
  "gateway_id":   "$SN_ID",
  "gw_timestamp": $PRIV_TS,
  "gw_hmac":      "$SN_HMAC_AS_GW",
  "sensor_payload": {
    "sensor_id":    "$SN_ID",
    "sn_timestamp": $PRIV_TS,
    "sn_hmac":      "$SN_HMAC_AS_GW",
    "data":         { "temperature": 25.0, "humidity": 60.0 }
  }
}
EOF
)
echo "Payload (gateway_id = SN_ID = $SN_ID | gw_hmac tính từ SN_SECRET — đúng kỹ thuật):"
echo "$PRIV_PAYLOAD"; echo ""
echo -e "${RED}→ Gửi request privilege escalation...${NC}"
send_payload "$PRIV_PAYLOAD"
print_ok "HMAC Layer1+Layer2: PASS | RBAC: device_type='sensor' ≠ 'gateway' → 403 PRIVILEGE_ESCALATION"

# ══════════════════════════════════════════════════════════════════════════════
#  TỔNG KẾT
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TỔNG KẾT – CORE 5 SCENARIOS                   ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "  S0  Baseline (hợp lệ)           → ${GREEN}200 DATA_RECV${NC}"
echo -e "  S1  Device Spoofing (HMAC fake) → ${RED}401 GATEWAY_AUTH_FAIL (HMAC_MISMATCH)${NC}"
echo -e "  S2  Replay Attack (−700s)        → ${RED}401 REPLAY_ATTACK (TIMESTAMP_EXPIRED)${NC}"
echo -e "  S3  Brute Force → Auto Block     → ${RED}401×5 GATEWAY_AUTH_FAIL + DEVICE_BLOCKED${NC}"
echo -e "  S4  Privilege Escalation (type)  → ${RED}403 PRIVILEGE_ESCALATION${NC}"
echo ""
echo -e "${YELLOW}  Cơ chế bảo vệ: HMAC-SHA256 · timingSafeEqual · Timestamp ±300s · fail_count · device_type RBAC${NC}"
echo -e "${YELLOW}  Audit log    : http://localhost:3000/audit${NC}"
echo -e "${YELLOW}  Reset gateway: Dashboard → Devices → Unlock (sau Scenario 3)${NC}"
echo -e "${YELLOW}  Nâng cao     : ./scripts/attack_demo_extended.sh${NC}"
echo ""
