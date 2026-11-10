#!/usr/bin/env bash
# =============================================================================
#  Sinh CA nội bộ + chứng chỉ server cho Mosquitto Broker 2 (MQTT TLS, FR-12.3)
#
#  Dùng:  bash infra/pki/gen_mqtt_certs.sh [IP_LAN|hostname ...]
#  VD:    bash infra/pki/gen_mqtt_certs.sh 192.168.1.100
#
#  - Truyền IP LAN của máy chạy broker — đúng host trong NVS cloud/mqtt_uri và
#    cloud/api_url của gateway. Gateway kiểm tra tên này trong cert.
#  - Cùng server cert dùng cho Broker 2 (8883) và nginx HTTPS (443, gateway gửi
#    ảnh camera / fallback /api/device/data).
#  - SAN luôn có sẵn: localhost, 127.0.0.1, mqtt-broker-2 (tên service Docker).
#  - CA chỉ tạo 1 lần rồi dùng lại: đổi IP LAN thì chạy lại script để cấp lại
#    server cert, KHÔNG phải nạp lại firmware. Muốn thay CA: xoá
#    infra/mosquitto/certs/ca.* rồi chạy lại (khi đó phải build + nạp lại gateway).
#  - Chép ca.crt vào certs/mqtt_ca.crt của project gateway ESP-IDF (gitignore).
#
#  Yêu cầu: openssl
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/infra/mosquitto/certs"
GW_CA_FILE="$ROOT/firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs/mqtt_ca.crt"
CA_DAYS=3650
SERVER_DAYS=825

command -v openssl >/dev/null || { echo "[lỗi] Cần cài openssl (có sẵn trong Git Bash)"; exit 1; }

# SAN của server cert. mbedTLS 2.x trên ESP32 (Arduino core 2.0.x) chỉ so khớp SAN
# kiểu DNS, nên mỗi IP được ghi cả dạng IP (cho OpenSSL/Node) lẫn DNS (cho gateway).
SAN_DNS=("localhost" "mqtt-broker-2")
SAN_IP=("127.0.0.1")
for name in "$@"; do
  if [[ "$name" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    SAN_IP+=("$name")
    SAN_DNS+=("$name")
  elif [[ "$name" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
    SAN_DNS+=("$name")
  else
    echo "[lỗi] '$name' không phải IPv4 hay hostname hợp lệ"
    exit 1
  fi
done

mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

# Docker tự tạo thư mục rỗng khi bind-mount file chưa tồn tại — dọn trước khi ghi file.
for f in ca.crt server.crt server.key; do
  if [[ -d "$f" ]]; then
    rmdir "$f" 2>/dev/null || { echo "[lỗi] $CERT_DIR/$f là thư mục không rỗng, xoá thủ công"; exit 1; }
  fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Chạy openssl im lặng, chỉ in stderr khi lỗi
run() { "$@" 2>"$TMP/err" || { cat "$TMP/err" >&2; exit 1; }; }

# ── 1. CA nội bộ ──────────────────────────────────────────────────────────────
if [[ -f ca.key && -f ca.crt ]]; then
  echo "[ca]     Dùng lại CA có sẵn: $CERT_DIR/ca.crt"
else
  cat > "$TMP/ca.cnf" <<'EOF'
[req]
distinguished_name = dn
prompt             = no
x509_extensions    = v3_ca
[dn]
O  = Secure Smart Home IoT
CN = Secure Smart Home IoT Local CA
[v3_ca]
basicConstraints       = critical, CA:TRUE, pathlen:0
keyUsage               = critical, keyCertSign, cRLSign
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid:always
EOF
  run openssl req -x509 -new -newkey rsa:2048 -nodes -sha256 -days "$CA_DAYS" \
    -config "$TMP/ca.cnf" -keyout ca.key -out ca.crt
  chmod 600 ca.key
  echo "[ca]     Đã tạo CA mới (hạn $CA_DAYS ngày) — ca.key không được rời khỏi máy này"
fi

# ── 2. Server cert cho Broker 2 ───────────────────────────────────────────────
{
  cat <<'EOF'
[req]
distinguished_name = dn
prompt             = no
[dn]
O  = Secure Smart Home IoT
CN = mqtt-broker-2
[v3_server]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature, keyEncipherment
extendedKeyUsage       = serverAuth
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid, issuer
subjectAltName         = @alt
[alt]
EOF
  i=1; for d in "${SAN_DNS[@]}"; do echo "DNS.$i = $d"; i=$((i + 1)); done
  i=1; for ip in "${SAN_IP[@]}"; do echo "IP.$i = $ip"; i=$((i + 1)); done
} > "$TMP/server.cnf"

run openssl req -new -newkey rsa:2048 -nodes -config "$TMP/server.cnf" \
  -keyout server.key -out "$TMP/server.csr"
run openssl x509 -req -in "$TMP/server.csr" -CA ca.crt -CAkey ca.key \
  -set_serial "0x$(openssl rand -hex 16)" -days "$SERVER_DAYS" -sha256 \
  -extfile "$TMP/server.cnf" -extensions v3_server -out server.crt
run openssl verify -CAfile ca.crt server.crt >/dev/null
echo "[server] Đã cấp server.crt (hạn $SERVER_DAYS ngày)"
echo "         SAN DNS: ${SAN_DNS[*]}"
echo "         SAN IP : ${SAN_IP[*]}"

# ── 3. CA cho firmware gateway (ESP-IDF nhúng certs/mqtt_ca.crt lúc build) ───
mkdir -p "$(dirname "$GW_CA_FILE")"
tr -d '\r' < ca.crt > "$GW_CA_FILE"
echo "[fw]     Đã chép CA vào ${GW_CA_FILE#"$ROOT"/} — build lại gateway nếu CA mới"

if [[ $# -eq 0 ]]; then
  echo
  echo "[cảnh báo] Chưa truyền IP LAN — gateway ESP32 sẽ không xác thực được broker."
  echo "           Chạy lại: bash infra/pki/gen_mqtt_certs.sh <IP máy chạy broker>"
fi
echo
echo "Tiếp theo: docker compose up -d --force-recreate mqtt-broker-2 nginx backend"
