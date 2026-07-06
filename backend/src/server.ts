import "./config/env"; // loads .env and validates required vars – must be first import
import app from "./app";
import { runMigrations } from "./config/migrate";
import { startHeartbeatMonitor } from "./services/deviceStatus";
import { startMqttTracker } from "./services/mqttTracker";
import { startMqttDataService } from "./services/mqttDataService";

const PORT = process.env.PORT || 5000;

// Thứ tự khởi động: migrations phải hoàn tất trước khi server nhận request
// để đảm bảo schema DB luôn mới nhất khi request đầu tiên đến.
// Các MQTT service khởi động bên trong callback listen để chỉ chạy sau khi
// server đã bind port thành công, tránh race condition ghi DB quá sớm.
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startHeartbeatMonitor();   // truy vấn DB mỗi 30s để cập nhật cache onlineDeviceIds
    startMqttTracker();        // theo dõi log $SYS broker để cập nhật IP thiết bị
    startMqttDataService();    // subscribe gateway/+/data trên Broker 2
  });
});
