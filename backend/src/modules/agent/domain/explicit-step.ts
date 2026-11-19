// "Người dùng đã NÓI RÕ bước này chưa?" — cửa quyết định Trợ lý được LÀM NGAY / TỰ HẸN GIỜ hay phải chờ xác nhận (bất biến 8).
// Hàm THUẦN (không DB, không log), dùng normalizeEvidenceText §2.8 (giống hệt bản Python) + token hoá có căn chỉnh
// (utterance-tokens.ts) + số/giờ đọc bằng chữ (spoken-numbers.ts).
//
// Vì sao phải kiểm kỹ thay vì tin LLM: LLM (hoặc tên thiết bị bị tiêm lệnh) có thể bịa bước "tắt quạt" rồi gắn evidence của MỘT
// BƯỚC KHÁC có thật trong câu, đảo hướng ("tắt đèn và bật quạt" → bước "tắt quạt"), bỏ qua phủ định/điều kiện/câu hỏi/quá khứ
// ("đừng tắt đèn", "nếu trời tối thì bật đèn", "đèn đã bật chưa", "hôm qua tôi đã tắt quạt"), chọn bừa một trong hai đèn, hoặc đặt
// giờ lệch với giờ người dùng nói. Backend là bên duy nhất quyết định nên mọi điều kiện kiểm từ CÂU GỐC:
//   R1 điều kiện (cả câu): nếu/khi/hễ/mỗi khi/lúc nào/khi nào/trong trường hợp/giả sử/giả như/miễn là
//   R2 câu hỏi / kể lại (đoạn chứa động từ của bước): dấu ?/？, đuôi "không/chưa/nhỉ/sao/chăng/hả/hở/chứ/rồi", "có nên",
//      "được không", "có … không", "cách/hướng dẫn", đoạn bắt đầu bằng "ai"
//   R3 phủ định/quá khứ/ý định (3 token trước động từ, KHÔNG vượt dấu câu): đừng/không/chưa/khỏi/chẳng/chớ/tránh/huỷ/đâu/khoan/
//      bỏ/đã/vừa/dừng/ngừng/ngưng/đứng/thôi/sẽ/định/quên, gõ tắt ko/hok/hong/hem và "k" ngay trước động từ;
//      set_temp: "đang/hiện (tại)" trước số = kể trạng thái
//   R4 bước "chạy ngay" mà phạm vi động từ có biểu thức giờ hoặc dấu hiệu hoãn (tối nay, ngày mai, lát nữa, tuần, giây…) và
//      không có "ngay/luôn/bây giờ/liền/lập tức" hợp lệ ("ngày" có dấu và "ngay lúc/sau/mai…/số" không tính) → hỏi lại
//   R4' dấu hiệu LẶP (mỗi, hằng, hàng ngày/tuần/tối/sáng): bước chạy ngay lẫn bước có giờ đều hỏi lại (chỉ có hẹn giờ một lần)
//   R5 bước có giờ: evidence phải có biểu thức giờ và GIÁ TRỊ khớp (buổi sáng/trưa/chiều/tối/đêm quy đổi; "8h" trần và
//      "8 giờ kém 15" là mơ hồ); bước "sau N phút" chỉ nhận đơn vị giờ khi là "tiếng" hoặc có "sau/trong … / … nữa" (không nhận "lúc 2 giờ")
//   Phạm vi của động từ gồm cả các đoạn liền trước không có động từ ("Lúc 8 giờ tối, bật đèn", "Ở phòng ngủ, bật đèn").
//   C1 evidence là cụm từ nguyên vẹn của câu · C2 nhắc đúng LOẠI TẢI · C3 động từ/giá trị đúng hướng của bước (giá trị nói rõ
//      thì không cần động từ: "điều hoà 25 độ", "rèm về 50%" — vị trí rèm là ĐÍCH, động từ nếu có không được ngược đích) ·
//   C5 chỉ định ĐÚNG MỘT thiết bị cùng loại, chấm điểm theo "vùng đối tượng" của động từ (không lẫn phòng của mệnh đề khác).
// Giới hạn còn lại (ghi ở SECURITY_ARCHITECTURE): STT nghe sai mà vẫn thành một lệnh rõ thì vẫn chạy; "tắt cả đèn lẫn quạt" bị
// "tắt cả" ≈ "tất cả" làm mất động từ nên chỉ hỏi lại; người gõ không dấu bị xét bảo thủ ("toi" trong "8h toi" tính là buổi tối,
// "chớ"/"bỏ" không dấu không được nhận vì trùng "cho"/"bo"; "mốt"/"thứ"/"mỗi"/"hàng" không dấu không nhận vì trùng "một"/"thử"…);
// chấm điểm phòng theo độ dài ký tự nên "đèn trần phòng khách và đèn bàn" chọn nhầm đèn trần; "ngay 30 phút nữa" (số rời) coi là
// "ngày 30" nên hỏi lại — luôn nghiêng về hỏi xác nhận.
import type { Appliance } from "../../devices";
import { durationOf, isNumeralToken, parseTimeExprs, plainNumbers } from "./spoken-numbers";
import type { TimeExpr } from "./spoken-numbers";
import { normalizeEvidenceText } from "./text-normalize";
import { containsPhrase, keyAt, keywordSet, phraseList, segmentBounds, tokenizeUtterance } from "./utterance-tokens";
import type { UtteranceTokens } from "./utterance-tokens";

