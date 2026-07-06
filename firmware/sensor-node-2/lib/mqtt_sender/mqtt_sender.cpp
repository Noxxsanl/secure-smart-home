#include "mqtt_sender.h"
#include "config_2.h"
#include "hmac_util.h"
#include "ntp_sync.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

static WiFiClient   espClient;
static PubSubClient mqttClient(espClient);

//  Setup 

void mqttSetup() {
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
    Serial.printf("[MQTT] Broker: %s:%d\n", MQTT_HOST, MQTT_PORT);
}

//  Internal 

static bool mqttConnect() {
    String clientId = "sn-" + String(DEVICE_ID);
    Serial.printf("[MQTT] Kết nối với id='%s'...", clientId.c_str());

    if (mqttClient.connect(clientId.c_str())) {
        Serial.println(" OK");
        return true;
    }

    Serial.printf(" FAILED (rc=%d)\n", mqttClient.state());
    return false;
}

// ─── Maintain ─────────────────────────────────────────────────────────────────

void mqttMaintain() {
    if (mqttClient.connected()) {
        mqttClient.loop();
        return;
    }

    static unsigned long lastAttempt = 0;
    if (millis() - lastAttempt >= 5000) {
        lastAttempt = millis();
        mqttConnect();
    }
}

bool mqttIsConnected() {
    return mqttClient.connected();
}

// ─── Publish ──────────────────────────────────────────────────────────────────

bool mqttPublishSensorData(const SensorData& data) {
    if (!mqttClient.connected()) {
        Serial.println("[MQTT] Không thể publish – chưa kết nối broker!");
        return false;
    }

    unsigned long timestamp = getCurrentTimestamp();

    String message = String(DEVICE_ID) + ":" + String(timestamp);
    String hmac    = computeHMAC(String(SECRET_KEY), message);

    StaticJsonDocument<256> doc;
    doc["sensor_id"]    = DEVICE_ID;
    doc["sn_timestamp"] = timestamp;
    doc["sn_hmac"]      = hmac;
    doc["sensor_ip"]    = WiFi.localIP().toString();

    JsonObject sensorData = doc.createNestedObject("data");
    sensorData["temperature"] = data.temperature;
    sensorData["humidity"]    = data.humidity;

    char payload[MQTT_BUFFER_SIZE];
    size_t len = serializeJson(doc, payload, sizeof(payload));

    String topic = "local/sensors/" + String(DEVICE_ID) + "/data";
    bool ok = mqttClient.publish(topic.c_str(), payload, false);

    if (ok) {
        Serial.printf("[MQTT] Published (%d bytes): %s\n", (int)len, payload);
    } else {
        Serial.println("[MQTT] Publish FAILED!");
    }

    return ok;
}
