// Kiểm quy tắc phụ thuộc của frontend (chỉ dùng `typescript` đã có sẵn, không cài thêm công cụ).
// Chạy: npm run check:arch   (tuỳ chọn: --package <tên> chỉ báo lỗi của package đó, VD --package devices)
//
// Quy tắc (giải thích ở README.md §Quy tắc phụ thuộc):
//   R1  App (apps/*) chỉ import package qua cửa ra công khai, không import @shh/api-client hay swr
//       (app không gọi API trực tiếp) và không import file của app khác.
//   R2  Trong module: features/<x> dùng api/, model/, ui/ của chính module; api/ → api/, model/;
//       ui/ → ui/, model/ (ui không gọi API); model/ → model/.
//   R3  features/<a> không import features/<b>, kể cả cùng module — ghép ở trang của app.
//   R4  Module không import module khác, trừ @shh/auth (người dùng hiện tại, nhà đang chọn, role-gate).
//   R5  @shh/ui không import modules/; @shh/api-client chỉ dùng @shh/utils; @shh/utils không dùng @shh/*.
//   R6  Import package khác chỉ qua cửa ra khai báo trong "exports" (không đi sâu vào src/), và
//       import tương đối không được thoát ra ngoài package.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(FRONTEND, "package.json"));
const ts = require("typescript");

const args = process.argv.slice(2);
const onlyPackage = args.includes("--package") ? args[args.indexOf("--package") + 1] : null;

const norm = (p) => p.split(path.sep).join("/");
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// --- Danh sách package ------------------------------------------------------
const packages = []; // { name, kind: app|module|ui|utils|api-client|config, dir, exports: Set }
for (const app of fs.readdirSync(path.join(FRONTEND, "apps"))) {
  const dir = `apps/${app}`;
  if (fs.existsSync(path.join(FRONTEND, dir, "package.json"))) packages.push({ name: readJson(path.join(FRONTEND, dir, "package.json")).name, kind: "app", dir, short: app });
}
for (const base of ["packages", "packages/modules"]) {
  for (const entry of fs.readdirSync(path.join(FRONTEND, base))) {
    const dir = `${base}/${entry}`;
    const pkgFile = path.join(FRONTEND, dir, "package.json");
    if (!fs.existsSync(pkgFile)) continue;
    const pkg = readJson(pkgFile);
    const kind = base === "packages/modules" ? "module" : entry;
    packages.push({ name: pkg.name, kind, dir, short: entry, exports: new Set(Object.keys(pkg.exports ?? {})) });
  }
}
const byName = new Map(packages.map((p) => [p.name, p]));
const packageOfFile = (rel) =>
  packages.filter((p) => rel.startsWith(`${p.dir}/`)).sort((a, b) => b.dir.length - a.dir.length)[0] ?? null;

// --- File nguồn -------------------------------------------------------------
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "public"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) files.push(norm(path.relative(FRONTEND, full)));
  }
})(FRONTEND);

/** Vị trí của file trong module: { layer: features|api|model|ui|root, feature } */
function placeInModule(pkg, rel) {
  const parts = rel.slice(pkg.dir.length + 1).split("/"); // src/<layer>/...
  if (parts[0] !== "src") return { layer: "other" };
  if (parts.length === 2) return { layer: "root" };
  if (parts[1] === "features") return { layer: "features", feature: parts[2] };
  return { layer: parts[1] };
}

const LAYER_ALLOWED = {
  features: ["api", "model", "ui"],
  api: ["api", "model"],
  ui: ["ui", "model"],
  model: ["model"],
};

