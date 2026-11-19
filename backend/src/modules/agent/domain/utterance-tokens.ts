// Token hoá CÂU GỐC có căn chỉnh cho luật "rõ lệnh" (explicit-step.ts). Hàm THUẦN — không DB, không log.
//
// Vì sao không chỉ dùng normalizeEvidenceText: luật cần phân biệt "đừng" (phủ định) với "dung" (không dấu, mơ hồ), "khí" với
// "khi" (điều kiện), "tối" với "tôi", và cần biết ranh giới đoạn (dấu , ; . ! ? …) + câu hỏi (kết thúc bằng ?). Nên mỗi token có:
//   norm[i]  đúng như normalizeEvidenceText (a-z0-9)            raw[i]  cùng token đó nhưng giữ dấu (lowercase + NFC)
//   seg[i]   số thứ tự đoạn                                      segQuestion[s]  đoạn s kết thúc bằng "?"
// Bảo đảm `norm.join(" ") === normalizeEvidenceText(text)` (script kiểm tự assert với mọi câu trong bảng).
//
// Quy tắc so từ khoá (bảo thủ: thà hỏi xác nhận còn hơn chạy nhầm): token CÓ dấu so với bản có dấu; token KHÔNG dấu (người gõ
// không dấu) so với bản không dấu — xem keyAt.

export interface UtteranceTokens {
  norm: string[];
  raw: string[];
  seg: number[];
  segQuestion: boolean[];
}

const COMBINING = /^[̀-ͯ]+$/;
const SEGMENT_BREAKS: ReadonlySet<string> = new Set([",", ";", ".", "!", "?", "？", "؟", "…", "\n", "\r"]);
const QUESTION_MARKS: ReadonlySet<string> = new Set(["?", "？", "؟"]);
const DIGIT = /[0-9]/;

export function tokenizeUtterance(text: string): UtteranceTokens {
  const norm: string[] = [];
  const raw: string[] = [];
  const seg: number[] = [];
  const questions = new Set<number>();
  let curNorm = "";
  let curRaw = "";
  let curSeg = 0;
  let segHasToken = false;

  const flush = (): void => {
    if (curNorm !== "") {
      norm.push(curNorm);
      raw.push(curRaw.normalize("NFC"));
      seg.push(curSeg);
      segHasToken = true;
    }
    curNorm = "";
    curRaw = "";
  };

  const chars = Array.from(text);
  for (let index = 0; index < chars.length; index++) {
    const ch = chars[index];
    const lower = ch.toLowerCase();
    // Dấu rời (câu gõ ở dạng NFD): gộp vào token hiện tại, không ngắt từ — đúng như normalizeEvidenceText bỏ combining TRƯỚC khi tách từ
    if (COMBINING.test(lower)) {
      if (curNorm !== "") curRaw += lower;
      continue;
    }
    const mapped = lower.replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/^[a-z0-9]+$/.test(mapped)) {
      curNorm += mapped;
      curRaw += lower;
      continue;
    }
    flush();
    // "7.30", "7,30" (giờ viết kiểu số thập phân): dấu nằm GIỮA hai chữ số chỉ tách từ, không ngắt đoạn → cặp "HH MM"
    if ((ch === "." || ch === ",") && DIGIT.test(chars[index - 1] ?? "") && DIGIT.test(chars[index + 1] ?? "")) continue;
    if (SEGMENT_BREAKS.has(ch)) {
      if (QUESTION_MARKS.has(ch)) {
        if (segHasToken) questions.add(curSeg);
        else if (curSeg > 0) questions.add(curSeg - 1); // "đèn!?" — dấu ? đứng sau một dấu ngắt khác
      }
      if (segHasToken) {
        curSeg += 1;
        segHasToken = false;
      }
    }
  }
  flush();

  return { norm, raw, seg, segQuestion: Array.from({ length: curSeg + 1 }, (_, s) => questions.has(s)) };
}

/** Token có chữ ngoài a-z0-9 (có dấu hoặc đ). */
export function isAccented(raw: string): boolean {
  return /[^a-z0-9]/.test(raw);
}

/** Khoá so từ khoá: token có dấu → bản có dấu; token không dấu → bản không dấu. */
export function keyAt(tokens: UtteranceTokens, i: number): string {
  return isAccented(tokens.raw[i]) ? tokens.raw[i] : tokens.norm[i];
}

/** Tập từ khoá (chuẩn hoá NFC để so được với raw). Bản có dấu và không dấu cùng nằm trong một tập. */
export function keywordSet(words: readonly string[]): ReadonlySet<string> {
  return new Set(words.map((word) => word.normalize("NFC")));
}

/** Danh sách cụm từ ("mỗi khi") → mảng từ, chuẩn hoá NFC. */
export function phraseList(phrases: readonly string[]): readonly (readonly string[])[] {
  return phrases.map((phrase) => phrase.normalize("NFC").split(" "));
}

/** Có cụm nào trong `phrases` xuất hiện (theo ranh giới từ, khoá keyAt) trong [from, to) không. */
export function containsPhrase(tokens: UtteranceTokens, from: number, to: number, phrases: readonly (readonly string[])[]): boolean {
  for (let start = from; start < to; start++) {
    for (const phrase of phrases) {
      if (start + phrase.length > to) continue;
      if (phrase.every((word, k) => keyAt(tokens, start + k) === word)) return true;
    }
  }
  return false;
}

/** [đầu, cuối) của đoạn chứa token `pos`. */
export function segmentBounds(tokens: UtteranceTokens, pos: number): [number, number] {
  const s = tokens.seg[pos];
  let start = pos;
  while (start > 0 && tokens.seg[start - 1] === s) start--;
  let end = pos + 1;
  while (end < tokens.seg.length && tokens.seg[end] === s) end++;
  return [start, end];
}
