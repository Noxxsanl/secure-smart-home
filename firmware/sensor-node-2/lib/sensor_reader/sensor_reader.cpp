#include "sensor_reader.h"
#include "config_2.h"
#include <DHT.h>

static DHT dht(DHT_PIN, DHT_TYPE);

void sensorSetup() {
    dht.begin();
    delay(2000);  // DHT22 cần ~2s warmup sau khi cấp nguồn
    Serial.printf("[DHT] DHT22 khởi tạo trên GPIO %d\n", DHT_PIN);
}

SensorData readSensor() {
    SensorData data;

    data.humidity    = dht.readHumidity();
    data.temperature = dht.readTemperature();

    if (isnan(data.humidity) || isnan(data.temperature)) {
        Serial.println("[DHT] ERROR: Không đọc được dữ liệu từ DHT22!");
        data.valid       = false;
        data.temperature = 0.0f;
        data.humidity    = 0.0f;
    } else {
        data.valid = true;
        Serial.printf("[DHT] Nhiệt độ: %.1f°C | Độ ẩm: %.1f%%\n",
                      data.temperature, data.humidity);
    }

    return data;
}
