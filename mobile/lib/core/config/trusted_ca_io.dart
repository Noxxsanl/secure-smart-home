import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// `--dart-define=API_CA_PEM_BASE64=<base64 của infra/mosquitto/certs/ca.crt>`:
/// thêm CA nội bộ vào danh sách tin cậy của mọi kết nối HTTPS/WSS của app (REST,
/// WebSocket realtime, xem camera, Trợ lý) — gọi được `https://<IP LAN>` mà
/// không phải tắt kiểm chứng chứng chỉ (bất biến 3). Không đặt → chỉ tin CA của
/// hệ điều hành (máy chủ có chứng chỉ công khai, VD Let's Encrypt).
void installTrustedCa() {
  const encoded = String.fromEnvironment('API_CA_PEM_BASE64');
  if (encoded.trim().isEmpty) return;
  try {
    SecurityContext.defaultContext.setTrustedCertificatesBytes(
      base64Decode(encoded.trim()),
    );
  } on Object catch (error) {
    debugPrint('[security] API_CA_PEM_BASE64 không phải chứng chỉ PEM hợp lệ: $error');
  }
}
