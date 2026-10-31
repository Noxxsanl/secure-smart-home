// Che dữ liệu cá nhân khi hiển thị cho nhân viên (FR-9.6) và viết tắt tên.

/** `dat@gmail.com` → `d***@gmail.com`. */
export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${Array.from(email.slice(0, at))[0]}***${email.slice(at)}`;
}

/** `0912345678` → `09******78` (giữ 2 ký tự đầu và 2 ký tự cuối; số quá ngắn che hết). */
export function maskPhone(phone: string | null): string | null {
  if (phone === null) return null;
  const chars = Array.from(phone);
  if (chars.length <= 4) return "*".repeat(chars.length);
  return chars.slice(0, 2).join("") + "*".repeat(chars.length - 4) + chars.slice(-2).join("");
}

/** Che liên hệ khách (email/phone/address); giữ name + user_tag cho luồng gán chủ nhà. */
export function maskCustomerContact<T extends { email: string | null; phone: string | null; address: string | null }>(customer: T): T {
  return { ...customer, email: maskEmail(customer.email), phone: maskPhone(customer.phone), address: null };
}

/** "Nguyễn Hoàng Đạt" → "NĐ" (chữ cái đầu của 2 từ cuối). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length <= 2 ? words : words.slice(-2);
  return picked.map((word) => Array.from(word)[0]?.toUpperCase() ?? "").join("") || "?";
}
