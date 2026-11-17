#!/usr/bin/env bash
# =============================================================================
#  Sinh CA nội bộ + chứng chỉ cho Broker MQTT (mTLS, FR-12.3/12.4), nginx HTTPS (NFR-S1) và 4 kết nối MQTT của backend
#
#  Dùng:  bash infra/pki/gen_mqtt_certs.sh [IP_LAN|hostname ...]
#  VD:    bash infra/pki/gen_mqtt_certs.sh 192.168.1.100
#         CA_KEY_PASS='...' bash infra/pki/gen_mqtt_certs.sh 192.168.1.100   # ca.key mã hoá bằng passphrase
#
#  - Truyền IP LAN của máy chạy broker — đúng host trong NVS cloud/mqtt_uri và cloud/api_url của gateway, và địa chỉ
#    app Mobile gọi (https://<IP>). Gateway/Mobile kiểm tra tên này trong cert.
#  - server.crt: Broker MQTT (8883). web.crt: nginx HTTPS (443) cho web (localhost, admin/operator/user.localhost),
#    app Mobile và đường thiết bị /api/device/** — hai cert tách riêng (lộ khoá của một bên không giả được bên kia).
#  - clients/iot-backend-*.{crt,key}: chứng chỉ client ECDSA của 4 kết nối MQTT backend (CN = tên kết nối = username
#    trên broker). Chỉ tạo khi chưa có.
#  - ca.crl: danh sách thu hồi (broker đọc). Thu hồi/cấp chứng chỉ gateway: infra/pki/gen_mqtt_client.sh.
#  - CA chỉ tạo 1 lần rồi dùng lại: đổi IP LAN thì chạy lại script để cấp lại server/web cert, KHÔNG phải nạp lại
#    firmware. Muốn thay CA: xoá infra/mosquitto/certs/ca.* rồi chạy lại (khi đó phải build + nạp lại gateway, cấp lại
#    mọi chứng chỉ client).
#  - Chép ca.crt vào certs/mqtt_ca.crt của project gateway ESP-IDF (gitignore).
#
#  Yêu cầu: openssl
# =============================================================================
set -euo pipefail

# shellcheck source=infra/pki/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

GW_CA_FILE="${PKI_GW_DIR:-$PKI_ROOT/firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs}/mqtt_ca.crt"
BACKEND_CLIENTS=(iot-backend-data iot-backend-commands iot-backend-heartbeat iot-backend-camera)

# SAN: mbedTLS trên ESP32 so khớp SAN kiểu DNS, nên mỗi IP được ghi cả dạng IP (cho OpenSSL/Node) lẫn DNS (cho gateway).
SAN_DNS=("localhost" "mqtt-broker")
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
# Web: 3 subdomain của nginx (trình duyệt tự phân giải *.localhost) — liệt kê từng tên, không dùng wildcard *.localhost
WEB_DNS=("localhost" "admin.localhost" "operator.localhost" "user.localhost")
for name in "${SAN_DNS[@]}"; do [[ "$name" == "localhost" || "$name" == "mqtt-broker" ]] || WEB_DNS+=("$name"); done

mkdir -p "$CERT_DIR"
# Docker tự tạo thư mục rỗng khi bind-mount file chưa tồn tại — dọn trước khi ghi file.
for f in ca.crt ca.crl server.crt server.key web.crt web.key; do
  if [[ -d "$CERT_DIR/$f" ]]; then
    rmdir "$CERT_DIR/$f" 2>/dev/null || { echo "[lỗi] $CERT_DIR/$f là thư mục không rỗng, xoá thủ công"; exit 1; }
  fi
done

PKI_TMP="$(mktemp -d)"
trap 'rm -rf "$PKI_TMP"' EXIT

pki_ensure_ca   # cd vào CERT_DIR

# ── Chứng chỉ server (broker / nginx) ─────────────────────────────────────────
issue_server() {
  local base="$1" cn="$2"; shift 2
  local -a dns=() ips=()
  local mode=dns
  for arg in "$@"; do
    if [[ "$arg" == "--ip" ]]; then mode=ip; continue; fi
    if [[ "$mode" == dns ]]; then dns+=("$arg"); else ips+=("$arg"); fi
  done
  {
    cat <<EOF
[req]
distinguished_name = dn
prompt             = no
[dn]
O  = Secure Smart Home IoT
CN = $cn
[v3_server]
basicConstraints       = critical, CA:FALSE
keyUsage               = critical, digitalSignature, keyEncipherment
extendedKeyUsage       = serverAuth
subjectKeyIdentifier   = hash
authorityKeyIdentifier = keyid, issuer
subjectAltName         = @alt
[alt]
EOF
    local i=1
    for d in "${dns[@]}"; do echo "DNS.$i = $d"; i=$((i + 1)); done
    i=1
    for ip in "${ips[@]}"; do echo "IP.$i = $ip"; i=$((i + 1)); done
  } > "$PKI_TMP/$base.cnf"
  pki_run openssl req -new -newkey rsa:2048 -nodes -config "$PKI_TMP/$base.cnf" \
    -keyout "$base.key" -out "$PKI_TMP/$base.csr"
  # shellcheck disable=SC2046
  pki_run openssl x509 -req -in "$PKI_TMP/$base.csr" -CA ca.crt -CAkey ca.key $(pki_passin) \
    -set_serial "0x$(openssl rand -hex 16)" -days "$LEAF_DAYS" -sha256 \
    -extfile "$PKI_TMP/$base.cnf" -extensions v3_server -out "$base.crt"
  chmod 600 "$base.key"
  pki_run openssl verify -CAfile ca.crt "$base.crt"
  echo "[$base] Đã cấp $base.crt (hạn $LEAF_DAYS ngày) — SAN DNS: ${dns[*]} · IP: ${ips[*]}"
}

issue_server server mqtt-broker "${SAN_DNS[@]}" --ip "${SAN_IP[@]}"
issue_server web localhost "${WEB_DNS[@]}" --ip "${SAN_IP[@]}"

# ── Chứng chỉ client của backend (mTLS) ──────────────────────────────────────
for cn in "${BACKEND_CLIENTS[@]}"; do
  if [[ -f "clients/$cn.crt" && -f "clients/$cn.key" ]]; then
    echo "[client] Dùng lại clients/$cn.crt"
  else
    pki_issue_client "$cn" "clients/$cn.key" "clients/$cn.crt"
    echo "[client] Đã cấp clients/$cn.crt (CN = $cn)"
  fi
done

# ── CA cho firmware gateway (ESP-IDF nhúng certs/mqtt_ca.crt lúc build) ───────
mkdir -p "$(dirname "$GW_CA_FILE")"
tr -d '\r' < ca.crt > "$GW_CA_FILE"
echo "[fw]     Đã chép CA vào ${GW_CA_FILE#"$PKI_ROOT"/} — build lại gateway nếu CA mới"

if [[ $# -eq 0 ]]; then
  echo
  echo "[cảnh báo] Chưa truyền IP LAN — gateway ESP32 và app Mobile sẽ không xác thực được server."
  echo "           Chạy lại: bash infra/pki/gen_mqtt_certs.sh <IP máy chạy broker>"
fi
echo
echo "Tiếp theo:"
echo "  - Chứng chỉ client cho từng gateway:  bash infra/pki/gen_mqtt_client.sh <gateway_id>"
echo "  - docker compose up -d --force-recreate mqtt-broker nginx backend"
echo "  - Trình duyệt/điện thoại tin CA nội bộ để mở https:// không cảnh báo: cài infra/mosquitto/certs/ca.crt (docs/guides/MQTT_TLS.md)"
