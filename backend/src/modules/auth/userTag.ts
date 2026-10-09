// user_tag của khách hàng (CONTRACT_V2 §1.2): "<slug>#<4 số>", ví dụ "dat#4821".
// slug = từ CUỐI của họ tên, bỏ dấu tiếng Việt, chữ thường, ≤ 16 ký tự. Operator dùng tag này để gán
// chủ nhà (FR-3.5) nên phải gõ được bằng bàn phím thường. Tính duy nhất do UNIQUE KEY bảo đảm —
// hàm ở đây chỉ sinh ứng viên, nơi gọi retry khi trùng.
import crypto from "crypto";

const MAX_SLUG_LENGTH = 16;

/** "Nguyễn Hoàng Đạt" → "dat". Họ tên không còn ký tự a-z0-9 nào → "user". */
export function slugFromFullName(fullName: string): string {
  const folded = fullName
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // bỏ dấu thanh/dấu mũ
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
  const lastWord = folded.trim().split(/\s+/).pop() ?? "";
  const slug = lastWord.replace(/[^a-z0-9]/g, "").slice(0, MAX_SLUG_LENGTH);
  return slug || "user";
}

/** Ứng viên user_tag với `digits` chữ số ngẫu nhiên (CSPRNG), chữ số đầu khác 0. */
export function buildUserTag(fullName: string, digits = 4): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return `${slugFromFullName(fullName)}#${crypto.randomInt(min, max)}`;
}
