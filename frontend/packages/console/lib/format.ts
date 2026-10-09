// Định dạng hiển thị dùng chung cho console (giờ địa phương trình duyệt, vi-VN).
// Hàm đọc đồng hồ được đặt ở cấp module (không gọi Date.now() trực tiếp trong
// thân component) để React Compiler không coi render là "impure".

export function nowMs(): number {
  return Date.now();
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatDateTimeSeconds(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${time} ${date}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "Vừa xong" / "5 phút trước" / "3 giờ trước" / "2 ngày trước". */
export function formatRelative(iso: string | null | undefined, emptyLabel = "Chưa kết nối"): string {
  if (!iso) return emptyLabel;
  const diff = Math.floor((nowMs() - new Date(iso).getTime()) / 1000);
  if (diff < 0) return "Vừa xong";
  if (diff < 60) return `${diff} giây trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

/** Thời gian còn lại tới `iso` (VD "3 giờ 12 phút"); null nếu đã qua. */
export function formatRemaining(iso: string, now: number = nowMs()): string | null {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
  if (hours > 0) return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
  return mins > 0 ? `${mins} phút` : "dưới 1 phút";
}

export function isPast(iso: string | null | undefined, now: number = nowMs()): boolean {
  return !!iso && new Date(iso).getTime() <= now;
}

export function formatSizeKb(sizeKb: number): string {
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(2)} MB`;
  return `${sizeKb} KB`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatRssi(rssi: number | null | undefined): string {
  return rssi === null || rssi === undefined ? "—" : `${rssi} dBm`;
}

/** `datetime-local` (giờ máy) → ISO UTC cho query backend; rỗng → undefined. */
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Lấy chữ cái đầu của tên để làm avatar (VD "Nguyễn Hoàng Đạt" → "NĐ"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
