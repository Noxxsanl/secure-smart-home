#pragma once
#include <Arduino.h>

// Tính HMAC-SHA256 dùng mbedtls (built-in ESP32 Arduino framework).
// key: hex string 64 ký tự từ server
// message: nội dung cần ký, vd "ESP32-SN-ABCD1234:1700000000"
// return: hex string 64 ký tự lowercase
String computeHMAC(const String& key, const String& message);
