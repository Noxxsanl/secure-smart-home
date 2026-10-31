// Kiểm quy tắc kiến trúc của backend/src (thay cho .dependency-cruiser.cjs — chỉ dùng `typescript` đã có sẵn).
// Chạy: npm run check:arch   (tuỳ chọn: --module <tên> chỉ báo lỗi của file thuộc module đó)
//
// Quy tắc (giải thích ở src/modules/README.md §2):
//   L1  Tầng: config → (không gì) · shared → shared · infrastructure → config, shared · core → config, shared,
//       infrastructure · modules → mọi tầng dưới + index.ts của module khác. Không ai import composition root.
//   L2  Module khác chỉ được import qua index.ts (`../../devices`), không import file bên trong.
//   L3  features/<a> không import features/<b>; feature không import index/facade/module của chính module;
//       domain/, infrastructure/, guards/ không import features/.
//   L4  Không còn thư mục _staging (code chưa tách feature).
//   T1  Chỉ module chủ sở hữu được INSERT/UPDATE/DELETE bảng của mình (TABLE_OWNERS).
//   T2  Đọc (FROM/JOIN) bảng của module khác chỉ được nằm trong file *.read-model.ts (hoặc có `arch-allow T2: lý do`).
//   T3  Không import hằng SQL (*_SQL) từ module khác.
//   C1  Giá trị import từ module khác chỉ được dùng TRONG thân hàm, không ở top-level: vòng phụ thuộc giữa
//       module là hợp lệ (CommonJS live binding) nhưng giá trị chưa nạp xong ở top-level sẽ là undefined.
// Ngoại lệ có chủ đích: module legacy (route Prototype) và simulator (đóng vai thiết bị) bỏ qua T1/T2;
// seed/, scripts/ là composition (được import index của mọi module, bỏ qua T1/T2/C1).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(BACKEND, "src");
const SCHEMA = path.join(BACKEND, "..", "infra", "postgres", "migrations", "001_schema.sql");
const require = createRequire(path.join(BACKEND, "package.json"));
const ts = require("typescript");

const TABLE_OWNERS = {
  identity: ["users", "customers", "refresh_tokens"],
  homes: [
    "smart_homes", "rooms", "smart_home_members", "member_device_access", "operator_home_access",
    "activation_tokens", "activation_logs",
  ],
  devices: ["devices", "device_tokens"],
  telemetry: ["sensor_data"],
  control: ["device_commands", "user_behavior_logs"],
  automation: ["automation_rules", "automation_history"],
  recommendations: ["recommendation_history", "user_feedback"],
  notifications: ["notifications"],
  ota: ["firmware", "ota_jobs", "ota_history"],
  audit: ["audit_log"],
};
const TABLE_EXEMPT_MODULES = new Set(["legacy", "simulator"]);
const COMPOSITION = (rel) => ["main.ts", "app.ts", "app.module.ts"].includes(rel) || /^(seed|scripts)\//.test(rel);

const args = process.argv.slice(2);
const onlyModule = args.includes("--module") ? args[args.indexOf("--module") + 1] : null;

const ownerOf = new Map();
for (const [mod, tables] of Object.entries(TABLE_OWNERS)) for (const t of tables) ownerOf.set(t, mod);
const schemaTables = fs.existsSync(SCHEMA)
  ? [...fs.readFileSync(SCHEMA, "utf8").matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g)].map((m) => m[1])
  : [];

const norm = (p) => p.split(path.sep).join("/");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith(".ts")) files.push(norm(path.relative(SRC, full)));
  }
})(SRC);

function layerOf(rel) {
  if (COMPOSITION(rel)) return "composition";
  const top = rel.split("/")[0];
  return ["config", "shared", "infrastructure", "core", "modules"].includes(top) ? top : "other";
}
const moduleOf = (rel) => (rel.startsWith("modules/") && rel.split("/").length > 2 ? rel.split("/")[1] : null);
const featureOf = (rel) => {
  const p = rel.split("/");
  return p[0] === "modules" && p[2] === "features" ? p[3] : null;
};
const ALLOWED_LAYER = {
  config: ["config"],
  shared: ["shared"],
  infrastructure: ["config", "shared", "infrastructure"],
  core: ["config", "shared", "infrastructure", "core"],
  modules: ["config", "shared", "infrastructure", "core", "modules"],
  composition: ["config", "shared", "infrastructure", "core", "modules", "composition"],
  other: ["config", "shared", "infrastructure", "core", "modules", "composition", "other"],
};

function resolve(fromRel, spec) {
  const base = norm(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec)));
  for (const cand of [base + ".ts", base + "/index.ts"]) if (files.includes(cand)) return cand;
  return null;
}

const errors = [];
const report = (rule, rel, msg) => {
  if (onlyModule && moduleOf(rel) !== onlyModule) return;
  errors.push(`${rule}  ${rel}: ${msg}`);
};

for (const dir of new Set(files.filter((f) => f.includes("/_staging/")).map((f) => f.split("/_staging/")[0]))) {
  report("L4", `${dir}/_staging`, "còn code chưa tách vào domain/infrastructure/features");
}

