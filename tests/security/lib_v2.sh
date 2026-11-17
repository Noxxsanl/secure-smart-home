#!/usr/bin/env bash
# Hàm dựng gói telemetry cho attack_demo*.sh (source, không chạy trực tiếp). Cài đặt ĐỘC LẬP bằng openssl — khớp
# backend/src/modules/devices/domain/signature-v2.ts và firmware/common/security_manager (API_DESIGN §3):
#   Node:    HMAC-SHA256(secret node,    "v2|sn|<sensor_id>|<ts>|<ctr>|<sha256_hex(data_raw)>")
#   Gateway: HMAC-SHA256(secret gateway, "v2|gw|<gateway_id>|<ts>|<gateway_ip>|<sensor_id>|<ctr>|<sn_hmac>")
# Key là chuỗi secret nguyên văn (không decode hex). Không in secret.
# Còn có hàm ký/dựng heartbeat, ack, sự kiện camera v2 (cuối file) + `bash lib_v2.sh --selftest`.

hmac_sha256() { printf '%s' "$2" | openssl dgst -sha256 -hmac "$1" -hex 2>/dev/null | sed 's/^.* //'; }
sha256_hex()  { printf '%s' "$1" | openssl dgst -sha256 -hex 2>/dev/null | sed 's/^.* //'; }

# Bộ đếm tăng ngặt ≈ unix ms (như firmware sm_counter): max(lần trước + 1, giờ hiện tại ms). Lưu trong file vì
# build_v2 thường được gọi trong $(...) (subshell) — biến shell không giữ được giữa các lần gọi.
V2_CTR_FILE="$(mktemp)"
trap 'rm -f "$V2_CTR_FILE"' EXIT
next_ctr() {
    local last now
    last=$(cat "$V2_CTR_FILE" 2>/dev/null || true)
    now=$(date +%s%3N)
    [[ -n "$last" && "$last" -ge "$now" ]] && now=$(( last + 1 ))
    echo "$now" > "$V2_CTR_FILE"
    echo "$now"
}

# build_v2 <gw_id> <gw_secret> <sn_id> <sn_secret> <data_raw> [ts] — envelope v2 (không gửi gateway_ip → ký chuỗi rỗng)
build_v2() {
    local gw_id="$1" gw_secret="$2" sn_id="$3" sn_secret="$4" data_raw="$5" ts="${6:-$(date +%s)}"
    local ctr sn_hmac gw_hmac escaped
    ctr=$(next_ctr)
    sn_hmac=$(hmac_sha256 "$sn_secret" "v2|sn|${sn_id}|${ts}|${ctr}|$(sha256_hex "$data_raw")")
    gw_hmac=$(hmac_sha256 "$gw_secret" "v2|gw|${gw_id}|${ts}||${sn_id}|${ctr}|${sn_hmac}")
    escaped=$(printf '%s' "$data_raw" | sed 's/"/\\"/g')
    printf '{"v":2,"gateway_id":"%s","gw_timestamp":%s,"gw_hmac":"%s","sensor_payload":{"sensor_id":"%s","sn_timestamp":%s,"sn_ctr":%s,"sn_hmac":"%s","data_raw":"%s"}}' \
        "$gw_id" "$ts" "$gw_hmac" "$sn_id" "$ts" "$ctr" "$sn_hmac" "$escaped"
}

# ── Heartbeat / ack / sự kiện camera v2 (Gateway → Server qua MQTT; hợp đồng A+B §2) ───────────────────────────────
# Khoá = secret Gateway. Khớp backend signature-v2.ts (heartbeatMessageV2, ackMessageV2, cameraEventMessageV2):
#   hb : "v2|hb|<gw>|<ts>|<ctr>|<sha256_hex(body_raw)>"
#   ack: "v2|ack|<gw>|<device_uid>|<command_id>|<status>|<power>|<ts>"   power = 1 | 0 | rỗng (không có trường power)
#   evt: "v2|evt|<gw>|<cam_id>|<type>|<ts>|<snapshot_id hoặc rỗng>"
# Các hàm build_* in payload JSON để publish bằng mosquitto_pub (topic: home/<home_id>/gateway/<gw>/heartbeat,
# …/device/<uid>/command/ack, …/device/<cam_id>/camera/event).

# sign_heartbeat_v2 <gw_id> <gw_secret> <ts> <ctr> <body_raw>
sign_heartbeat_v2() { hmac_sha256 "$2" "v2|hb|${1}|${3}|${4}|$(sha256_hex "$5")"; }

# sign_ack_v2 <gw_id> <gw_secret> <device_uid> <command_id> <ok|error> <true|false|""> <ts>
sign_ack_v2() {
    local power=""
    case "$6" in true) power=1 ;; false) power=0 ;; esac
    hmac_sha256 "$2" "v2|ack|${1}|${3}|${4}|${5}|${power}|${7}"
}

# sign_camera_event_v2 <gw_id> <gw_secret> <cam_id> <type> <ts> [snapshot_id]
sign_camera_event_v2() { hmac_sha256 "$2" "v2|evt|${1}|${3}|${4}|${5}|${6:-}"; }