function importsOf(rel) {
  const text = fs.readFileSync(path.join(FRONTEND, rel), "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
      out.push({ spec: node.arguments[0].text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const violations = [];
const report = (rule, rel, line, msg) => violations.push({ rule, where: `${rel}:${line}`, msg, pkg: packageOfFile(rel) });

for (const rel of files) {
  const pkg = packageOfFile(rel);
  if (!pkg || rel.startsWith("scripts/")) continue;
  const place = pkg.kind === "module" ? placeInModule(pkg, rel) : null;

  for (const { spec, line } of importsOf(rel)) {
    // Import tương đối hoặc alias @/ của app → file trong chính package.
    if (spec.startsWith(".") || spec.startsWith("@/")) {
      if (spec.endsWith(".css")) continue;
      const target = spec.startsWith("@/") ? `${pkg.dir}/src/${spec.slice(2)}` : norm(path.join(path.dirname(rel), spec));
      if (spec.startsWith("@/") && pkg.kind !== "app") report("R6", rel, line, `alias "@/" chỉ dùng trong app — dùng đường dẫn tương đối`);
      if (!target.startsWith(`${pkg.dir}/`)) {
        report("R6", rel, line, `import tương đối "${spec}" thoát ra ngoài ${pkg.name}`);
        continue;
      }
      if (pkg.kind !== "module" || !place) continue;
      const tPlace = placeInModule(pkg, target);
      if (place.layer === "root" || tPlace.layer === "other") continue;
      if (tPlace.layer === "root") {
        report("R2", rel, line, `không import index.ts của chính module ("${spec}") — import thẳng file cần dùng`);
        continue;
      }
      if (place.layer === "features") {
        if (tPlace.layer === "features" && tPlace.feature !== place.feature) {
          report("R3", rel, line, `features/${place.feature} import features/${tPlace.feature} — ghép ở trang của app`);
        }
        continue;
      }
      const allowed = LAYER_ALLOWED[place.layer] ?? [];
      if (!allowed.includes(tPlace.layer)) report("R2", rel, line, `${place.layer}/ không được import ${tPlace.layer}/ ("${spec}")`);
      continue;
    }

    // Package của workspace.
    const m = spec.match(/^(@shh\/[a-z-]+)(\/.*)?$/);
    if (m) {
      const target = byName.get(m[1]);
      if (!target) {
        report("R6", rel, line, `package không tồn tại: ${m[1]}`);
        continue;
      }
      const sub = m[2] ? `.${m[2]}` : ".";
      if (target.exports && !target.exports.has(sub)) report("R6", rel, line, `"${spec}" không phải cửa ra công khai của ${target.name}`);
      if (target === pkg) {
        report("R6", rel, line, `tự import chính package qua tên "${spec}" — dùng đường dẫn tương đối`);
        continue;
      }
      if (pkg.kind === "app") {
        if (target.kind === "api-client") report("R1", rel, line, `app không gọi API trực tiếp — dùng hook/feature của module thay vì ${spec}`);
      } else if (pkg.kind === "module") {
        if (target.kind === "module" && target.name !== "@shh/auth") report("R4", rel, line, `module ${pkg.short} import module ${target.short} — ghép ở trang của app`);
      } else if (pkg.kind === "ui") {
        if (target.kind === "module") report("R5", rel, line, `@shh/ui không import modules/ (${spec})`);
      } else if (pkg.kind === "api-client") {
        if (target.kind !== "utils") report("R5", rel, line, `@shh/api-client chỉ được dùng @shh/utils (${spec})`);
      } else if (pkg.kind === "utils") {
        report("R5", rel, line, `@shh/utils không phụ thuộc package nào của workspace (${spec})`);
      }
      continue;
    }
    if (spec.startsWith("@smarthome/")) report("R6", rel, line, `package cũ "${spec}" đã bỏ — dùng @shh/*`);
    if (pkg.kind === "app" && (spec === "swr" || spec.startsWith("swr/"))) report("R1", rel, line, `app không gọi API trực tiếp (${spec}) — dùng hook của module`);
  }
}

const shown = onlyPackage ? violations.filter((v) => v.pkg?.short === onlyPackage) : violations;
if (shown.length === 0) {
  console.log(`check:arch OK — ${files.length} file, ${packages.length} package.`);
  process.exit(0);
}
for (const v of shown.sort((a, b) => a.where.localeCompare(b.where))) console.log(`${v.rule}  ${v.where}  ${v.msg}`);
console.log(`\n${shown.length} vi phạm.`);
process.exit(1);
