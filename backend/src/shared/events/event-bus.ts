// Event bus trong tiến trình (CONTRACT_V2 §6): kênh phát sự kiện giữa các tầng backend mà
// không phụ thuộc lẫn nhau.
//   - Nơi PHÁT:  telemetry/domain/telemetry-ingested (telemetry, device_state), control (lệnh)
//                (device_state), notifications/domain/notify.service (notification), các service đổi
//                thành viên/phòng/nhà (home_changed), device monitor, simulator.
//   - Nơi NGHE:  WebSocket hub (đẩy xuống mobile), automation engine (telemetry).
// Chỉ có 4 loại sự kiện — thêm loại mới phải sửa BusEvents để TypeScript bắt lỗi ở mọi nơi.
import { EventEmitter } from "events";
import type { DeviceStateSnapshot, Reading } from "./event-payloads";
import type { CustomerNotification } from "./event-payloads";

/** Số đo mới của thiết bị thuộc một nhà (chỉ phát khi thiết bị đã gán nhà). */
export interface TelemetryEvent {
  home_id: number;
  room_id: number | null;
  device_id: number;
  reading: Reading;
}

/** Trạng thái online/power/status của thiết bị đổi. */
export interface DeviceStateEvent {
  home_id: number;
  device: DeviceStateSnapshot;
}

/** Một thông báo khách hàng vừa được ghi (1 sự kiện cho mỗi người nhận). */
export interface NotificationEvent {
  user_id: number;
  home_id: number | null;
  notification: CustomerNotification;
}

/** Thành viên/vai trò/tên/phòng/claim của nhà đổi → client tải lại homes/overview. */
export interface HomeChangedEvent {
  home_id: number;
  /** Có thì chỉ báo cho các user này (ví dụ người vừa bị xoá khỏi nhà); không có thì báo mọi thành viên. */
  user_ids?: number[];
}

export interface BusEvents {
  telemetry: TelemetryEvent;
  device_state: DeviceStateEvent;
  notification: NotificationEvent;
  home_changed: HomeChangedEvent;
}

export type BusEventName = keyof BusEvents;
export type BusListener<K extends BusEventName> = (payload: BusEvents[K]) => void | Promise<void>;

class TypedEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // WS hub + automation engine + test hook… vượt mặc định 10 listener là bình thường
    this.emitter.setMaxListeners(100);
  }

  /**
   * Đăng ký listener; trả về hàm huỷ đăng ký. Listener được bọc try/catch (kể cả async) để
   * một listener lỗi không làm hỏng luồng ingest/command đang phát sự kiện, cũng không chặn
   * các listener còn lại.
   */
  on<K extends BusEventName>(event: K, listener: BusListener<K>): () => void {
    const wrapped = (payload: BusEvents[K]): void => {
      try {
        const result = listener(payload);
        if (result instanceof Promise) {
          result.catch((err: unknown) => reportListenerError(event, err));
        }
      } catch (err) {
        reportListenerError(event, err);
      }
    };
    this.emitter.on(event, wrapped);
    return () => {
      this.emitter.off(event, wrapped);
    };
  }

  /** Phát sự kiện, đồng bộ; không bao giờ ném lỗi (listener đã được bọc). */
  emit<K extends BusEventName>(event: K, payload: BusEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  listenerCount(event: BusEventName): number {
    return this.emitter.listenerCount(event);
  }
}

function reportListenerError(event: BusEventName, err: unknown): void {
  // Chỉ in tên sự kiện + thông điệp lỗi; không in payload (có thể chứa nội dung thông báo)
  console.error(`[eventBus] listener for "${event}" failed:`, err instanceof Error ? err.message : "unknown error");
}

export const eventBus = new TypedEventBus();
