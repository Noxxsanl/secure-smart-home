#include "wifi_manager.h"
#include "config_gw.h"
#include <Arduino.h>
#include <WiFi.h>

static bool _connected = false;

void wifiSetup() {
    pinMode(LED_WIFI_PIN, OUTPUT);
    digitalWrite(LED_WIFI_PIN, LOW);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    Serial.printf("[WiFi] Connecting to '%s'", WIFI_SSID);
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 40) {
        delay(500);
        Serial.print(".");
        retries++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        _connected = true;
        digitalWrite(LED_WIFI_PIN, HIGH);
        Serial.printf("\n[WiFi] OK – IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WiFi] FAILED – retrying in loop()");
    }
}

void wifiMaintain() {
    if (WiFi.status() == WL_CONNECTED) {
        if (!_connected) {
            _connected = true;
            digitalWrite(LED_WIFI_PIN, HIGH);
            Serial.printf("[WiFi] Reconnected – IP: %s\n", WiFi.localIP().toString().c_str());
        }
        return;
    }

    if (_connected) {
        _connected = false;
        digitalWrite(LED_WIFI_PIN, LOW);
        Serial.println("[WiFi] Disconnected");
    }

    static unsigned long lastRetry = 0;
    if (millis() - lastRetry >= WIFI_RECONNECT_INTERVAL_MS) {
        lastRetry = millis();
        Serial.println("[WiFi] Reconnecting...");
        WiFi.reconnect();
    }
}

bool wifiIsConnected() {
    return WiFi.status() == WL_CONNECTED;
}
