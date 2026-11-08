/*
 * gw_wifi — WiFi của Gateway ở chế độ AP+STA (IOT_NODE_NETWORK §2, §3.2, WiFi Provisioning §5.2):
 *
 *   STA      nối router của nhà (WPA2 trở lên) để lên Server; tự nối lại, lùi 1 → 30 giây.
 *   Local AP WPA2 cho Camera (mạng 192.168.4.0/24, Gateway = 192.168.4.1). Camera không biết WiFi thật của nhà.
 *
 * Một radio dùng chung nên STA, Local AP và ESP-NOW chạy cùng kênh: kênh router khi đã nối, ngược lại
 * CONFIG_GW_LOCAL_AP_CHANNEL. Lúc STA đang dò router, radio quét kênh nên gói ESP-NOW có thể rớt tạm thời.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "esp_netif_ip_addr.h"
#include "gw_config.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Gọi từ task event loop mặc định. */
typedef void (*gw_wifi_state_cb_t)(bool sta_connected, void *ctx);

/** Cần esp_netif_init + esp_event_loop_create_default trước. Không giữ con trỏ cfg. */
esp_err_t gw_wifi_start(const gw_config_t *cfg, gw_wifi_state_cb_t on_state, void *ctx);

bool gw_wifi_sta_connected(void);

/** IP của Gateway trên mạng router, dạng "192.168.1.23"; false nếu chưa có. */
bool gw_wifi_sta_ip(char *buf, size_t cap);

/** IP của Gateway trên Local AP (thường 192.168.4.1). */
bool gw_wifi_ap_ip(esp_ip4_addr_t *out);

/**
 * IP mà DHCP của Local AP đã cấp cho thiết bị có MAC này (Camera, MAC Station trong gw_registry).
 * false nếu thiết bị chưa vào Local AP hoặc chưa nhận IP.
 */
bool gw_wifi_ap_client_ip(const uint8_t mac[6], esp_ip4_addr_t *out);

bool gw_wifi_rssi(int *rssi);
uint8_t gw_wifi_channel(void);

/** MAC Station — Node/Camera ghi MAC này vào pairing/gateway_mac. */
void gw_wifi_sta_mac(uint8_t mac[6]);

#ifdef __cplusplus
}
#endif
