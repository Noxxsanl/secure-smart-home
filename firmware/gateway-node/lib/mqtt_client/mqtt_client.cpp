#include "mqtt_client.h"
#include "config_gw.h"
#include "wifi_manager.h"
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

// Broker 1: Gateway subscribes sensor data (local/sensors/+/data)
static WiFiClient   espSubClient;
static PubSubClient mqttSubClient(espSubClient);

// Broker 2: Gateway publishes forwarded data to backend (gateway/<id>/data)
static WiFiClient   espPubClient;
static PubSubClient mqttPubClient(espPubClient);

static MessageCallback _userCallback = nullptr;

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    if (!_userCallback) return;

    char buf[MQTT_BUFFER_SIZE];
    unsigned int copyLen = (length < sizeof(buf) - 1) ? length : sizeof(buf) - 1;
    memcpy(buf, payload, copyLen);
    buf[copyLen] = '\0';

    Serial.println("\n[MQTT-SUB] ══════════════════════════════════════════════");
    Serial.printf("[MQTT-SUB]   topic  : %s\n", topic);
    Serial.printf("[MQTT-SUB]   size   : %u bytes\n", length);
    if (length > 0) {
        unsigned int previewLen = copyLen < 300 ? copyLen : 300;
        char preview[301];
        memcpy(preview, buf, previewLen);
        preview[previewLen] = '\0';
        Serial.printf("[MQTT-SUB]   payload: %s%s\n", preview, copyLen > 300 ? " ..." : "");
    }
    Serial.println("[MQTT-SUB] ──────────────────────────────────────────────");

    _userCallback(topic, buf, copyLen);
}

// Connect to Broker 1 and subscribe to sensor data
static bool mqttSubConnect() {
    char clientId[48];
    snprintf(clientId, sizeof(clientId), "gw-sub-%s", GW_DEVICE_ID);
    Serial.printf("[MQTT-SUB] Connecting to Broker1 %s:%d as '%s'...",
                  MQTT_BROKER1_HOST, MQTT_BROKER1_PORT, clientId);

    if (!mqttSubClient.connect(clientId)) {
        Serial.printf(" FAILED (rc=%d)\n", mqttSubClient.state());
        return false;
    }
    Serial.println(" OK");

    const char* subTopic = "local/sensors/+/data";
    if (mqttSubClient.subscribe(subTopic)) {
        Serial.printf("[MQTT-SUB] Subscribed to '%s'\n", subTopic);
    } else {
        Serial.printf("[MQTT-SUB] Subscribe FAILED for '%s'\n", subTopic);
    }
    return true;
}

// Connect to Broker 2 for publishing to backend
static bool mqttPubConnect() {
    char clientId[48];
    snprintf(clientId, sizeof(clientId), "gw-%s", GW_DEVICE_ID);
    Serial.printf("[MQTT-PUB] Connecting to Broker2 %s:%d as '%s'...",
                  MQTT_BROKER2_HOST, MQTT_BROKER2_PORT, clientId);

    if (!mqttPubClient.connect(clientId)) {
        Serial.printf(" FAILED (rc=%d)\n", mqttPubClient.state());
        return false;
    }
    Serial.println(" OK");
    return true;
}

void mqttClientSetup(MessageCallback cb) {
    _userCallback = cb;

    // Broker 1 – subscribe side
    mqttSubClient.setServer(MQTT_BROKER1_HOST, MQTT_BROKER1_PORT);
    mqttSubClient.setBufferSize(MQTT_BUFFER_SIZE);
    mqttSubClient.setCallback(onMqttMessage);
    Serial.printf("[MQTT-SUB] Broker1: %s:%d\n", MQTT_BROKER1_HOST, MQTT_BROKER1_PORT);

    // Broker 2 – publish side (no callback needed)
    mqttPubClient.setServer(MQTT_BROKER2_HOST, MQTT_BROKER2_PORT);
    mqttPubClient.setBufferSize(MQTT_BUFFER_SIZE);
    Serial.printf("[MQTT-PUB] Broker2: %s:%d\n", MQTT_BROKER2_HOST, MQTT_BROKER2_PORT);
}

void mqttClientMaintain() {
    if (!wifiIsConnected()) return;

    // Maintain Broker 1 (subscribe)
    if (mqttSubClient.connected()) {
        mqttSubClient.loop();
    } else {
        static unsigned long lastSubAttempt = 0;
        if (millis() - lastSubAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
            lastSubAttempt = millis();
            mqttSubConnect();
        }
    }

    // Maintain Broker 2 (publish)
    if (mqttPubClient.connected()) {
        mqttPubClient.loop();
    } else {
        static unsigned long lastPubAttempt = 0;
        if (millis() - lastPubAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
            lastPubAttempt = millis();
            mqttPubConnect();
        }
    }
}

// Returns true when the publish path (Broker 2) is ready
bool mqttClientIsConnected() {
    return mqttPubClient.connected();
}

// Publish via Broker 2 (gateway → backend)
bool mqttClientPublish(const char* topic, const char* payload, unsigned int length) {
    if (!mqttPubClient.connected()) return false;
    return mqttPubClient.publish(topic, (const uint8_t*)payload, length, false);
}
