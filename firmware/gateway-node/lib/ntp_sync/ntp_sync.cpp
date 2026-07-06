#include "ntp_sync.h"
#include <Arduino.h>
#include <time.h>

static bool _synced = false;

void ntpSetup() {
    // UTC+7 (Asia/Ho_Chi_Minh). Backend xác minh timestamp HMAC theo UTC Unix seconds
    // (Date.now() / 1000), nên giá trị epoch tuyệt đối phải khớp.
    // Offset này chỉ để hiển thị trên Serial log; getCurrentTimestamp() trả về
    // time_t luôn là UTC epoch bất kể múi giờ cục bộ.
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
        Serial.println("\n[NTP] FAILED – timestamps will be inaccurate");
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
