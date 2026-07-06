#pragma once
#include <Arduino.h>

// Khởi tạo WiFi và LED chỉ thị. Gọi 1 lần trong setup().
void wifiSetup();

// Duy trì kết nối WiFi, tự reconnect nếu mất. Gọi mỗi loop().
void wifiMaintain();

// Trả true nếu WiFi đang kết nối.
bool wifiIsConnected();
