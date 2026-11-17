#!/usr/bin/env bash
# =============================================================================
#  IoT Security – Core Attack Demo (telemetry chữ ký v2 — API_DESIGN §3)
#
#  Bao phủ: Spoofing, sửa nội dung (tamper), Replay (trong cửa sổ và quá hạn), Privilege Escalation,
#  hạ cấp về chữ ký v1, Brute-Force — mỗi loại một cơ chế phòng thủ khác nhau.
#
#  Yêu cầu: curl, openssl (Git Bash có sẵn)
#  Cách dùng:
#    ./tests/security/attack_demo.sh [BACKEND_URL] [GW_ID] [GW_SECRET] [SN_ID] [SN_SECRET] [CAM_ID]
#
#  - CAM_ID (tuỳ chọn, hoặc biến môi trường CAM_ID): camera thật thuộc GW_ID. Có thì S8 gửi thêm 1 ảnh hợp lệ (ảnh giả
#    nhỏ, trigger motion — sẽ lưu thành 1 snapshot) để chứng minh gateway không bị khoá sau chuỗi request rác.
#
#  - BACKEND_URL mặc định http://localhost:5000 (dev, gọi thẳng backend). Qua nginx: https://localhost
#    (script dùng --cacert infra/mosquitto/certs/ca.crt nếu có).
#  - SN_ID phải là node đã gán vào GW_ID (devices.gateway_device_id) — như sau npm run hw:register.
#  - CHẠY VỚI SECRET THẬT: các gói hợp lệ ở đây đẩy last_ctr của node lên ≈ giờ hiện tại (ms) — node thật gửi tiếp
#    bình thường vì ctr của nó cũng bám theo giờ.
#
#  Xem thêm: ./tests/security/attack_demo_extended.sh · ./tests/security/check_mqtt_acl.sh (mTLS + ACL broker)
# =============================================================================

set -euo pipefail

