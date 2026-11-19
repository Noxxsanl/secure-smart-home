import type { GatewayCounts } from "./device.types";

/** Số liệu của gateway chưa có node nào — dùng khi getGatewayCounts không trả dòng cho gateway đó. */
export const EMPTY_COUNTS: GatewayCounts = { node_count: 0, paired_count: 0, device_count: 0 };
