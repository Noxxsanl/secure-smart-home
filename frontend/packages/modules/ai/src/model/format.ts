import type { AiPriceSource, AiUsagePurpose, AiUsageRange, AiUsageStatus } from "@shh/api-client/dashboard";

// Định dạng số liệu AI Usage (tiền, token, thời gian) và nhãn tiếng Việt.

export const RANGE_LABELS: Record<AiUsageRange, string> = { "24h": "24 giờ", "7d": "7 ngày", "30d": "30 ngày" };

export const PURPOSE_LABELS: Record<AiUsagePurpose, string> = {
  planner: "Lập kế hoạch",
  clarify: "Hỏi lại",
  summary: "Tóm tắt",
  stt: "Nhận dạng giọng nói",
  eval: "Đánh giá",
  other: "Khác",
};

export function purposeLabel(purpose: string): string {
  return PURPOSE_LABELS[purpose as AiUsagePurpose] ?? purpose;
}

export const STATUS_LABELS: Record<AiUsageStatus, string> = {
  success: "Thành công",
  error: "Lỗi",
  timeout: "Quá thời gian",
};

export const PRICE_SOURCE_LABELS: Record<AiPriceSource, string> = {
  official: "Trang giá chính thức",
  litellm: "Đồng bộ (LiteLLM)",
  manual: "Admin nhập",
};

const NUMBER = new Intl.NumberFormat("vi-VN");

/** USD: số nhỏ (chi phí một lượt gọi) giữ nhiều chữ số có nghĩa. */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })}`;
}

export function formatVnd(usd: number | null | undefined, rate: number | null | undefined): string | null {
  if (usd === null || usd === undefined || !rate) return null;
  return `${Math.round(usd * rate).toLocaleString("vi-VN")} ₫`;
}

/** Giá USD / 1 triệu token. */
export function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}M`;
  if (value >= 10_000) return `${(value / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}K`;
  return NUMBER.format(value);
}

export function formatInt(value: number): string {
  return NUMBER.format(value);
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 10_000) return `${(value / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} s`;
  return `${NUMBER.format(Math.round(value))} ms`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

/** Nhãn trục/tooltip cho bucket "YYYY-MM-DD" hoặc "YYYY-MM-DDTHH:00" (đã là giờ Việt Nam). */
export function bucketLabel(bucket: string, full = false): string {
  const [date, time] = bucket.split("T");
  const [, month, day] = date.split("-");
  if (time) return full ? `${time} ${day}/${month}` : time;
  return `${day}/${month}`;
}
