// Số và giờ trong câu nói (đã chuẩn hoá, không dấu) cho luật "rõ lệnh" (explicit-step.ts). Hàm THUẦN — không DB, không log.
//
// Vì sao tách khỏi chuỗi con đơn giản: "hai mươi" không được khớp trong "hai mươi lăm", "25 phút" không phải 25°C, "phòng 2"
// không phải 2 giờ, "50 phút" không phải "một nửa". Nên số được đọc THAM LAM (dài nhất) và phân biệt "số chỉ giờ/phút/giây"
// (đứng trước đơn vị thời gian) với "số trần" (nhiệt độ, độ mở).

const UNIT_VALUES: ReadonlyMap<string, number> = new Map([
  ["mot", 1],
  ["hai", 2],
  ["ba", 3],
  ["bon", 4],
  ["tu", 4],
  ["nam", 5],
  ["lam", 5],
  ["sau", 6],
  ["bay", 7],
  ["tam", 8],
  ["chin", 9],
]);
// Chữ hàng chục (U trong "U mươi") và chữ khẩu ngữ "U U'" ("hai lăm", "bốn lăm"): chỉ U ≤ 5 nên số luôn ≤ 59.
const TENS_UNITS: ReadonlySet<string> = new Set(["hai", "ba", "bon", "nam"]);
/** "mươi" và "chục" ("ba chục phút" = 30) dùng như nhau. */
const TEN_WORDS: ReadonlySet<string> = new Set(["muoi", "chuc"]);

const HOUR_UNITS: ReadonlySet<string> = new Set(["gio", "h", "tieng"]);
const MINUTE_UNITS: ReadonlySet<string> = new Set(["phut", "p", "ph", "min"]);
const SECOND_UNITS: ReadonlySet<string> = new Set(["giay", "s"]);

export function isHourUnit(word: string | undefined): boolean {
  return word !== undefined && HOUR_UNITS.has(word);
}
export function isMinuteUnit(word: string | undefined): boolean {
  return word !== undefined && MINUTE_UNITS.has(word);
}
export function isSecondUnit(word: string | undefined): boolean {
  return word !== undefined && SECOND_UNITS.has(word);
}
export function isTimeUnit(word: string | undefined): boolean {
  return isHourUnit(word) || isMinuteUnit(word) || isSecondUnit(word);
}

/** Token là một chữ số trần ("30") hoặc một từ chỉ số ("mot", "muoi", "chuc"). Số kèm đơn vị liền ("30p") KHÔNG tính. */
export function isNumeralToken(word: string | undefined): boolean {
  return word !== undefined && (/^\d+$/.test(word) || UNIT_VALUES.has(word) || TEN_WORDS.has(word));
}

export interface SpokenNumber {
  value: number;
  length: number;
}

/**
 * Số đọc bằng chữ 0–59 bắt đầu tại tokens[i], THAM LAM (dài nhất). Mẫu thử theo thứ tự: "U mươi U'" · "U mươi" · "mươi U'" ·
 * "mươi" · "U U'" khẩu ngữ (chỉ khi `colloquialAnywhere` hoặc theo sau là đơn vị giờ/phút hoặc "độ") · "U". ("chục" như "mươi".)
 * Người gọi quyết định có coi là SỐ hay không (số đứng trần như "sau", "ba", "nam" trùng từ thường).
 */
export function parseSpokenNumber(tokens: readonly string[], i: number, colloquialAnywhere: boolean): SpokenNumber | null {
  const a = tokens[i];
  if (a === undefined) return null;
  const b = tokens[i + 1];
  const c = tokens[i + 2];
  const ua = UNIT_VALUES.get(a);

  if (TENS_UNITS.has(a) && b !== undefined && TEN_WORDS.has(b)) {
    const uc = c === undefined ? undefined : UNIT_VALUES.get(c);
    if (uc !== undefined && ua !== undefined) return { value: ua * 10 + uc, length: 3 };
    return { value: (ua ?? 0) * 10, length: 2 };
  }
  if (TEN_WORDS.has(a)) {
    const ub = b === undefined ? undefined : UNIT_VALUES.get(b);
    if (ub !== undefined) return { value: 10 + ub, length: 2 };
    return { value: 10, length: 1 };
  }
  if (TENS_UNITS.has(a) && ua !== undefined && b !== undefined && UNIT_VALUES.has(b)) {
    if (colloquialAnywhere || c === "do" || isTimeUnit(c)) return { value: ua * 10 + (UNIT_VALUES.get(b) ?? 0), length: 2 };
  }
  if (ua !== undefined) return { value: ua, length: 1 };
  return null;
}

