#include "sensor_registry.h"
#include "config_gw.h"
#include "hmac_util.h"
#include "ntp_sync.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>

struct SensorEntry {
    char device_id[48];
    char secret_key[65];
};

static SensorEntry   _entries[SENSOR_REGISTRY_MAX];
static int           _count        = 0;
static unsigned long _lastFetchMs  = 0;
static bool          _hasFetched   = false;

bool fetchSensorList() {
    unsigned long ts = getCurrentTimestamp();
    char msg[96];
    snprintf(msg, sizeof(msg), "%s:%lu", GW_DEVICE_ID, ts);

    char hmac[65];
    if (!computeHMAC(GW_SECRET_KEY, msg, hmac)) {
        Serial.println("[REG] HMAC computation failed");
        return false;
    }

    char url[300];
    snprintf(url, sizeof(url),
             "%s?gateway_id=%s&gw_timestamp=%lu&gw_hmac=%s",
             BACKEND_SENSORS_URL, GW_DEVICE_ID, ts, hmac);

    HTTPClient http;
    http.begin(url);
    http.setTimeout(HTTP_TIMEOUT);
    int code = http.GET();

    if (code != 200) {
        Serial.printf("[REG] Fetch failed HTTP %d\n", code);
        http.end();
        _lastFetchMs = millis(); // backoff: tránh spam request liên tục lên backend khi thất bại liên tiếp
        return false;
    }

    String body = http.getString();
    http.end();

    DynamicJsonDocument doc(4096);
    if (deserializeJson(doc, body) != DeserializationError::Ok) {
        Serial.println("[REG] JSON parse error");
        return false;
    }

    JsonArray arr = doc["sensors"].as<JsonArray>();
    _count = 0;
    for (JsonObject s : arr) {
        if (_count >= SENSOR_REGISTRY_MAX) break;
        strlcpy(_entries[_count].device_id,  s["device_id"]  | "", sizeof(_entries[0].device_id));
        strlcpy(_entries[_count].secret_key, s["secret_key"] | "", sizeof(_entries[0].secret_key));
        _count++;
    }

    _lastFetchMs = millis();
    _hasFetched  = true;
    Serial.printf("[REG] Loaded %d sensor(s) from backend\n", _count);
    return true;
}

bool registryNeedsRefresh() {
    if (!_hasFetched) return true;
    return (millis() - _lastFetchMs) >= SENSOR_REGISTRY_TTL_MS;
}

const char* registryFindSecret(const char* sensor_id) {
    // Danh sách động từ backend
    for (int i = 0; i < _count; i++) {
        if (strcmp(_entries[i].device_id, sensor_id) == 0)
            return _entries[i].secret_key;
    }
    // Fallback: danh sách cứng trong config_gw.h
    for (int i = 0; i < KNOWN_SENSOR_COUNT; i++) {
        if (strcmp(KNOWN_SENSORS[i].device_id, sensor_id) == 0)
            return KNOWN_SENSORS[i].secret_key;
    }
    return nullptr;
}
