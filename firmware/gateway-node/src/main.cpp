#include <Arduino.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "config_gw.h"
#include "wifi_manager.h"
#include "ntp_sync.h"
#include "mqtt_client.h"
#include "forwarder.h"
#include "sensor_registry.h"

static unsigned long _fwdLedOffAt = 0;

static void onSensorMessage(const char* topic, const char* payload, unsigned int length) {
    if (!ntpIsSynced()) {
        Serial.println("[MAIN] Drop – NTP not synced, cannot validate timestamp");
        return;
    }

    if (forwardSensorData(topic, payload, length)) {
        digitalWrite(LED_FWD_PIN, HIGH);
        _fwdLedOffAt = millis() + 100;
    }
}

void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // suppress brownout during WiFi radio startup
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n╔══════════════════════════════════╗");
    Serial.println("║   IoT Gateway Node – Starting    ║");
    Serial.println("╚══════════════════════════════════╝");
    Serial.printf("  Gateway ID : %s\n", GW_DEVICE_ID);
    Serial.printf("  MQTT Topic : %s\n\n", GATEWAY_DATA_TOPIC);

    pinMode(LED_FWD_PIN, OUTPUT);
    digitalWrite(LED_FWD_PIN, LOW);

    wifiSetup();
    ntpSetup();
    mqttClientSetup(onSensorMessage);

    // Fetch danh sách sensor từ backend sau khi WiFi + NTP sẵn sàng
    if (ntpIsSynced()) {
        fetchSensorList();
    }

    Serial.println("\n[MAIN] Ready – listening for sensor data...\n");
}

void loop() {
    if (_fwdLedOffAt && millis() >= _fwdLedOffAt) {
        digitalWrite(LED_FWD_PIN, LOW);
        _fwdLedOffAt = 0;
    }
    wifiMaintain();
    mqttClientMaintain();

    // Làm mới danh sách sensor mỗi SENSOR_REGISTRY_TTL_MS (5 phút)
    if (wifiIsConnected() && ntpIsSynced() && registryNeedsRefresh()) {
        fetchSensorList();
    }
}
