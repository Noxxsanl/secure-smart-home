/// One quick level of the curtain: 0 = closed, 100 = fully open. The backend
/// takes any integer 0..100 with `set_pos`; the UI offers these three
/// (web `model/curtain.ts`).
class CurtainLevel {
  const CurtainLevel(this.position, this.label);

  final int position;
  final String label;
}

const curtainLevels = <CurtainLevel>[
  CurtainLevel(0, 'Đóng'),
  CurtainLevel(50, '50%'),
  CurtainLevel(100, '100%'),
];

/// A curtain may stop a little off the requested level.
const _levelTolerance = 2;

/// The level to highlight. Position known: 0 → Đóng, otherwise 50 / 100 within
/// ±2 (30 % matches nothing, so no button is highlighted). Position unknown:
/// infer from on/off — off = Đóng, on = 100 %; nothing known → `null`.
int? activeCurtainLevel(int? position, bool? power) {
  if (position != null) {
    if (position <= 0) return 0;
    for (final level in curtainLevels) {
      if (level.position > 0 &&
          (level.position - position).abs() <= _levelTolerance) {
        return level.position;
      }
    }
    return null;
  }
  if (power == null) return null;
  return power ? 100 : 0;
}

/// "Đang đóng" / "Đang mở 50%"; position unknown but on → "Đang mở"; nothing
/// known → "Chưa rõ vị trí".
String curtainStatusText(int? position, bool? power) {
  if (position != null) {
    return position <= 0 ? 'Đang đóng' : 'Đang mở $position%';
  }
  if (power == null) return 'Chưa rõ vị trí';
  return power ? 'Đang mở' : 'Đang đóng';
}

/// Hint under the curtain state on the detail page.
const curtainHint = 'Chọn Đóng, 50% hoặc 100% để điều khiển rèm';
