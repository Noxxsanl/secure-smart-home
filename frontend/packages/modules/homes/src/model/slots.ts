import type { CustomerDevice } from "@shh/api-client/portal";

/** Props mà trang Tổng quan / Chi tiết phòng truyền cho lưới thiết bị (`DeviceGrid` của @shh/devices). */
export type DeviceGridSlotProps = { devices: CustomerDevice[]; homeSuspended: boolean; showRoom?: boolean };

/** Slot lưới thiết bị — app ghép: `renderDevices={(p) => <DeviceGrid {...p} />}`. */
export type RenderDevices = (props: DeviceGridSlotProps) => React.ReactNode;
