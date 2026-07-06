#pragma once

// Validate sensor payload, sign with gateway HMAC, publish to MQTT backend topic.
// Returns true on successful MQTT publish.
bool forwardSensorData(const char* topic, const char* payload, unsigned int length);
