import { portalCodeMessage } from "@shh/api-client/portal";

/** Chi tiết một lần chạy rule (automation_history.details) → câu ngắn, không mã thô. */
export function historyDetailText(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  for (const field of ["error", "reason", "error_code", "code"]) {
    const value = details[field];
    // Engine ghi mã lý do (VD DEVICE_OFFLINE / device_offline) — dịch sang câu tiếng Việt, mã lạ thì bỏ qua.
    const text = typeof value === "string" ? portalCodeMessage(value) : null;
    if (text) return text;
  }
  const message = details.message;
  if (typeof message === "string" && message.trim() && !/^[A-Z0-9_]+$/.test(message)) return message;
  return null;
}
