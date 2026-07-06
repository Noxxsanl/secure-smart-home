#pragma once

// topic: "local/sensors/ESP32-SN-XXXXXXXX/data"
// payload: null-terminated JSON string from sensor
typedef void (*MessageCallback)(const char* topic, const char* payload, unsigned int length);

void mqttClientSetup(MessageCallback cb);
void mqttClientMaintain();
bool mqttClientIsConnected();

// Publish payload to topic (QoS 1). Returns true on success.
bool mqttClientPublish(const char* topic, const char* payload, unsigned int length);