/** Độ dài tối thiểu (sau chuẩn hoá) của evidence để coi là "nói rõ". */
export const MIN_EVIDENCE_LENGTH = 3;

export interface ExplicitStepDevice {
  id: number;
  appliance: Appliance;
  name: string;
  roomName: string | null;
}

/** Thời điểm của bước: chạy ngay, đúng giờ (giờ địa phương) hoặc sau N phút. */
export type ExplicitStepWhen = { kind: "now" } | { kind: "at"; hour: number; minute: number } | { kind: "after"; minutes: number };

export interface ExplicitStepInput {
  evidenceSpan: string;
  /** Chỉ dùng trong bộ nhớ, không log. */
  utterance: string;
  /** Thiết bị của bước. */
  device: ExplicitStepDevice;
  action: "turn_on" | "turn_off" | "set_temp" | "set_pos";
  temperature: number | null;
  position: number | null;
  when: ExplicitStepWhen;
  /** Thiết bị CÙNG loại tải mà người dùng XEM được trong nhà (gồm cả `device`). */
  sameApplianceDevices: readonly ExplicitStepDevice[];
}

/** Từ chỉ loại tải (đã chuẩn hoá, không dấu) — evidence PHẢI chứa từ của đúng loại tải của bước. */
const APPLIANCE_WORDS: Record<Appliance, readonly string[]> = {
  lamp: ["den"],
  fan: ["quat"],
  curtain: ["rem"],
  ac: ["dieu hoa", "may lanh"],
};

// Động từ. KHÔNG nhận "dung": "dừng" và "đừng" cùng thành `dung`.
const VERBS_ON: ReadonlySet<string> = new Set(["bat", "mo"]);
const VERBS_OFF: ReadonlySet<string> = new Set(["tat"]);
const VERBS_CLOSE: ReadonlySet<string> = new Set(["dong"]);

// R1: điều kiện. Không có "hế" không dấu (trùng "hè/hé"); "khí" (có dấu) ≠ "khi" nhờ quy tắc khoá có dấu/không dấu.
const CONDITION_PHRASES = phraseList([
  "nếu", "khi", "hễ", "mỗi khi", "lúc nào", "khi nào", "trong trường hợp", "giả sử", "giả như", "miễn là",
  "neu", "moi khi", "luc nao", "khi nao", "trong truong hop", "gia su", "gia nhu", "mien la",
]);

// R2: câu hỏi
// Trợ từ cuối câu (bỏ đi rồi mới xét đuôi hỏi). "hả/hở/chứ" KHÔNG nằm đây vì chính chúng là đuôi hỏi.
const QUESTION_PARTICLES = keywordSet(["vậy", "vay", "ạ", "a", "nhé", "nhe", "nha", "đi", "di", "nè", "ne", "hen", "nhen", "nghen"]);
// Đuôi hỏi / "đã xong rồi" ("tôi bật đèn rồi" là kể lại, không phải ra lệnh)
const QUESTION_TAILS = keywordSet([
  "không", "khong", "chưa", "chua", "nhỉ", "nhi", "sao", "chăng", "chang", "rồi", "roi", "hả", "ha", "hở", "ho", "chứ", "chu",
]);
const QUESTION_PHRASES = phraseList([
  "có nên", "có phải", "làm sao", "tại sao", "thế nào", "như thế nào", "là gì", "bao giờ", "mấy giờ", "bao nhiêu", "được không",
  "cách", "bằng cách nào", "hướng dẫn",
  "co nen", "co phai", "lam sao", "tai sao", "the nao", "nhu the nao", "la gi", "bao gio", "may gio", "bao nhieu", "duoc khong",
  "cach", "bang cach nao", "huong dan",
]);
// Đoạn bắt đầu bằng "ai" (không dấu, đúng "ai") là câu hỏi ("ai bật đèn")
const QUESTION_STARTERS = keywordSet(["ai"]);
const HAVE_WORDS = keywordSet(["có", "co"]);
const NOT_WORDS = keywordSet(["không", "khong"]);

// R3: phủ định / quá khứ (cố ý KHÔNG có "cho", "bo" không dấu — trùng "cho mình", "toàn bộ"; "dạ" có dấu ≠ "đã")
// Thêm: dừng/ngừng/ngưng/đứng/thôi (thôi làm), sẽ/định/quên (ý định, chưa ra lệnh); gõ tắt ko/hok/hong/hem; "k" chỉ khi ngay trước động từ.
const NEGATION_WORDS = keywordSet([
  "đừng", "không", "chưa", "khỏi", "chẳng", "chớ", "tránh", "huỷ", "hủy", "đâu", "khoan", "bỏ", "đã", "vừa",
  "dừng", "ngừng", "ngưng", "đứng", "thôi", "sẽ", "định", "quên",
  "dung", "khong", "chua", "khoi", "chang", "tranh", "huy", "dau", "da", "vua",
  "ko", "hok", "hong", "hem",
]);
const NEGATION_WINDOW = 3;

// set_temp: "điều hoà đang 25 độ" là kể trạng thái hiện tại, không phải ra lệnh đặt
const STATE_WORDS = keywordSet(["đang", "hiện", "dang", "hien"]);

