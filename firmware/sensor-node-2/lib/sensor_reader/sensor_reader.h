#pragma once
#include <Arduino.h>

struct SensorData {
    float temperature;  // °C
    float humidity;     // %
    bool  valid;        // false nếu đọc thất bại
};

// Khởi tạo DHT22 trên DHT_PIN. Gọi 1 lần trong setup().
// Phần cứng: pull-up 10kΩ từ DATA lên 3.3V.
void sensorSetup();

// Đọc nhiệt độ và độ ẩm. valid=false nếu cảm biến trả NaN.
SensorData readSensor();
