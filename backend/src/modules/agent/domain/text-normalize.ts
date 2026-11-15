// Chuẩn hoá chữ để đối chiếu `evidence_span` với câu nói (hợp đồng §2.8). Python (`agent/.../guard/text.py`) và TypeScript
// PHẢI cho kết quả giống hệt nhau: lower() → đ→d → Unicode NFD → bỏ ký tự combining (U+0300–U+036F) → mọi ký tự không
// thuộc [a-z0-9] thành dấu cách → gộp nhiều dấu cách → trim. Ví dụ: "Tắt Quạt, sau 30p nữa!" → "tat quat sau 30p nua".
// Hàm THUẦN — không DB, không log.

export function normalizeEvidenceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
// Luật "nói rõ" của từng bước nằm ở explicit-step.ts (isExplicitStep).
