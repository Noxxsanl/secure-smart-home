// Điều kiện SQL "log thuộc giá này": cùng tên model, hoặc tên + hậu tố ngày của bản snapshot
// ("gpt-5-mini-2025-08-07", "claude-haiku-4-5-20251001"). Tên model chỉ gồm [A-Za-z0-9_.:/@+-] (usage-record.ts,
// save-model-price) nên chỉ cần thoát "." và "+" trước khi ghép vào regex.
// `price` / `log` là biểu thức SQL (tên cột hoặc "?") — chỉ truyền hằng trong code, không bao giờ input người dùng.
export function modelMatchSql(price: string, log: string): string {
  return (
    `(${log} = ${price} OR ${log} ~ ('^' || replace(replace(${price}, '.', '\\.'), '+', '\\+') ` +
    `|| '-[0-9]{4}-?[0-9]{2}-?[0-9]{2}$'))`
  );
}
