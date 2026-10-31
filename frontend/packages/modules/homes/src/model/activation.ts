// ---------------------------------------------------------------------------
// Activation Code (FR-3.2, CONTRACT §4.2 /claim): 12 ký tự Crockford base32 in
// trên tem hộp Gateway, hiển thị dạng XXXX-XXXX-XXXX. Chuẩn hoá phía client
// giống backend để người dùng thấy ngay mã "đã sạch": chữ hoa, O→0, I/L→1, bỏ
// mọi ký tự không phải [0-9A-Z], tự chèn dấu gạch. Backend vẫn chuẩn hoá lại.
// ---------------------------------------------------------------------------

export const ACTIVATION_CODE_LENGTH = 12;

// Bảng chữ Crockford: không có I, L, O, U (dễ nhầm với 1, 0, V).
const CROCKFORD = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]+$/;

/** Gõ/dán tới đâu chuẩn hoá tới đó; kết quả tối đa 12 ký tự, chia nhóm 4. */
export function normalizeActivationCode(input: string): string {
  const compact = input
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, ACTIVATION_CODE_LENGTH);
  return compact.match(/.{1,4}/g)?.join("-") ?? "";
}

/** Đủ 12 ký tự và đều thuộc bảng Crockford (chữ U không hợp lệ). */
export function isValidActivationCode(code: string): boolean {
  const compact = code.replace(/-/g, "");
  return compact.length === ACTIVATION_CODE_LENGTH && CROCKFORD.test(compact);
}

/** Đã gõ đủ 12 ký tự (chưa xét ký tự hợp lệ) — dùng để bật nút Kích hoạt. */
export function isCompleteActivationCode(code: string): boolean {
  return code.replace(/-/g, "").length === ACTIVATION_CODE_LENGTH;
}
