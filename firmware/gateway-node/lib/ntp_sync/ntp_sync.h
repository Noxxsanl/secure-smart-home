#pragma once

void          ntpSetup();
// Trả về Unix epoch seconds (UTC). Dùng làm trường timestamp trong HMAC.
unsigned long getCurrentTimestamp();
bool          ntpIsSynced();