# build_heartbeat_v2 <gw_id> <gw_secret> <body_raw> [ts] [ctr] — body_raw là JSON nguyên văn (chỉ ASCII), được escape vào chuỗi
build_heartbeat_v2() {
    local gw_id="$1" gw_secret="$2" body_raw="$3" ts="${4:-$(date +%s)}" ctr="${5:-$(next_ctr)}" escaped
    escaped=$(printf '%s' "$body_raw" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '{"v":2,"ts":%s,"ctr":%s,"hmac":"%s","body_raw":"%s"}' \
        "$ts" "$ctr" "$(sign_heartbeat_v2 "$gw_id" "$gw_secret" "$ts" "$ctr" "$body_raw")" "$escaped"
}

# build_ack_v2 <gw_id> <gw_secret> <device_uid> <command_id> <ok|error> <true|false|""> [ts]
build_ack_v2() {
    local gw_id="$1" gw_secret="$2" dev="$3" cmd="$4" status="$5" power="$6" ts="${7:-$(date +%s)}" power_json=""
    [[ -n "$power" ]] && power_json=",\"power\":${power}"
    printf '{"v":2,"command_id":"%s","status":"%s"%s,"ts":%s,"hmac":"%s"}' \
        "$cmd" "$status" "$power_json" "$ts" "$(sign_ack_v2 "$gw_id" "$gw_secret" "$dev" "$cmd" "$status" "$power" "$ts")"
}

# build_camera_event_v2 <gw_id> <gw_secret> <cam_id> [snapshot_id] [ts] — type luôn là motion
build_camera_event_v2() {
    local gw_id="$1" gw_secret="$2" cam="$3" snap="${4:-}" ts="${5:-$(date +%s)}" snap_json=""
    [[ -n "$snap" ]] && snap_json=",\"snapshot_id\":\"${snap}\""
    printf '{"v":2,"type":"motion"%s,"ts":%s,"hmac":"%s"}' \
        "$snap_json" "$ts" "$(sign_camera_event_v2 "$gw_id" "$gw_secret" "$cam" motion "$ts" "$snap")"
}

# v2_selftest — 1 lệnh tự kiểm: chữ ký bash (openssl) phải BẰNG vector cố định mà backend/…/signature-v2.test.ts
# khẳng định cho đúng cùng input (và tests đó so với signature-v2.ts). In PASS/FAIL từng dòng, exit 1 nếu có lệch.
#   bash tests/security/lib_v2.sh --selftest
v2_selftest() {
    local secret="gateway-secret-for-test-only-0123456789abcdef0123456789abcd" fail=0
    local body='{"uptime":120,"rssi":-55,"ip":"192.168.1.50","fw_version":"1.2.3","nodes":[{"device_id":"node-living-01","online":true}]}'
    local cmd="0b9f7f6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"
    _chk() { # <tên> <thực tế> <kỳ vọng>
        if [[ "$2" == "$3" ]]; then echo "PASS  $1  $2"; else echo "FAIL  $1  got=$2 want=$3"; fail=1; fi
    }
    _chk "hb"            "$(sign_heartbeat_v2 gw-s3-01 "$secret" 1731700000 1731700000123 "$body")" 5aff042b08f47a9c5cce7cc30f78be93a06cfdf7206de39cf88864f9be4e1cf0
    _chk "ack power=1"   "$(sign_ack_v2 gw-s3-01 "$secret" node-living-01 "$cmd" ok true 1731700000)"  9dd9eff5ac24ea0c323a3ec101800c91e9d0d2bfd7dddebd1bcffe3897fe91e6
    _chk "ack power=0"   "$(sign_ack_v2 gw-s3-01 "$secret" node-living-01 "$cmd" ok false 1731700000)" 7f78dfea7a496bb674fc5cab21ef4e3a7f82bb6ddb72be0c4ba4989615b6a2c3
    _chk "ack no power"  "$(sign_ack_v2 gw-s3-01 "$secret" node-living-01 "$cmd" ok "" 1731700000)"    9d6d356cdc94e9f37c158fbd8f5ea64e7c14bae99aa0a56be1022f2a81672a2e
    _chk "evt snapshot"  "$(sign_camera_event_v2 gw-s3-01 "$secret" cam-door-01 motion 1731700000 345)" 95bfae69d24f331756c6db5f308a599b01a26c613a277bf61706392ee9181c59
    _chk "evt no snap"   "$(sign_camera_event_v2 gw-s3-01 "$secret" cam-door-01 motion 1731700000)"     9a1846db5fd7afff9b8d1cb152bfef8f85d61a5b5f2cb98855c0d92c94018803
    return "$fail"
}
if [[ "${BASH_SOURCE[0]}" == "$0" && "${1:-}" == "--selftest" ]]; then
    v2_selftest
    exit $?
fi

# build_v1 <gw_id> <gw_secret> <sn_id> <sn_secret> [ts] — chữ ký cũ "<id>:<ts>" (chỉ nhận khi DEVICE_HMAC_V1=true)
build_v1() {
    local gw_id="$1" gw_secret="$2" sn_id="$3" sn_secret="$4" ts="${5:-$(date +%s)}"
    printf '{"gateway_id":"%s","gw_timestamp":%s,"gw_hmac":"%s","sensor_payload":{"sensor_id":"%s","sn_timestamp":%s,"sn_hmac":"%s","data":{"temperature":28.5,"humidity":65.0}}}' \
        "$gw_id" "$ts" "$(hmac_sha256 "$gw_secret" "${gw_id}:${ts}")" "$sn_id" "$ts" "$(hmac_sha256 "$sn_secret" "${sn_id}:${ts}")"
}
