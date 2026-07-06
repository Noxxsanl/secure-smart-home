#include <Arduino.h>
#include "config_2.h"
#include "wifi_manager.h"
#include "ntp_sync.h"
#include "sensor_reader.h"
#include "hmac_util.h"
#include "mqtt_sender.h"

// Thời điểm gửi dữ liệu lần cuối
static unsigned long lastSendTime = 0;

// ─── SETUP ────────────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n╔══════════════════════════════════╗");
    Serial.println("║   IoT Sensor Node 2 – Khởi động    ║");
    Serial.println("╚══════════════════════════════════╝");
    Serial.printf("  Device ID  : %s\n", DEVICE_ID);
    Serial.printf("  DHT22 Pin  : GPIO %d\n", DHT_PIN);
    Serial.printf("  Gửi mỗi   : %d ms\n\n", SEND_INTERVAL);

    // LED gửi dữ liệu (GPIO 2 – onboard LED)
    pinMode(LED_SEND_PIN, OUTPUT);
    digitalWrite(LED_SEND_PIN, LOW);

    // 1. WiFi
    wifiSetup();

    // 2. NTP (cần WiFi)
    ntpSetup();

    // 3. DHT22
    sensorSetup();

    // 4. MQTT
    mqttSetup();

    Serial.println("\n[MAIN] Setup hoàn tất – vào vòng lặp chính\n");
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────

void loop() {
    // Duy trì kết nối WiFi và MQTT
    wifiMaintain();
    mqttMaintain();

    // Gửi dữ liệu theo chu kỳ SEND_INTERVAL
    if (millis() - lastSendTime < SEND_INTERVAL) {
        return;
    }
    lastSendTime = millis();

    // Kiểm tra điều kiện cần thiết trước khi gửi
    if (!wifiIsConnected()) {
        Serial.println("[MAIN] Bỏ qua – WiFi chưa kết nối");
        return;
    }
    if (!ntpIsSynced()) {
        Serial.println("[MAIN] Bỏ qua – NTP chưa đồng bộ (HMAC sẽ sai)");
        return;
    }
    if (!mqttIsConnected()) {
        Serial.println("[MAIN] Bỏ qua – MQTT chưa kết nối broker");
        return;
    }

    // Đọc cảm biến
    SensorData reading = readSensor();
    if (!reading.valid) {
        Serial.println("[MAIN] Bỏ qua – Cảm biến trả dữ liệu không hợp lệ");
        return;
    }

    // Gửi lên MQTT → Gateway sẽ forward lên Backend
    bool sent = mqttPublishSensorData(reading);

    // Nháy LED onboard (GPIO 2) khi gửi thành công
    if (sent) {
        digitalWrite(LED_SEND_PIN, HIGH);
        delay(100);
        digitalWrite(LED_SEND_PIN, LOW);
    }
}
