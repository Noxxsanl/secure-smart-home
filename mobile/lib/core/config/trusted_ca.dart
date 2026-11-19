// Tin CA nội bộ của hệ thống khi gọi `https://<IP>` (nginx dùng chứng chỉ do
// CA này ký — infra/pki/gen_mqtt_certs.sh). Bản web dùng kho chứng chỉ của
// trình duyệt nên không cần.
export 'trusted_ca_stub.dart' if (dart.library.io) 'trusted_ca_io.dart';
