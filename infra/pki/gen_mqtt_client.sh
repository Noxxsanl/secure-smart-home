#!/usr/bin/env bash
# =============================================================================
#  Cấp / thu hồi chứng chỉ client MQTT (mTLS) cho một GATEWAY — FR-12.4
#
#  Cấp:      bash infra/pki/gen_mqtt_client.sh <gateway_id> [--force]
#  Thu hồi:  bash infra/pki/gen_mqtt_client.sh --revoke <gateway_id>
#
#  - CN = gateway_id = username trên broker (use_identity_as_username) → ACL chỉ cho gateway này publish/subscribe
#    topic của chính nó (infra/mosquitto/acl). Khoá ECDSA P-256.
#  - Ghi khoá + chứng chỉ vào certs/ của project gateway (gitignore):
#      firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs/mqtt_client.{crt,key}
#    rồi thêm 2 dòng vào nvs_dev.csv của gateway (namespace cloud) và nạp lại NVS:
#      mqtt_cert,file,string,certs/mqtt_client.crt
#      mqtt_key,file,string,certs/mqtt_client.key
#  - Thu hồi: đưa chứng chỉ đã cấp (infra/mosquitto/certs/issued/<id>.crt) vào ca.crl → khởi động lại broker:
#      docker compose restart mqtt-broker
#    Gateway bị thu hồi không bắt tay TLS được nữa. Nên khoá thiết bị trên Dashboard (status blocked) cùng lúc.
#  Không in khoá riêng ra màn hình.
# =============================================================================
set -euo pipefail

# shellcheck source=infra/pki/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

GW_CERT_DIR="${PKI_GW_DIR:-$PKI_ROOT/firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs}"

usage() { echo "Dùng: $0 <gateway_id> [--force]  |  $0 --revoke <gateway_id>"; exit 1; }

revoke=false
force=false
id=""
for arg in "$@"; do
  case "$arg" in
    --revoke) revoke=true ;;
    --force) force=true ;;
    -*) usage ;;
    *) [[ -z "$id" ]] && id="$arg" || usage ;;
  esac
done
[[ -n "$id" ]] || usage
# Cùng bộ ký tự UID của firmware gateway (gw_valid_id): không có '/', '+', '#' (ký tự topic MQTT) hay ':'
if [[ ! "$id" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; then
  echo "[lỗi] gateway_id chỉ gồm chữ, số, _ và -, tối đa 64 ký tự"; exit 1
fi
if [[ "$id" == iot-backend-* ]]; then
  echo "[lỗi] Tiền tố iot-backend- dành cho kết nối của backend"; exit 1
fi
[[ -f "$CERT_DIR/ca.crt" && -f "$CERT_DIR/ca.key" ]] || {
  echo "[lỗi] Chưa có CA — chạy bash infra/pki/gen_mqtt_certs.sh <IP LAN> trước"; exit 1
}

PKI_TMP="$(mktemp -d)"
trap 'rm -rf "$PKI_TMP"' EXIT
pki_ensure_ca   # cd vào CERT_DIR (tạo sổ cái/CRL nếu CA cũ chưa có)

if $revoke; then
  [[ -f "issued/$id.crt" ]] || { echo "[lỗi] Không thấy issued/$id.crt — chứng chỉ chưa từng được cấp bằng script này"; exit 1; }
  # shellcheck disable=SC2046
  pki_run openssl ca -config ca.cnf -revoke "issued/$id.crt" $(pki_passin)
  pki_gen_crl
  mv "issued/$id.crt" "issued/$id.revoked-$(date +%Y%m%d%H%M%S).crt"
  echo "[revoke] Đã thu hồi chứng chỉ của $id. Áp dụng: docker compose restart mqtt-broker"
  exit 0
fi

if [[ -f "issued/$id.crt" && "$force" != true ]]; then
  echo "[lỗi] $id đã có chứng chỉ (issued/$id.crt). Cấp lại: --force (nên thu hồi bản cũ bằng --revoke trước)"; exit 1
fi
pki_issue_client "$id" "$GW_CERT_DIR/mqtt_client.key" "$GW_CERT_DIR/mqtt_client.crt"
echo "[client] Đã cấp chứng chỉ client CN = $id (hạn $LEAF_DAYS ngày)"
echo "         Khoá + chứng chỉ: ${GW_CERT_DIR#"$PKI_ROOT"/}/mqtt_client.{key,crt}"
echo
echo "Tiếp theo — thêm vào nvs_dev.csv của gateway (dưới dòng cloud,namespace,,) rồi tạo lại + nạp NVS:"
echo "  mqtt_cert,file,string,certs/mqtt_client.crt"
echo "  mqtt_key,file,string,certs/mqtt_client.key"
