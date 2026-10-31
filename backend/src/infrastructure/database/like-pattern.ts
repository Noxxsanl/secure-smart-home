/**
 * Chuỗi tìm kiếm → mẫu LIKE `%…%` đã escape `\`, `%`, `_` (dùng với tham số `?`). Mọi câu ILIKE dùng mẫu này
 * dựa vào ký tự escape mặc định `\` của LIKE/ILIKE trong PostgreSQL nên không cần ESCAPE. ILIKE vì PostgreSQL
 * phân biệt hoa/thường (MySQL utf8mb4_unicode_ci thì không) còn người dùng gõ tìm kiếm không phân biệt.
 * Bọc cả hai vế bằng `unaccent(col) ILIKE unaccent(?)` (extension unaccent, xem 001_schema.sql) để giữ tính
 * bỏ qua dấu tiếng Việt của collation cũ; `unaccent` không đụng tới `\ % _` nên escape vẫn nguyên.
 */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}
