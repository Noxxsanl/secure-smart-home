#!/usr/bin/env bash
# =============================================================================
#  Kiểm tra xác thực client + ACL của Broker MQTT đang chạy (docker compose) — FR-12.4
#
#  Dùng:  bash tests/security/check_mqtt_acl.sh <gateway_id> [thư mục chứng chỉ gateway]
#         (mặc định thư mục: firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs —
#          nơi infra/pki/gen_mqtt_client.sh <gateway_id> ghi mqtt_client.{crt,key})
#
#  Chạy mosquitto_sub/pub trong container tạm (image eclipse-mosquitto:2) nối vào mạng của broker — không cần cài
#  client MQTT trên máy. LƯU Ý: dùng chứng chỉ của gateway thật thì gateway đó bị broker ngắt vài giây (client id = CN,
#  phiên mới thay phiên cũ) rồi tự nối lại.
# =============================================================================
set -uo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash: không đổi đường dẫn /certs/... trong tham số docker

GW="${1:-}"
[[ -n "$GW" ]] || { echo "Dùng: $0 <gateway_id> [thư mục chứng chỉ gateway]"; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GW_DIR="${2:-$ROOT/firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs}"
CERTS="${PKI_CERT_DIR:-$ROOT/infra/mosquitto/certs}"
BROKER_CONTAINER="${BROKER_CONTAINER:-iot-mosquitto}"
OTHER="acl-probe-other-gateway"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
PASS=0; FAIL=0
ok()  { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
bad() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }

[[ -f "$CERTS/ca.crt" ]] || { echo "Không thấy $CERTS/ca.crt — chạy infra/pki/gen_mqtt_certs.sh"; exit 1; }
[[ -f "$GW_DIR/mqtt_client.crt" && -f "$GW_DIR/mqtt_client.key" ]] || {
  echo "Không thấy $GW_DIR/mqtt_client.{crt,key} — chạy infra/pki/gen_mqtt_client.sh $GW"; exit 1; }
NET="$(docker inspect "$BROKER_CONTAINER" -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)" || true
[[ -n "$NET" ]] || { echo "Broker $BROKER_CONTAINER chưa chạy (docker compose up -d mqtt-broker)"; exit 1; }

# Đường dẫn Windows cho docker (Git Bash) / giữ nguyên trên Linux
winpath() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }
mq() {
  docker run --rm --network "$NET" \
    -v "$(winpath "$CERTS/ca.crt"):/certs/ca.crt:ro" \
    -v "$(winpath "$GW_DIR"):/gw:ro" \
    eclipse-mosquitto:2 "$@" -h mqtt-broker -p 8883 --cafile /certs/ca.crt 2>&1
}
GWC=(--cert /gw/mqtt_client.crt --key /gw/mqtt_client.key)

echo "Broker: $BROKER_CONTAINER (mạng $NET) · gateway: $GW"
echo

echo "1. Không có chứng chỉ client → không kết nối được"
out="$(mq mosquitto_sub -t '#' -W 3)"
if grep -qiE "lost|refused|error|not authori" <<<"$out"; then ok "Bị từ chối ($(head -c 60 <<<"$out"))"; else bad "Kết nối được khi không có chứng chỉ: $out"; fi

echo "2. Gateway publish vào topic của gateway khác → Not authorized"
out="$(mq mosquitto_pub "${GWC[@]}" -V mqttv5 -q 1 -t "gateway/$OTHER/data" -m probe)"
if grep -qi "not authori" <<<"$out"; then ok "Bị từ chối"; else bad "Publish được vào gateway/$OTHER/data: ${out:-<không lỗi>}"; fi

echo "3. Gateway publish vào topic của chính nó → được phép"
out="$(mq mosquitto_pub "${GWC[@]}" -V mqttv5 -q 1 -t "home/0/gateway/$GW/heartbeat" -m '{}')"
if [[ -z "$out" ]]; then ok "Được phép (backend bỏ heartbeat sai định dạng, không tính lỗi)"; else bad "Bị từ chối: $out"; fi

echo "4. Gateway nghe '#', '\$SYS/#', lệnh của gateway khác và lệnh của chính nó; backend gửi 2 lệnh"
echo "   (kết nối lệnh của backend bị ngắt ~5 s vì dùng cùng chứng chỉ iot-backend-commands)"
out="$(docker run --rm --network "$NET" -v "$(winpath "$CERTS/ca.crt"):/certs/ca.crt:ro" -v "$(winpath "$GW_DIR"):/gw:ro" \
  -v "$(winpath "$CERTS/clients"):/clients:ro" --entrypoint sh eclipse-mosquitto:2 -c "
    B='-h mqtt-broker -p 8883 --cafile /certs/ca.crt'
    mosquitto_sub \$B --cert /gw/mqtt_client.crt --key /gw/mqtt_client.key \
      -t '#' -t '\$SYS/#' -t 'home/+/gateway/$OTHER/#' -t 'home/+/gateway/$GW/device/+/command' -v -W 6 > /tmp/sub.txt 2>&1 &
    sleep 2
    for t in 'home/0/gateway/$OTHER/device/probe/command:probe-other' 'home/0/gateway/$GW/device/probe/command:probe-own'; do
      mosquitto_pub \$B --cert /clients/iot-backend-commands.crt --key /clients/iot-backend-commands.key \
        -q 1 -t \"\${t%%:*}\" -m \"\${t##*:}\" >/dev/null 2>&1
    done
    wait; grep -v 'Timed out' /tmp/sub.txt || true" 2>&1)"
if grep -q "probe-other" <<<"$out"; then
  bad "Gateway đọc được lệnh của gateway khác"
elif grep -q "probe-own" <<<"$out"; then
  ok "Chỉ nhận lệnh của chính nó (không thấy '#', \$SYS, lệnh gateway khác)"
else
  bad "Không nhận được cả lệnh của chính nó (đối chứng hỏng): $(head -c 200 <<<"$out")"
fi

echo "5. Gateway đặt client id 'iot-backend-data' → broker ép về CN '$GW' (không chiếm phiên backend)"
mq mosquitto_pub "${GWC[@]}" -i iot-backend-data -t "home/0/gateway/$GW/heartbeat" -m '{}' >/dev/null
sleep 2   # broker ghi log ra stdout có đệm — chờ dòng "New client connected" hiện ra
# Đọc log vào biến trước: `docker logs | grep -q` với pipefail bị SIGPIPE → luôn coi là thất bại
logs="$(docker logs --since 30s "$BROKER_CONTAINER" 2>&1)"
if grep -q "as $GW " <<<"$logs"; then
  if grep -q "Client iot-backend-data .* session taken over" <<<"$logs"; then
    bad "Phiên iot-backend-data bị chiếm"
  else
    ok "Kết nối mang client id = CN của chứng chỉ"
  fi
else
  bad "Không thấy dòng 'New client connected ... as $GW' trong log broker"
fi

echo
echo "Kết quả: $PASS đạt, $FAIL không đạt"
[[ $FAIL -eq 0 ]]