# ── Cấu hình ──────────────────────────────────────────────────────────────────
BACKEND="${1:-http://localhost:5000}"
GW_ID="${2:-ESP32-GW-XXXXXXXX}"
GW_SECRET="${3:-your-64-char-hex-gw-secret}"
SN_ID="${4:-ESP32-SN-XXXXXXXX}"
SN_SECRET="${5:-your-64-char-hex-sn-secret}"
CAM_ID="${6:-${CAM_ID:-}}"
DATA_ENDPOINT="$BACKEND/api/device/data"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CURL_TLS=()
[[ "$BACKEND" == https://* && -f "$ROOT/infra/mosquitto/certs/ca.crt" ]] && CURL_TLS=(--cacert "$ROOT/infra/mosquitto/certs/ca.crt")

# ── Màu sắc terminal ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# shellcheck source=tests/security/lib_v2.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib_v2.sh"

send_payload() {
    local payload="$1" response http_code body
    response=$(curl -s "${CURL_TLS[@]}" -w '\n%{http_code}' -X POST "$DATA_ENDPOINT" \
        -H "Content-Type: application/json" -d "$payload" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    if [[ "$http_code" == "200" ]]; then echo -e "${GREEN}✓ HTTP $http_code${NC}"; else echo -e "${RED}✗ HTTP $http_code${NC}"; fi
    echo -e "  Response: $(echo "$body" | head -c 250)"
    echo ""
}

print_header() {
    echo ""
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
}
print_note() { echo -e "${YELLOW}  ℹ $1${NC}"; }
print_ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }

DATA_OK='{"temperature":28.5,"humidity":65.0}'

# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   IoT Security – Core Attack Demo (chữ ký v2)        ║${NC}"
echo -e "${BLUE}║   Backend : $BACKEND${NC}"
echo -e "${BLUE}║   Gateway : $GW_ID${NC}"
echo -e "${BLUE}║   Node    : $SN_ID${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}\n"

# ── S0 ────────────────────────────────────────────────────────────────────────
print_header "S0: Baseline – gói v2 hợp lệ (kỳ vọng: 200)"
print_note "Node ký v2|sn|id|ts|ctr|sha256(data_raw); Gateway ký v2|gw|...|sn_hmac — ký CẢ nội dung + bộ đếm"
VALID=$(build_v2 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK")
echo "$VALID"; echo ""
send_payload "$VALID"
print_ok "DATA_RECV ghi vào audit_log, devices.last_ctr = sn_ctr của gói"

# ── S1 ────────────────────────────────────────────────────────────────────────
print_header "S1: Device Spoofing – gw_hmac bịa (kỳ vọng: 401 GATEWAY_AUTH_FAIL / HMAC_MISMATCH)"
print_note "Không có secret gateway thì không tạo được chữ ký; lỗi trên HTTP KHÔNG làm khoá thiết bị (chống DoS)"
SPOOF=$(build_v2 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK" | sed -E 's/"gw_hmac": *"[0-9a-f]{64}"/"gw_hmac":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"/')
send_payload "$SPOOF"

# ── S2 ────────────────────────────────────────────────────────────────────────
print_header "S2: Tamper – giữ nguyên 2 chữ ký, sửa data (kỳ vọng: 401 SENSOR_AUTH_FAIL / HMAC_MISMATCH)"
print_note "Trước v2 chữ ký chỉ phủ \"<id>:<ts>\" nên đổi nhiệt độ vẫn qua. v2 băm data_raw vào chữ ký Node."
TAMPERED=$(build_v2 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK" | sed 's/28\.5/45.0/')
echo "$TAMPERED" | grep -o '"data_raw":"[^"]*\(\\"[^"]*\)*"' || true; echo ""
send_payload "$TAMPERED"

# ── S3 ────────────────────────────────────────────────────────────────────────
print_header "S3: Replay TRONG cửa sổ 300 s – gửi lại nguyên gói S0 (kỳ vọng: 401 SENSOR_AUTH_FAIL / REPLAYED)"
print_note "Chữ ký và timestamp vẫn hợp lệ; sn_ctr ≤ last_ctr của node → backend từ chối (UPDATE nguyên tử)"
send_payload "$VALID"

# ── S4 ────────────────────────────────────────────────────────────────────────
print_header "S4: Replay QUÁ HẠN – timestamp −700 s, chữ ký đúng (kỳ vọng: 401 / TIMESTAMP_EXPIRED → audit REPLAY_ATTACK)"
OLD=$(build_v2 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK" $(( $(date +%s) - 700 )))
send_payload "$OLD"

# ── S5 ────────────────────────────────────────────────────────────────────────
print_header "S5: Privilege Escalation – Node đóng vai Gateway (kỳ vọng: 403 INVALID_DEVICE_TYPE)"
print_note "Node ký lớp gateway bằng chính secret của nó — chữ ký đúng nhưng device_type='sensor' ≠ 'gateway'"
PRIV=$(build_v2 "$SN_ID" "$SN_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK")
send_payload "$PRIV"

# ── S6 ────────────────────────────────────────────────────────────────────────
print_header "S6: Hạ cấp về chữ ký v1 \"<id>:<ts>\" (kỳ vọng: 401 / PROTOCOL_V1_DISABLED)"
print_note "Chỉ nhận v1 khi backend đặt DEVICE_HMAC_V1=true (chuyển đổi phần cứng cũ)"
send_payload "$(build_v1 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET")"

# ── S7 ────────────────────────────────────────────────────────────────────────
print_header "S7: Brute force qua HTTP – 20 gói chữ ký ngẫu nhiên (kỳ vọng: 401 rồi 429; thiết bị KHÔNG bị khoá)"
print_note "Trước đây 5 gói sai là khoá gateway nhà khác. Nay: lỗi trên HTTP chỉ tính theo IP (20 lần/15 phút → 429)"
for i in $(seq 1 20); do
    BRUTE=$(build_v2 "$GW_ID" "$GW_SECRET" "$SN_ID" "$SN_SECRET" "$DATA_OK" | sed -E "s/\"gw_hmac\": *\"[0-9a-f]{64}\"/\"gw_hmac\":\"$(openssl rand -hex 32)\"/")
    code=$(curl -s "${CURL_TLS[@]}" -o /dev/null -w '%{http_code}' -X POST "$DATA_ENDPOINT" -H "Content-Type: application/json" -d "$BRUTE")
    echo -ne "${RED}$code ${NC}"
done
echo ""
print_ok "IP bị giới hạn (429); devices.status của $GW_ID vẫn 'active' (xem Dashboard → Thiết bị)"
print_note "Khoá thiết bị sau 5 lần (FR-12.2) chỉ áp cho gói qua MQTT — người gửi đã xác thực bằng mTLS"

# ── S8 ────────────────────────────────────────────────────────────────────────
print_header "S8: Khoá-DoS đường camera – 25 request rác vào /api/device/camera/snapshot với gateway_id THẬT (kỳ vọng: 401… rồi 429; gateway vẫn active)"
print_note "Trước đây ai biết gateway_id chỉ cần 5 request rác (ts cũ, chữ ký bừa) là khoá cả nhà. Nay lỗi chỉ audit + giới hạn theo IP (20 lỗi/15 phút → 429)"
SNAPSHOT_ENDPOINT="$BACKEND/api/device/camera/snapshot"
JPEG_TMP="$(mktemp)"
printf '\xff\xd8\xff\xe0JUNK' > "$JPEG_TMP"
S8_401=0; S8_429=0; S8_OTHER=0
snapshot_junk() {
    local code
    code=$(curl -s "${CURL_TLS[@]}" -o /dev/null -w '%{http_code}' -X POST "$SNAPSHOT_ENDPOINT" \
        -H "X-Gateway-Id: $GW_ID" -H "X-Device-Id: ${CAM_ID:-ESP32-CAM-NOTEXIST}" \
        -H "X-Timestamp: $(( $(date +%s) - 700 ))" -H "X-Signature: $(openssl rand -hex 32)" \
        -H "X-Trigger: request" -H "Content-Type: image/jpeg" --data-binary @"$JPEG_TMP")
    echo -ne "${RED}$code ${NC}"
    case "$code" in 401) S8_401=$((S8_401 + 1)) ;; 429) S8_429=$((S8_429 + 1)) ;; *) S8_OTHER=$((S8_OTHER + 1)) ;; esac
}
echo -n "  6 request đầu (đã vượt ngưỡng 5 lần của cơ chế khoá cũ): "
for _ in $(seq 1 6); do snapshot_junk; done
echo ""
if [[ -n "$CAM_ID" ]]; then
    # Có camera thật của gateway → gửi MỘT ảnh hợp lệ (ảnh nhỏ giả, trigger motion) ngay sau chuỗi rác: không được 403 DEVICE_BLOCKED
    S8_TS=$(date +%s)
    S8_SIG=$(hmac_sha256 "$GW_SECRET" "${GW_ID}:${S8_TS}:${CAM_ID}:motion::$(openssl dgst -sha256 -hex "$JPEG_TMP" | sed 's/^.* //')")
    S8_VALID=$(curl -s "${CURL_TLS[@]}" -o /dev/null -w '%{http_code}' -X POST "$SNAPSHOT_ENDPOINT" \
        -H "X-Gateway-Id: $GW_ID" -H "X-Device-Id: $CAM_ID" -H "X-Timestamp: $S8_TS" -H "X-Signature: $S8_SIG" \
        -H "X-Trigger: motion" -H "Content-Type: image/jpeg" --data-binary @"$JPEG_TMP")
    if [[ "$S8_VALID" == "403" || "$S8_VALID" == "401" ]]; then
        echo -e "  ${RED}✗ Ảnh hợp lệ sau chuỗi rác bị từ chối: HTTP $S8_VALID — gateway có thể đã bị khoá oan${NC}"
    else
        print_ok "Ảnh hợp lệ sau 6 request rác: HTTP $S8_VALID (không phải 403 DEVICE_BLOCKED)"
    fi
else
    print_note "Không có CAM_ID (đối số 6) → bỏ bước gửi ảnh hợp lệ; kiểm gateway còn 'active' trên Dashboard → Thiết bị"
fi
echo -n "  19 request còn lại: "
for _ in $(seq 1 19); do snapshot_junk; done
echo ""
rm -f "$JPEG_TMP"
echo -e "  Kết quả: ${S8_401}× 401, ${S8_429}× 429, ${S8_OTHER}× khác"
if (( S8_429 >= 1 )); then
    print_ok "IP bị giới hạn (429) sau ~20 lỗi; devices.status của $GW_ID vẫn 'active', audit có GATEWAY_AUTH_FAIL/REPLAY_ATTACK (TIMESTAMP_EXPIRED)"
else
    echo -e "  ${RED}✗ Không thấy 429 — kiểm lại backend đã có giới hạn lỗi theo IP cho /api/device/camera/snapshot${NC}"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TỔNG KẾT                                        ${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "  S0  Gói hợp lệ                     → ${GREEN}200${NC}"
echo -e "  S1  Spoofing (gw_hmac bịa)         → ${RED}401 GATEWAY_AUTH_FAIL HMAC_MISMATCH${NC}"
echo -e "  S2  Sửa data, giữ chữ ký           → ${RED}401 SENSOR_AUTH_FAIL HMAC_MISMATCH${NC}"
echo -e "  S3  Replay trong cửa sổ            → ${RED}401 SENSOR_AUTH_FAIL REPLAYED${NC}"
echo -e "  S4  Replay quá hạn (−700 s)        → ${RED}401 TIMESTAMP_EXPIRED (audit REPLAY_ATTACK)${NC}"
echo -e "  S5  Node đóng vai Gateway          → ${RED}403 INVALID_DEVICE_TYPE${NC}"
echo -e "  S6  Hạ cấp chữ ký v1               → ${RED}401 PROTOCOL_V1_DISABLED${NC}"
echo -e "  S7  Brute force HTTP               → ${RED}401… rồi 429, thiết bị không bị khoá${NC}"
echo -e "  S8  Khoá-DoS camera (25 rác)       → ${RED}401… rồi 429, gateway không bị khoá${NC}"
echo ""
echo -e "${YELLOW}  Audit log: Dashboard → Nhật ký → Bảo mật${NC}"
echo ""
