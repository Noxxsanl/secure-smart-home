#!/usr/bin/env bash
# =============================================================================
#  Kiểm tra MQTT TLS của Broker 2 (FR-12.3) — dùng khi nghiệm thu / demo bảo vệ
#
#  Dùng:  bash scripts/check_mqtt_tls.sh [host] [port]    (mặc định: localhost 8883)
#  VD:    bash scripts/check_mqtt_tls.sh 192.168.1.100
#
#  Yêu cầu: openssl, bash có /dev/tcp (Git Bash / Linux)
# =============================================================================
set -uo pipefail

HOST="${1:-localhost}"
PORT="${2:-8883}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CA="$ROOT/mosquitto/certs/ca.crt"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
PASS=0; FAIL=0
ok()  { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
bad() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }

[[ -f "$CA" ]] || { echo "Không thấy $CA — chạy scripts/gen_mqtt_certs.sh trước"; exit 1; }

if [[ "$HOST" =~ ^[0-9.]+$ ]]; then
  VERIFY_NAME=(-verify_ip "$HOST")
else
  VERIFY_NAME=(-verify_hostname "$HOST" -servername "$HOST")
fi

tls() { timeout 10 openssl s_client -connect "$HOST:$PORT" -brief "$@" </dev/null 2>&1; }

echo "Broker 2: $HOST:$PORT"
echo

echo "1. Handshake TLS với CA nội bộ, kiểm chứng cert + tên host"
out="$(tls -CAfile "$CA" -verify_return_error "${VERIFY_NAME[@]}")"
if grep -q "Verification: OK" <<<"$out"; then
  ok "$(grep -E '^Protocol version' <<<"$out") · $(grep -E '^Ciphersuite' <<<"$out")"
else
  bad "Handshake/verify thất bại:"; sed 's/^/         /' <<<"$out" | head -5
fi

echo "2. Client cũ TLS 1.1 bị từ chối (broker: tls_version tlsv1.2)"
out="$(tls -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0')"
if grep -q "CONNECTION ESTABLISHED" <<<"$out"; then bad "Broker vẫn chấp nhận TLS 1.1"; else ok "Bị từ chối"; fi

echo "3. Client không tin CA nội bộ không xác thực được broker"
out="$(tls -verify_return_error)"
if grep -q "Verification: OK" <<<"$out"; then bad "Cert broker được tin bởi CA hệ thống?"; else ok "Verify thất bại như mong đợi"; fi

echo "4. MQTT plaintext vào cổng TLS không nhận được CONNACK"
# Gói CONNECT MQTT 3.1.1 tối thiểu (client id rỗng, clean session, keepalive 60s)
reply="$(timeout 5 bash -c "exec 3<>/dev/tcp/$HOST/$PORT && printf '\x10\x0c\x00\x04MQTT\x04\x02\x00\x3c\x00\x00' >&3 && head -c 2 <&3 | od -An -tx1" 2>/dev/null | tr -d ' \n')"
if [[ "$reply" == "2002" ]]; then bad "Broker trả CONNACK cho kết nối không mã hoá"; else ok "Không có CONNACK"; fi

echo
echo "Kết quả: $PASS đạt, $FAIL không đạt"
echo "Wireshark: lọc 'tcp.port == $PORT' — chỉ thấy 'TLSv1.2/1.3 Application Data', không đọc được topic/payload."
[[ $FAIL -eq 0 ]]