// Lối thoát T2 có ghi lý do: comment `// arch-allow T2: <lý do>` trong 3 dòng ngay trên literal SQL — chỉ dùng khi
// tách phần đọc ra read model sẽ đổi ngữ nghĩa (vd INSERT … SELECT cần nguyên tử trong 1 câu).
function collectSqlLiterals(sf, lines) {
  const out = [];
  const visit = (node) => {
    let sql = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) sql = node.text;
    else if (ts.isTemplateExpression(node)) sql = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ? ");
    if (sql !== null) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      const allowT2 = lines.slice(Math.max(0, line - 3), line + 1).some((l) => /arch-allow T2: \S/.test(l));
      out.push({ sql, allowT2 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.Constructor, ts.SyntaxKind.GetAccessor, ts.SyntaxKind.SetAccessor,
]);

for (const rel of files) {
  const text = fs.readFileSync(path.join(SRC, rel), "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const layer = layerOf(rel);
  const mod = moduleOf(rel);
  const feature = featureOf(rel);
  const crossValueNames = new Set();

  for (const st of sf.statements) {
    const isImp = ts.isImportDeclaration(st);
    const isExp = ts.isExportDeclaration(st) && st.moduleSpecifier;
    if (!isImp && !isExp) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith(".")) continue;
    const target = resolve(rel, spec);
    if (!target) { report("L1", rel, `không resolve được "${spec}"`); continue; }
    const tLayer = layerOf(target);
    const tMod = moduleOf(target);

    if (!ALLOWED_LAYER[layer].includes(tLayer)) report("L1", rel, `tầng ${layer} không được import ${tLayer} (${spec})`);
    if (tLayer === "composition" && layer !== "composition") report("L1", rel, `không import composition root (${spec})`);

    if (tMod && tMod !== mod) {
      if (target !== `modules/${tMod}/index.ts`) report("L2", rel, `import file bên trong module ${tMod} (${spec}) — dùng index.ts`);
      // T3 + thu tên giá trị cho C1
      if (isImp && st.importClause) {
        const clause = st.importClause;
        const nb = clause.namedBindings;
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) {
            const orig = (el.propertyName ?? el.name).text;
            if (/_SQL$/.test(orig)) report("T3", rel, `import hằng SQL ${orig} từ module ${tMod}`);
            if (!clause.isTypeOnly && !el.isTypeOnly) crossValueNames.add(el.name.text);
          }
        }
        if (clause.name && !clause.isTypeOnly) crossValueNames.add(clause.name.text);
      }
    }

    if (mod && tMod === mod) {
      const tFeature = featureOf(target);
      const tBase = target.split("/").slice(2).join("/");
      if (feature && tFeature && tFeature !== feature) report("L3", rel, `feature ${feature} import feature ${tFeature} (${spec})`);
      if (feature && (tBase === "index.ts" || tBase === `${mod}.facade.ts` || tBase === `${mod}.module.ts`)) {
        report("L3", rel, `feature không import ${tBase} của chính module (${spec})`);
      }
      const area = rel.split("/")[2];
      if (["domain", "infrastructure", "guards"].includes(area) && tFeature) report("L3", rel, `${area}/ không import features/ (${spec})`);
    }
  }

  // T1/T2: bảng dữ liệu
  if (mod && !TABLE_EXEMPT_MODULES.has(mod) && layer === "modules") {
    for (const { sql, allowT2 } of collectSqlLiterals(sf, text.split("\n"))) {
      for (const m of sql.matchAll(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_]+)/g)) {
        const owner = ownerOf.get(m[1]);
        if (owner && owner !== mod) report("T1", rel, `ghi bảng ${m[1]} của module ${owner}`);
      }
      if (!rel.endsWith(".read-model.ts") && !allowT2) {
        for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/g)) {
          const owner = ownerOf.get(m[1]);
          if (owner && owner !== mod) report("T2", rel, `đọc bảng ${m[1]} của module ${owner} ngoài *.read-model.ts`);
        }
      }
    }
  }

  // C1: giá trị của module khác dùng ở top-level
  if (crossValueNames.size && layer === "modules") {
    const visit = (node, inFn, inType) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      const fn = inFn || FUNCTION_KINDS.has(node.kind) ||
        (ts.isPropertyDeclaration(node) && !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword));
      const type = inType || ts.isTypeNode(node);
      if (ts.isIdentifier(node) && !fn && !type && crossValueNames.has(node.text)) {
        const p = node.parent;
        const isName = (ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node);
        if (!isName) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          report("C1", rel, `dùng ${node.text} (module khác) ở top-level, dòng ${line + 1}`);
        }
      }
      ts.forEachChild(node, (child) => visit(child, fn, type));
    };
    visit(sf, false, false);
  }
}

for (const t of schemaTables) if (!ownerOf.has(t)) errors.push(`T1  infra/postgres/migrations/001_schema.sql: bảng ${t} chưa có module chủ sở hữu trong TABLE_OWNERS`);

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} vi phạm kiến trúc${onlyModule ? ` (module ${onlyModule})` : ""}.`);
  process.exit(1);
}
console.log(`check:arch OK — ${files.length} file${onlyModule ? ` (module ${onlyModule})` : ""}.`);
