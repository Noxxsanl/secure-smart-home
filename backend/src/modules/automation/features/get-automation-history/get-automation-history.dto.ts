// Response lịch sử chạy rule (CONTRACT §4.2).

export interface HistoryEntry {
  id: number;
  triggered_at: string;
  result: "success" | "failed" | "skipped";
  details: unknown;
}

export function parseDetails(value: unknown): unknown {
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value ?? null;
}