// Buổi trong ngày (R5): token có dấu so bản có dấu, không dấu so bản không dấu
type Period = "sang" | "trua" | "chieu" | "toi" | "dem";
const PERIOD_WORDS: readonly (readonly [string, Period])[] = [
  ["sáng", "sang"], ["trưa", "trua"], ["chiều", "chieu"], ["tối", "toi"], ["đêm", "dem"],
  ["sang", "sang"], ["trua", "trua"], ["chieu", "chieu"], ["toi", "toi"], ["dem", "dem"],
];
const PERIODS: ReadonlyMap<string, Period> = new Map(PERIOD_WORDS.map(([word, period]): [string, Period] => [word.normalize("NFC"), period]));

// R4: dấu hiệu "làm ngay". "ngày" CÓ DẤU không bao giờ là dấu hiệu; "ngay" không phải dấu hiệu khi theo sau là một mốc thời gian
// ("ngay lúc 8h", "ngay sau 30 phút", "ngay mai") hoặc một con số.
const NOT_IMMEDIATE_AFTER_NGAY: ReadonlySet<string> = new Set(["mai", "kia", "mot", "hom", "luc", "sau", "truoc", "khi", "vao", "trong", "tu"]);
// R4: dấu hiệu hoãn ("tối nay", "lát nữa", "tuần sau"…) — bước chạy ngay mà câu có những từ này là lệch ý
const PERIOD_NORMS: ReadonlySet<string> = new Set(["sang", "trua", "chieu", "toi", "dem"]);
const DEFERRAL_PHRASES: readonly (readonly string[])[] = [
  ["hom", "nay"], ["hom", "sau"], ["lat", "nua"], ["lat", "sau"], ["chut", "nua"], ["ti", "nua"], ["xiu", "nua"],
  ["mot", "luc", "nua"], ["chu", "nhat"], ["cuoi", "tuan"],
];
const DEFERRAL_WORDS: ReadonlySet<string> = new Set(["mai", "kia", "tuan", "khuya", "giay"]);
// "mốt" và "thứ" chỉ nhận khi CÓ DẤU (không dấu trùng "một"/"thử")
const DEFERRAL_ACCENTED: ReadonlySet<string> = new Set(["mốt", "thứ"].map((word) => word.normalize("NFC")));
// Dấu hiệu LẶP LẠI: hệ thống chỉ có hẹn giờ một lần nên để người dùng thấy và xác nhận
const REPEAT_ACCENTED: ReadonlySet<string> = new Set(["mỗi", "hằng"].map((word) => word.normalize("NFC")));
const REPEAT_HANG = "hàng".normalize("NFC");
const REPEAT_HANG_NEXT: ReadonlySet<string> = new Set(["ngay", "tuan", "toi", "sang"]);

// Rèm "một nửa": KHÔNG dùng `nua` đơn lẻ ("nữa" và "nửa" cùng thành `nua`); số 50 xét riêng (không phải "50 phút")
const HALF_PHRASES: readonly (readonly string[])[] = [["mot", "nua"], ["nua", "chung"], ["nua", "rem"]];
// Lượng từ "tất cả" ("tat ca" xét riêng vì cũng phải loại chữ `tat` khỏi động từ); "het" có luật vị trí riêng (xem hasQuantifier)
const QUANTIFIERS: readonly (readonly string[])[] = [["tat", "ca"], ["toan", "bo"], ["ca", "nha"]];
const TRAILING_PARTICLES: ReadonlySet<string> = new Set(["di", "nhe", "nha", "luon", "nhen", "a", "ne"]);

// Từ chung đứng ĐẦU tên phòng, bỏ đi để lấy "lõi" so khớp ("Phòng khách" → "khach"). Thứ tự: cụm dài trước.
const ROOM_PREFIXES: readonly (readonly string[])[] = [["khu", "vuc"], ["phong"], ["khu"], ["nha"]];

