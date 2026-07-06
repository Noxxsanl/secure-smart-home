#include "ntp_sync.h"
#include <time.h>

static bool _synced = false;

void ntpSetup() {
    // GMT+7 (Việt Nam): offset = 7 * 3600 = 25200 giây
    configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");

    Serial.print("[NTP] Syncing");

    struct tm timeinfo;
    int retries = 0;
    while (!getLocalTime(&timeinfo) && retries < 20) {
        Serial.print(".");
        delay(500);
        retries++;
    }

    if (getLocalTime(&timeinfo)) {
        _synced = true;
        char buf[32];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
        Serial.printf("\n[NTP] OK – %s (UTC+7)\n", buf);
    } else {
        Serial.println("\n[NTP] FAILED – timestamp sẽ không chính xác!");
    }
}

unsigned long getCurrentTimestamp() {
    time_t now;
    time(&now);
    return (unsigned long)now;
}

bool ntpIsSynced() {
    return _synced;
}
