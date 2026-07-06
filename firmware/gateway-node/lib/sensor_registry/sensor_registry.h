#pragma once
#include <Arduino.h>

// Fetch danh sách sensor từ backend (xác thực bằng Gateway HMAC).
// Trả về true nếu thành công. Gọi sau khi WiFi + NTP sẵn sàng.
bool fetchSensorList();

// Tra cứu secret_key theo sensor_id.
// Ưu tiên danh sách động; fallback về KNOWN_SENSORS trong config_gw.h.
// Trả về nullptr nếu không tìm thấy.
const char* registryFindSecret(const char* sensor_id);

// Trả về true nếu cần làm mới (chưa fetch lần nào hoặc đã quá TTL).
bool registryNeedsRefresh();