/** `needle` xuất hiện trong `haystack` theo ranh giới TỪ (cả hai đã chuẩn hoá: các từ cách nhau đúng một dấu cách). */
function containsWords(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

/** Vị trí token đầu của lần xuất hiện ĐẦU TIÊN của dãy `needle` trong `tokens` (từ `from`); -1 nếu không có. */
function indexOfSequence(tokens: readonly string[], needle: readonly string[], from = 0): number {
  for (let start = from; start + needle.length <= tokens.length; start++) {
    if (needle.every((word, k) => tokens[start + k] === word)) return start;
  }
  return -1;
}

/** Token `k` có phải động từ (bật/mở/tắt/đóng) không. "tat ca" (tất cả) là lượng từ chứ không phải động từ tắt. */
function isVerbAt(norm: readonly string[], k: number): boolean {
  const word = norm[k];
  if (word === "tat" && norm[k + 1] === "ca") return false;
  return VERBS_ON.has(word) || VERBS_OFF.has(word) || VERBS_CLOSE.has(word);
}

// ── Ngữ cảnh một lần đánh giá ────────────────────────────────────────────────────────────────────────────────────────────

interface Ctx {
  utt: UtteranceTokens;
  /** [đầu, cuối) của evidence trong câu. */
  evLo: number;
  evHi: number;
  /** Mọi biểu thức thời gian của câu (quét theo từng đoạn). */
  exprs: TimeExpr[];
  /** Token nằm trong một biểu thức thời gian (không phải "số trần"). */
  covered: Set<number>;
}

function buildCtx(utt: UtteranceTokens, evLo: number, evHi: number): Ctx {
  const exprs: TimeExpr[] = [];
  for (let start = 0; start < utt.norm.length; ) {
    const [, end] = segmentBounds(utt, start);
    exprs.push(...parseTimeExprs(utt.norm, start, end));
    start = end;
  }
  const covered = new Set<number>();
  for (const expr of exprs) for (let p = expr.start; p < expr.end; p++) covered.add(p);
  return { utt, evLo, evHi, exprs, covered };
}

/** Các lần xuất hiện của từ loại tải trong evidence: [vị trí token đầu trong câu, số token]. */
function applianceOccurrences(norm: readonly string[], appliance: Appliance, lo: number, hi: number): [number, number][] {
  const found: [number, number][] = [];
  for (const phrase of APPLIANCE_WORDS[appliance]) {
    const words = phrase.split(" ");
    for (let at = indexOfSequence(norm, words, lo); at !== -1 && at + words.length <= hi; at = indexOfSequence(norm, words, at + 1)) {
      found.push([at, words.length]);
    }
  }
  return found.sort((a, b) => a[0] - b[0]);
}

/**
 * Động từ chi phối của một lần xuất hiện từ loại tải (trong evidence [lo, hi)): động từ gần nhất ĐỨNG TRƯỚC; không có thì động
 * từ gần nhất ĐỨNG SAU. Trả vị trí token trong câu, hoặc -1.
 */
function dominantVerb(norm: readonly string[], start: number, length: number, lo: number, hi: number): number {
  for (let k = start - 1; k >= lo; k--) if (isVerbAt(norm, k)) return k;
  for (let k = start + length; k < hi; k++) if (isVerbAt(norm, k)) return k;
  return -1;
}

/**
 * Đầu đoạn, lùi thêm qua các đoạn LIỀN TRƯỚC không có động từ: STT hay chèn dấu phẩy sau trạng ngữ ("Lúc 8 giờ tối, bật đèn",
 * "Ở phòng ngủ, bật đèn", "Sau 30 phút nữa, tắt quạt") nên các đoạn đó thuộc về động từ đầu tiên của đoạn có động từ.
 */
function extendedSegmentStart(utt: UtteranceTokens, segStart: number): number {
  let start = segStart;
  while (start > 0) {
    const [prevStart, prevEnd] = segmentBounds(utt, start - 1);
    let hasVerb = false;
    for (let k = prevStart; k < prevEnd; k++) if (isVerbAt(utt.norm, k)) hasVerb = true;
    if (hasVerb) break;
    start = prevStart;
  }
  return start;
}

/**
 * "Vùng đối tượng" của lần nhắc từ loại tải tại `occ` với động từ chi phối `verb`: từ đầu đoạn (nếu `verb` là động từ ĐẦU TIÊN
 * của đoạn) hoặc từ min(verb, occ), đến trước động từ đầu tiên SAU `occ` trong cả câu (hoặc hết câu). Không cắt theo dấu phẩy:
 * "tắt đèn, quạt phòng khách" vẫn lấy được "phòng khách" cho quạt.
 */
function objectRegion(utt: UtteranceTokens, verb: number, occ: number): [number, number] {
  const [segStart, segEnd] = segmentBounds(utt, verb);
  let firstVerb = -1;
  for (let k = segStart; k < segEnd; k++) {
    if (isVerbAt(utt.norm, k)) {
      firstVerb = k;
      break;
    }
  }
  const start = verb === firstVerb ? extendedSegmentStart(utt, segStart) : Math.min(verb, occ);
  let end = utt.norm.length;
  for (let k = occ + 1; k < utt.norm.length; k++) {
    if (isVerbAt(utt.norm, k)) {
      end = k;
      break;
    }
  }
  return [start, Math.max(start, end)];
}

/** "Phạm vi thời gian" của một mỏ neo: các đoạn token [từ, đến) (kèm trạng ngữ đứng trước động từ đầu tiên của đoạn). */
interface Scope {
  ranges: [number, number][];
}

function scopeOf(utt: UtteranceTokens, anchor: number, anchorIsVerb: boolean): Scope {
  const [ownStart, segEnd] = segmentBounds(utt, anchor);
  const verbs: number[] = [];
  for (let k = ownStart; k < segEnd; k++) if (isVerbAt(utt.norm, k)) verbs.push(k);
  // Các đoạn liền trước không có động từ (trạng ngữ tách bằng dấu phẩy) thuộc về động từ đầu tiên của đoạn này
  const segStart = extendedSegmentStart(utt, ownStart);

  let from = segStart;
  let to = segEnd;
  if (anchorIsVerb) {
    const k = verbs.indexOf(anchor);
    from = k <= 0 ? segStart : verbs[k - 1] + 1;
    to = k === verbs.length - 1 ? segEnd : verbs[k + 1];
  } else {
    const before = verbs.filter((v) => v < anchor);
    const after = verbs.filter((v) => v > anchor);
    from = before.length === 0 ? segStart : before[before.length - 1] + 1;
    to = after.length === 0 ? segEnd : after[0];
  }
  const ranges: [number, number][] = [[from, to]];
  // Trạng ngữ đầu câu ("8h tối tắt quạt và tắt đèn") áp cho mọi động từ trong đoạn
  if (verbs.length > 0 && verbs[0] > segStart) ranges.push([segStart, verbs[0]]);
  return { ranges };
}

function inScope(scope: Scope, pos: number, lo = 0, hi = Number.MAX_SAFE_INTEGER): boolean {
  return pos >= lo && pos < hi && scope.ranges.some(([from, to]) => pos >= from && pos < to);
}

function exprsIn(ctx: Ctx, scope: Scope, clipToEvidence: boolean): TimeExpr[] {
  const lo = clipToEvidence ? ctx.evLo : 0;
  const hi = clipToEvidence ? ctx.evHi : Number.MAX_SAFE_INTEGER;
  return ctx.exprs.filter((expr) => {
    for (let p = expr.start; p < expr.end; p++) if (!inScope(scope, p, lo, hi)) return false;
    return true;
  });
}

// ── C3: hướng lệnh / giá trị ─────────────────────────────────────────────────────────────────────────────────────────────

interface Hit {
  /** Mỏ neo cho R2/R3 và phạm vi thời gian: động từ chi phối, hoặc token số (set_temp không có động từ). */
  anchor: number;
  anchorIsVerb: boolean;
  /** Vị trí lần nhắc từ loại tải (set_temp không có động từ: xét phủ định cả trước từ loại tải) và số token của nó. */
  occ: number;
  occLength: number;
  /** Vùng đối tượng cho C5. */
  region: [number, number];
  /** set_temp: vị trí token số nhiệt độ (để loại câu kể trạng thái "đang 25 độ"); -1 với bước khác. */
  numberPos?: number;
}

function hasHalfSign(ctx: Ctx, region: [number, number]): boolean {
  const slice = ctx.utt.norm.slice(region[0], region[1]);
  if (HALF_PHRASES.some((phrase) => indexOfSequence(slice, phrase) !== -1)) return true;
  // spoken = true: "năm mươi phần trăm" (STT hay viết chữ) cũng là 50; "năm phút" đã bị loại vì là biểu thức giờ
  return plainNumbers(ctx.utt.norm, region[0], region[1], ctx.covered, true).some((n) => n.value === 50);
}

/**
 * Rèm: vị trí token nói ĐÚNG vị trí đích `position` (0 / 50 / 100) trong vùng đối tượng ∩ evidence — "50", "năm mươi", "một nửa",
 * "100", "một trăm", "0"; -1 nếu không có. Số trong biểu thức giờ ("sau 50 phút") không tính.
 */
function curtainValuePos(ctx: Ctx, region: [number, number], position: number): number {
  const lo = Math.max(region[0], ctx.evLo);
  const hi = Math.min(region[1], ctx.evHi);
  if (lo >= hi) return -1;
  const slice = ctx.utt.norm.slice(lo, hi);
  if (position === 50) {
    for (const phrase of HALF_PHRASES) {
      const at = indexOfSequence(slice, phrase);
      if (at !== -1) return lo + at;
    }
  }
  if (position === 100) {
    const at = indexOfSequence(slice, ["mot", "tram"]);
    if (at !== -1) return lo + at;
  }
  const found = plainNumbers(ctx.utt.norm, lo, hi, ctx.covered, true).find((n) => n.value === position);
  return found === undefined ? -1 : found.pos;
}

/** Rèm đặt theo con số: động từ (nếu có) không được ngược đích — 50 nhận cả mở/đóng (rèm đang 100% "về 50%" là kéo vào). */
function curtainVerbAllows(verb: string | null, position: number): boolean {
  if (verb === null) return true;
  if (position === 50) return verb === "mo" || VERBS_CLOSE.has(verb);
  if (position === 100) return verb === "mo";
  if (position === 0) return VERBS_CLOSE.has(verb);
  return false;
}

/** Vị trí token số nhiệt độ `temperature` (số trần) trong phạm vi ∩ evidence; -1 nếu không có. */
function temperaturePosIn(ctx: Ctx, scope: Scope, temperature: number): number {
  for (const [from, to] of scope.ranges) {
    const lo = Math.max(from, ctx.evLo);
    const hi = Math.min(to, ctx.evHi);
    if (lo >= hi) continue;
    const found = plainNumbers(ctx.utt.norm, lo, hi, ctx.covered, true).find((n) => n.value === temperature);
    if (found !== undefined) return found.pos;
  }
  return -1;
}

/** Lần nhắc từ loại tải ĐẦU TIÊN đạt C3 (kèm mỏ neo); null nếu không lần nào đạt. */
function findHit(input: ExplicitStepInput, ctx: Ctx): Hit | null {
  const { utt } = ctx;
  const { action } = input;
  const appliance = input.device.appliance;

  for (const [occ, occLength] of applianceOccurrences(utt.norm, appliance, ctx.evLo, ctx.evHi)) {
    const verbPos = dominantVerb(utt.norm, occ, occLength, ctx.evLo, ctx.evHi);
    const verb = verbPos === -1 ? null : utt.norm[verbPos];
    const region: [number, number] = verbPos === -1 ? segmentBounds(utt, occ) : objectRegion(utt, verbPos, occ);

    if (action === "set_temp") {
      if (appliance !== "ac" || input.temperature === null) return null;
      if (verb !== null && VERBS_OFF.has(verb)) continue;
      if (verbPos !== -1) {
        const numberPos = temperaturePosIn(ctx, scopeOf(utt, verbPos, true), input.temperature);
        if (numberPos === -1) continue;
        return { anchor: verbPos, anchorIsVerb: true, occ, occLength, region, numberPos };
      }
      const number = plainNumbers(utt.norm, ctx.evLo, ctx.evHi, ctx.covered, true).find((n) => n.value === input.temperature);
      if (number === undefined) continue;
      return { anchor: number.pos, anchorIsVerb: false, occ, occLength, region, numberPos: number.pos };
    }

    if (appliance === "curtain") {
      if (verb !== null) {
        const half = hasHalfSign(ctx, region);
        const opening = action === "turn_on" || (action === "set_pos" && input.position === 100);
        const halfOpen = action === "set_pos" && input.position === 50;
        const closing = action === "turn_off" || (action === "set_pos" && input.position === 0);
        const ok = opening ? verb === "mo" && !half : halfOpen ? verb === "mo" && half : closing ? VERBS_CLOSE.has(verb) : false;
        if (ok) return { anchor: verbPos, anchorIsVerb: true, occ, occLength, region };
      }
      // Đặt vị trí bằng con số nói rõ ("rèm về 50%", "rèm cửa năm mươi phần trăm", "đóng rèm một nửa", "rèm 100%"): đích đã rõ nên
      // không bắt buộc động từ (như "điều hoà 25 độ"); mỏ neo là token số khi không có động từ → R2/R3/R4 và "đang 50%" xét như set_temp.
      if (action === "set_pos" && input.position !== null) {
        const valuePos = curtainValuePos(ctx, region, input.position);
        if (valuePos !== -1 && curtainVerbAllows(verb, input.position)) {
          return verb !== null
            ? { anchor: verbPos, anchorIsVerb: true, occ, occLength, region, numberPos: valuePos }
            : { anchor: valuePos, anchorIsVerb: false, occ, occLength, region, numberPos: valuePos };
        }
      }
      continue;
    }
    if (verb === null) continue;
    // lamp / fan / ac
    if ((action === "turn_on" && VERBS_ON.has(verb)) || (action === "turn_off" && VERBS_OFF.has(verb))) {
      return { anchor: verbPos, anchorIsVerb: true, occ, occLength, region };
    }
  }
  return null;
}

// ── R2 / R3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** R2: đoạn chứa mỏ neo là câu hỏi. */
function isQuestion(utt: UtteranceTokens, anchor: number): boolean {
  if (utt.segQuestion[utt.seg[anchor]]) return true;
  const [from, to] = segmentBounds(utt, anchor);

  if (QUESTION_STARTERS.has(keyAt(utt, from))) return true; // "ai bật đèn"
  let end = to;
  while (end > from && QUESTION_PARTICLES.has(keyAt(utt, end - 1))) end--;
  if (end > from && QUESTION_TAILS.has(keyAt(utt, end - 1))) return true;

  if (containsPhrase(utt, from, to, QUESTION_PHRASES)) return true;

  // "có … không" (đèn có sáng không, quạt có đang chạy không)
  for (let k = from; k < to; k++) {
    if (!HAVE_WORDS.has(keyAt(utt, k))) continue;
    for (let j = k + 1; j < to; j++) if (NOT_WORDS.has(keyAt(utt, j))) return true;
  }
  return false;
}

/**
 * R3: có từ phủ định/quá khứ/ý định trong 3 token ngay trước `pos`, KHÔNG vượt ranh giới đoạn ("Tôi không thích tối, bật đèn" và
 * "Không, bật đèn đi" vẫn là lệnh). `verbAnchor`: pos là động từ → "k" (gõ tắt của "không") ngay trước nó cũng là phủ định.
 */
function isNegatedBefore(utt: UtteranceTokens, pos: number, verbAnchor: boolean): boolean {
  const [segStart] = segmentBounds(utt, pos);
  for (let k = Math.max(segStart, pos - NEGATION_WINDOW); k < pos; k++) if (NEGATION_WORDS.has(keyAt(utt, k))) return true;
  return verbAnchor && pos - 1 >= segStart && keyAt(utt, pos - 1) === "k";
}

/** set_temp: "đang/hiện (tại)" trong 3 token trước token số (cùng đoạn) → câu kể trạng thái, không phải lệnh đặt. */
function isStateStatement(utt: UtteranceTokens, numberPos: number): boolean {
  const [segStart] = segmentBounds(utt, numberPos);
  for (let k = Math.max(segStart, numberPos - NEGATION_WINDOW); k < numberPos; k++) if (STATE_WORDS.has(keyAt(utt, k))) return true;
  return false;
}

// ── R4 / R5: thời gian ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Trong phạm vi có dấu hiệu "làm ngay" (ngay, luôn, bây giờ, liền, lập tức) không. "ngày" có dấu không bao giờ tính. */
function hasImmediateSign(utt: UtteranceTokens, scope: Scope): boolean {
  const { norm } = utt;
  for (const [from, to] of scope.ranges) {
    for (let p = from; p < to; p++) {
      const word = norm[p];
      if (word === "ngay" && keyAt(utt, p) === "ngay" && !NOT_IMMEDIATE_AFTER_NGAY.has(norm[p + 1]) && !isNumeralToken(norm[p + 1])) return true;
      if (word === "luon" || word === "lien") return true;
      if (word === "bay" && norm[p + 1] === "gio") return true;
      if (word === "lap" && norm[p + 1] === "tuc") return true;
    }
  }
  return false;
}

/** Trong phạm vi có dấu hiệu hoãn ("tối nay", "ngày mai", "lát nữa", "tuần sau", "giây"…) không. */
function hasDeferralSign(utt: UtteranceTokens, scope: Scope): boolean {
  const { norm } = utt;
  for (const [from, to] of scope.ranges) {
    for (let p = from; p < to; p++) {
      const word = norm[p];
      if (DEFERRAL_WORDS.has(word)) return true;
      // "mốt" (ngày mốt) khác "hai mươi mốt" (21): đứng ngay sau "mươi/chục" là chữ số
      if (DEFERRAL_ACCENTED.has(keyAt(utt, p)) && !(word === "mot" && (norm[p - 1] === "muoi" || norm[p - 1] === "chuc"))) return true;
      if (PERIOD_NORMS.has(word) && norm[p + 1] === "nay") return true; // tối nay, sáng nay…
      if (DEFERRAL_PHRASES.some((phrase) => phrase.every((w, k) => norm[p + k] === w))) return true;
    }
  }
  return false;
}

/** Trong phạm vi có dấu hiệu lặp lại (mỗi/hằng/hàng ngày…) không — hệ thống chỉ hẹn giờ một lần nên không tự làm. */
function hasRepeatSign(utt: UtteranceTokens, scope: Scope): boolean {
  for (const [from, to] of scope.ranges) {
    for (let p = from; p < to; p++) {
      const key = keyAt(utt, p);
      if (REPEAT_ACCENTED.has(key)) return true;
      if (key === REPEAT_HANG && REPEAT_HANG_NEXT.has(utt.norm[p + 1])) return true;
    }
  }
  return false;
}

/** Giờ 24h của "h giờ" cùng buổi trong ngày; null = mơ hồ hoặc vô nghĩa ("8h" trần, "12 giờ tối"). */
function resolveHour(hour: number, periods: ReadonlySet<Period>): number | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 24) return null;
  const h = hour === 24 ? 0 : hour;
  if (periods.size > 1) return null;
  const [period] = [...periods];
  if (period === undefined) return h === 0 || h >= 13 ? h : null;
  switch (period) {
    case "sang":
      return h < 12 ? h : null;
    case "trua":
      return h >= 11 && h <= 13 ? h : null;
    case "chieu":
      return h >= 1 && h < 12 ? h + 12 : h >= 12 ? h : null;
    case "toi":
      return h >= 1 && h < 12 ? h + 12 : h >= 13 ? h : null;
    case "dem":
      if (h >= 9 && h <= 11) return h + 12;
      if (h === 12) return 0;
      if (h >= 1 && h <= 5) return h;
      return h >= 13 ? h : null;
  }
}