/**
 * Biểu thức thời gian trong câu:
 *  - hour:   giờ ("8h", "22h30", "8 giờ", "tám giờ", "1 tiếng rưỡi"); `minute` = phút kèm theo (null nếu không nói)
 *  - minute: số phút ("30p", "30phút", "30 phút", "nửa tiếng" = 30)
 *  - second: số giây ("30 giây", "30s") — không dùng được làm thời lượng hẹn giờ
 *  - pair:   cặp số "HH MM" (từ "20:00", "7.30" sau khi chuẩn hoá thành "20 00", "7 30")
 * start/end = vị trí token [start, end). `unit` = đơn vị giờ đã dùng (tieng/gio/h; "" nếu không phải hour) — "tiếng" luôn là thời
 * lượng còn "giờ" có thể là giờ tuyệt đối. `ambiguous` = "8 giờ kém 15", "8 giờ 75"… (bước `at` không được coi là rõ).
 */
export interface TimeExpr {
  kind: "hour" | "minute" | "second" | "pair";
  start: number;
  end: number;
  hour: number;
  minute: number | null;
  minutes: number;
  unit: string;
  ambiguous: boolean;
}

/** Thời lượng (phút) của biểu thức dạng "sau N": hour → 60h + phút kèm theo; minute → minutes; còn lại không phải thời lượng. */
export function durationOf(expr: TimeExpr): number | null {
  if (expr.ambiguous) return null;
  if (expr.kind === "hour") return expr.hour * 60 + (expr.minute ?? 0);
  if (expr.kind === "minute") return expr.minutes;
  return null;
}

