#pragma once
#include <Arduino.h>

// Đồng bộ thời gian từ NTP (UTC+7). Gọi 1 lần trong setup() sau khi WiFi kết nối.
void ntpSetup();

// Trả Unix timestamp hiện tại (giây). Dùng cho HMAC: "device_id:timestamp".
unsigned long getCurrentTimestamp();

// Trả true nếu NTP đã sync thành công ít nhất 1 lần.
bool ntpIsSynced();
