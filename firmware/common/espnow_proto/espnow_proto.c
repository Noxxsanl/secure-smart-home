#include "espnow_proto.h"

#include <string.h>

size_t espnow_proto_encode(uint8_t *out, size_t cap, uint8_t type, uint16_t seq,
                           const char *body, size_t body_len)
{
    if (out == NULL || (body == NULL && body_len > 0)) {
        return 0;
    }
    size_t total = ESPNOW_PROTO_HDR_LEN + body_len;
    if (body_len > ESPNOW_PROTO_MAX_BODY || total > cap) {
        return 0;
    }
    out[0] = ESPNOW_PROTO_VERSION;
    out[1] = type;
    out[2] = (uint8_t)(seq & 0xff);
    out[3] = (uint8_t)(seq >> 8);
    if (body_len > 0) {
        memcpy(out + ESPNOW_PROTO_HDR_LEN, body, body_len);
    }
    return total;
}

bool espnow_proto_decode(const uint8_t *data, size_t len, espnow_frame_view_t *out)
{
    if (data == NULL || out == NULL || len < ESPNOW_PROTO_HDR_LEN || len > ESPNOW_PROTO_MAX_LEN) {
        return false;
    }
    if (data[0] != ESPNOW_PROTO_VERSION) {
        return false;
    }
    out->ver = data[0];
    out->type = data[1];
    out->seq = (uint16_t)(data[2] | ((uint16_t)data[3] << 8));
    out->body = data + ESPNOW_PROTO_HDR_LEN;
    out->body_len = len - ESPNOW_PROTO_HDR_LEN;
    return true;
}