/** Quét các biểu thức thời gian trong tokens[from, to). Không vượt `to` khi nhìn trước. */
export function parseTimeExprs(tokens: readonly string[], from: number, to: number): TimeExpr[] {
  const view = tokens.slice(0, to);
  const out: TimeExpr[] = [];
  const make = (partial: Partial<TimeExpr> & Pick<TimeExpr, "kind" | "start" | "end">): TimeExpr => ({
    hour: 0,
    minute: null,
    minutes: 0,
    unit: "",
    ambiguous: false,
    ...partial,
  });

  for (let i = from; i < to; ) {
    const t = view[i];

    // "8h", "22h30", "8g": số + h/g (+ số phút) liền nhau; "rưỡi" ngay sau = 30 phút
    const attachedHour = /^(\d{1,4})[hg](\d{1,3})?$/.exec(t);
    if (attachedHour) {
      let minute = attachedHour[2] === undefined ? null : Number(attachedHour[2]);
      let end = i + 1;
      if (minute === null && view[end] === "ruoi") {
        minute = 30;
        end += 1;
      }
      out.push(make({ kind: "hour", start: i, end, hour: Number(attachedHour[1]), minute, unit: "h", ambiguous: minute !== null && minute > 59 }));
      i = end;
      continue;
    }

    // số + đơn vị: "30phút", "8giờ", "30ph", "30min", "30giây", "30s", "30p" (liền nhau) hoặc số (chữ số / chữ) rồi token đơn vị
    let value: number | null = null;
    let unit: string | undefined;
    let used = 0;
    const attached = /^(\d{1,4})(phut|gio|ph|min|giay|s|p)$/.exec(t);
    if (attached) {
      value = Number(attached[1]);
      unit = attached[2];
      used = 1;
    } else {
      const number: SpokenNumber | null = /^\d{1,4}$/.test(t) ? { value: Number(t), length: 1 } : parseSpokenNumber(view, i, false);
      if (number !== null) {
        value = number.value;
        unit = view[i + number.length];
        used = number.length + 1;
      }
    }
    if (value !== null && unit !== undefined) {
      if (isHourUnit(unit)) {
        let j = i + used;
        let minute: number | null = null;
        let ambiguous = false;
        if (view[j] === "ruoi") {
          minute = 30;
          j += 1;
        } else if (view[j] === "kem" || view[j] === "hon") {
          ambiguous = true; // "8 giờ kém 15", "8 giờ hơn": không quy đổi được chắc chắn
          j += 1;
        } else if (/^\d+$/.test(view[j] ?? "")) {
          // "8 giờ 30 (phút)": số ngay sau đơn vị giờ là phút, trừ khi là nhiệt độ ("8 giờ 25 độ") hoặc đơn vị khác theo sau
          const digits = Number(view[j]);
          const after = view[j + 1];
          if (isMinuteUnit(after)) {
            minute = digits;
            j += 2;
          } else if (!isTimeUnit(after) && after !== "do") {
            minute = digits;
            j += 1;
          }
          if (minute !== null && minute > 59) ambiguous = true;
        } else {
          // "tám giờ ba mươi", "một tiếng ba mươi phút": số chữ; số chữ đơn ("ba", "sau") chỉ nhận khi có chữ "phút" (tránh "sau")
          const spoken = parseSpokenNumber(view, j, false);
          if (spoken !== null) {
            const next = view[j + spoken.length];
            if (isMinuteUnit(next)) {
              minute = spoken.value;
              j += spoken.length + 1;
            } else if (spoken.length >= 2 && !isTimeUnit(next) && next !== "do") {
              minute = spoken.value;
              j += spoken.length;
            }
          }
        }
        out.push(make({ kind: "hour", start: i, end: j, hour: value, minute, unit: unit === "h" ? "h" : unit, ambiguous }));
        i = j;
        continue;
      }
      if (isMinuteUnit(unit)) {
        out.push(make({ kind: "minute", start: i, end: i + used, minutes: value }));
        i += used;
        continue;
      }
      if (isSecondUnit(unit)) {
        out.push(make({ kind: "second", start: i, end: i + used, minutes: 0 }));
        i += used;
        continue;
      }
    }

    // "nửa tiếng", "nửa giờ" = 30 phút
    if (t === "nua" && (view[i + 1] === "tieng" || view[i + 1] === "gio")) {
      out.push(make({ kind: "minute", start: i, end: i + 2, minutes: 30 }));
      i += 2;
      continue;
    }

    // "20:00" / "7.30" → "20 00" / "7 30": số ≤ 24 rồi đúng 2 chữ số 00–59, không có đơn vị theo sau (tránh "phòng 2 30 phút")
    const second = view[i + 1];
    if (/^\d{1,2}$/.test(t) && Number(t) <= 24 && second !== undefined && /^\d{2}$/.test(second) && Number(second) <= 59 && !isTimeUnit(view[i + 2])) {
      out.push(make({ kind: "pair", start: i, end: i + 2, hour: Number(t), minute: Number(second) }));
      i += 2;
      continue;
    }
    i += 1;
  }
  return out;
}

export interface PlainNumber {
  pos: number;
  length: number;
  value: number;
}

/**
 * "Số trần" (không phải giờ/phút) trong tokens[from, to): chữ số mà token ngay sau KHÔNG phải đơn vị thời gian, hoặc — khi
 * `spoken` (nhiệt độ điều hoà) — số đọc bằng chữ (khẩu ngữ "hai lăm" cũng nhận). Bỏ qua token nằm trong biểu thức thời gian
 * (`covered`: "25 phút", "18 giờ", "20 00"). Quét trái → phải, không chồng lấn, nên "hai mươi" không khớp trong "hai mươi lăm".
 */
export function plainNumbers(tokens: readonly string[], from: number, to: number, covered: ReadonlySet<number>, spoken: boolean): PlainNumber[] {
  const out: PlainNumber[] = [];
  for (let i = from; i < to; ) {
    if (covered.has(i)) {
      i += 1;
      continue;
    }
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      if (!isTimeUnit(tokens[i + 1])) out.push({ pos: i, length: 1, value: Number(t) });
      i += 1;
      continue;
    }
    if (spoken) {
      const number = parseSpokenNumber(tokens, i, true);
      if (number !== null && i + number.length <= to && !isTimeUnit(tokens[i + number.length])) {
        out.push({ pos: i, length: number.length, value: number.value });
        i += number.length;
        continue;
      }
    }
    i += 1;
  }
  return out;
}