function periodsIn(ctx: Ctx, scope: Scope): Set<Period> {
  const found = new Set<Period>();
  for (let p = ctx.evLo; p < ctx.evHi; p++) {
    if (!inScope(scope, p)) continue;
    const period = PERIODS.get(keyAt(ctx.utt, p));
    if (period !== undefined) found.add(period);
  }
  return found;
}

/** R4 + R5: thời điểm của bước khớp với những gì người dùng nói. */
function timeMatches(ctx: Ctx, scope: Scope, when: ExplicitStepWhen): boolean {
  // Lặp lại ("mỗi tối", "hàng ngày"): hệ thống chỉ có hẹn giờ một lần → người dùng phải thấy và xác nhận (cả bước now lẫn có giờ)
  if (hasRepeatSign(ctx.utt, scope)) return false;

  if (when.kind === "now") {
    // Câu có giờ/dấu hiệu hoãn cho động từ này mà bước lại "chạy ngay" → lệch ý (trừ khi có "ngay/luôn/…" hợp lệ)
    const talksAboutTime = exprsIn(ctx, scope, false).length > 0 || hasDeferralSign(ctx.utt, scope);
    return !talksAboutTime || hasImmediateSign(ctx.utt, scope);
  }

  const inEvidence = exprsIn(ctx, scope, true);
  const periods = periodsIn(ctx, scope);
  if (when.kind === "at") {
    const expr = inEvidence.find((candidate) => candidate.kind === "hour" || candidate.kind === "pair");
    if (expr === undefined || expr.ambiguous) return false;
    const hour = resolveHour(expr.hour, periods);
    const minute = expr.minute ?? 0;
    return hour !== null && minute >= 0 && minute <= 59 && hour === when.hour && minute === when.minute;
  }
  // "sau N phút": hour có buổi trong ngày ("8h tối") là giờ tuyệt đối, không phải thời lượng
  const { norm } = ctx.utt;
  return inEvidence.some((expr) => {
    if (expr.kind === "hour") {
      if (periods.size > 0) return false;
      // Đơn vị GIỜ chỉ là thời lượng khi là "tiếng", hoặc "sau/trong" ngay trước (≤ 2 token), hoặc "nữa" ngay sau (≤ 2 token);
      // "tắt quạt lúc 2 giờ" là giờ tuyệt đối nên không khớp "sau 120 phút"
      const durationWord =
        expr.unit === "tieng" ||
        [norm[expr.start - 1], norm[expr.start - 2]].some((word) => word === "sau" || word === "trong") ||
        [norm[expr.end], norm[expr.end + 1]].some((word) => word === "nua");
      if (!durationWord) return false;
    }
    return durationOf(expr) === when.minutes;
  });
}

