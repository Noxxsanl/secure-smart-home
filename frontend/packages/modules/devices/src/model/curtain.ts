// Rèm cửa: 3 mức bấm nhanh. 0 = đóng hẳn, 100 = mở hết; backend nhận `set_pos` với số nguyên 0..100.
export const CURTAIN_LEVELS = [
  { position: 0, label: "Đóng" },
  { position: 50, label: "50%" },
  { position: 100, label: "100%" },
] as const;

/** Sai số cho phép khi so vị trí thật với mức bấm nhanh (rèm dừng lệch vài %). */
const LEVEL_TOLERANCE = 2;

/**
 * Mức đang đạt để tô nút. Biết vị trí: 0 → Đóng, còn lại khớp 50/100 trong ±2 (không khớp, VD 30% → null, không tô nút).
 * Chưa biết vị trí (null): suy từ bật/tắt — tắt = Đóng, bật = 100%.
 */
export function activeCurtainLevel(pos: number | null | undefined, power: boolean | null): number | null {
  if (typeof pos === "number") {
    if (pos <= 0) return 0;
    const hit = CURTAIN_LEVELS.find((l) => l.position > 0 && Math.abs(l.position - pos) <= LEVEL_TOLERANCE);
    return hit ? hit.position : null;
  }
  if (power === null) return null;
  return power ? 100 : 0;
}

/** Chữ trạng thái: "Đang đóng" / "Đang mở 50%" (chưa biết vị trí mà đang bật → "Đang mở"; chưa biết gì → "Chưa rõ vị trí"). */
export function curtainStatusText(pos: number | null | undefined, power: boolean | null): string {
  if (typeof pos === "number") return pos <= 0 ? "Đang đóng" : `Đang mở ${Math.round(pos)}%`;
  if (power === null) return "Chưa rõ vị trí";
  return power ? "Đang mở" : "Đang đóng";
}
