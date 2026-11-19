/*
 * WiFi Station vào Local AP của Gateway (WiFi Provisioning §5.2, phương án C2).
 * Camera không bao giờ biết WiFi thật của nhà; IP Gateway = default gateway do DHCP của Local AP cấp.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include "esp_err.h"
#include "freertos/FreeRTOS.h"

/** Khởi động STA và tự kết nối lại (lùi 1, 2, 4 … tối đa 30 giây). Cần esp_netif_init + event loop trước. */
esp_err_t cam_wifi_start(const char *ssid, const char *password);

bool cam_wifi_is_connected(void);
bool cam_wifi_wait_connected(TickType_t timeout);

/** IP của Gateway trên Local AP, dạng "192.168.4.1". */
bool cam_wifi_gateway_ip(char *buf, size_t cap);

bool cam_wifi_rssi(int *rssi);
