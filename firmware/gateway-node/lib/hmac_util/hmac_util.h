#pragma once
#include <stddef.h>

// Compute HMAC-SHA256(key, msg) → 64-char hex string written to out[65].
bool computeHMAC(const char* key, const char* msg, char out[65]);