// ── C5: đúng một thiết bị ────────────────────────────────────────────────────────────────────────────────────────────────

/** Lõi tên phòng: chuẩn hoá rồi bỏ các từ chung ở ĐẦU (phòng/khu vực/khu/nhà); bỏ xong rỗng thì dùng cả tên. null → "". */
function roomCore(roomName: string | null): string {
  if (roomName === null) return "";
  const normalized = normalizeEvidenceText(roomName);
  let tokens = normalized.split(" ").filter(Boolean);
  for (let stripped = true; stripped; ) {
    stripped = false;
    for (const prefix of ROOM_PREFIXES) {
      if (tokens.length >= prefix.length && prefix.every((word, k) => tokens[k] === word)) {
        tokens = tokens.slice(prefix.length);
        stripped = true;
        break;
      }
    }
  }
  return tokens.length === 0 ? normalized : tokens.join(" ");
}

/** Lõi tên thiết bị: chuẩn hoá rồi bỏ các từ loại tải (trọn từ) — "Đèn trần" → "tran", "Đèn" → "". */
function nameCore(name: string, appliance: Appliance): string {
  let text = ` ${normalizeEvidenceText(name)} `;
  for (const word of APPLIANCE_WORDS[appliance]) {
    // lặp để xử lý các từ liền nhau dùng chung dấu cách ("den den")
    for (let previous = ""; previous !== text; ) {
      previous = text;
      text = text.split(` ${word} `).join(" ");
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

function scoreDevice(region: string, device: ExplicitStepDevice): number {
  const room = roomCore(device.roomName);
  const name = nameCore(device.name, device.appliance);
  return (room !== "" && containsWords(region, room) ? room.length : 0) + (name !== "" && containsWords(region, name) ? name.length : 0);
}

/**
 * Lượng từ ("tất cả", "toàn bộ", "cả nhà", "hết") trong vùng đối tượng. "hết" CHỈ tính khi đứng NGAY TRƯỚC từ loại tải ("tắt hết
 * đèn") hoặc NGAY SAU nó và sau đó chỉ còn hết đoạn/trợ từ ("tắt đèn hết đi"); "bật đèn hết sức" không phải lượng từ.
 */
function hasQuantifier(utt: UtteranceTokens, region: [number, number], occ: number, occLength: number): boolean {
  const [from, to] = region;
  const slice = utt.norm.slice(from, to);
  if (QUANTIFIERS.some((phrase) => indexOfSequence(slice, phrase) !== -1)) return true;
  if (occ - 1 >= from && utt.norm[occ - 1] === "het") return true;
  const after = occ + occLength;
  if (after < to && utt.norm[after] === "het") {
    const [, segEnd] = segmentBounds(utt, after);
    let rest = after + 1;
    while (rest < segEnd && TRAILING_PARTICLES.has(utt.norm[rest])) rest++;
    if (rest >= segEnd) return true;
  }
  return false;
}

/** C5: vùng đối tượng chỉ đúng MỘT thiết bị trong số các thiết bị cùng loại tải. */
function singlesOutDevice(input: ExplicitStepInput, ctx: Ctx, hit: Hit): boolean {
  const byId = new Map<number, ExplicitStepDevice>();
  for (const candidate of input.sameApplianceDevices) byId.set(candidate.id, candidate);
  if (!byId.has(input.device.id)) byId.set(input.device.id, input.device);
  const candidates = [...byId.values()];
  if (candidates.length <= 1) return true;
  if (hasQuantifier(ctx.utt, hit.region, hit.occ, hit.occLength)) return true; // "tất cả đèn" — người dùng chủ ý chọn nhiều

  const region = ctx.utt.norm.slice(hit.region[0], hit.region[1]).join(" ");
  const scored = candidates.map((candidate) => ({ id: candidate.id, score: scoreDevice(region, candidate) }));
  const best = Math.max(...scored.map((item) => item.score));
  if (best <= 0) return false;
  const top = scored.filter((item) => item.score === best);
  return top.length === 1 && top[0].id === input.device.id;
}

/**
 * Bước có "nói rõ" không — cần ĐỦ R1–R5 và C1–C5 (xem đầu file). Chuỗi đã chuẩn hoá, so khớp cụm từ theo ranh giới TỪ.
 */
export function isExplicitStep(input: ExplicitStepInput): boolean {
  // C1
  const evidence = normalizeEvidenceText(input.evidenceSpan);
  if (evidence.length < MIN_EVIDENCE_LENGTH) return false;
  const utt = tokenizeUtterance(input.utterance);
  if (!containsWords(utt.norm.join(" "), evidence)) return false;
  const evTokens = evidence.split(" ");
  const evLo = indexOfSequence(utt.norm, evTokens);
  if (evLo === -1) return false;
  const ctx = buildCtx(utt, evLo, evLo + evTokens.length);

  // R1: điều kiện (cả câu)
  if (containsPhrase(utt, 0, utt.norm.length, CONDITION_PHRASES)) return false;

  // C2 + C3: lần nhắc từ loại tải đầu tiên đạt hướng lệnh/giá trị
  const hit = findHit(input, ctx);
  if (hit === null) return false;

  // R2: câu hỏi · R3: phủ định/quá khứ
  if (isQuestion(utt, hit.anchor)) return false;
  if (isNegatedBefore(utt, hit.anchor, hit.anchorIsVerb)) return false;
  // set_temp không có động từ: ngoài token số còn xét luôn chỗ đứng của từ loại tải ("đừng đặt điều hoà 25 độ")
  if (!hit.anchorIsVerb && isNegatedBefore(utt, hit.occ, false)) return false;
  // set_temp: "điều hoà đang 25 độ" là kể trạng thái
  if (hit.numberPos !== undefined && hit.numberPos >= 0 && isStateStatement(utt, hit.numberPos)) return false;

  // R4 + R5
  if (!timeMatches(ctx, scopeOf(utt, hit.anchor, hit.anchorIsVerb), input.when)) return false;

  // C5
  return singlesOutDevice(input, ctx, hit);
}
