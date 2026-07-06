#pragma once
#include <Arduino.h>
#include "sensor_reader.h"

// Khởi tạo MQTT client. Gọi 1 lần trong setup().
void mqttSetup();

// Duy trì kết nối MQTT, tự reconnect nếu mất. Gọi mỗi loop().
void mqttMaintain();

// Trả true nếu MQTT đang kết nối tới broker.
bool mqttIsConnected();

// Build JSON payload với HMAC-SHA256 rồi publish lên:
//   local/sensors/<DEVICE_ID>/data
// Payload: { sensor_id, sn_timestamp, sn_hmac, data: { temperature, humidity } }
// Trả true nếu publish thành công.
bool mqttPublishSensorData(const SensorData& data);
