import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Gốc workspace (frontend/) — Turbopack chỉ resolve file nằm trong root, và
// output standalone cần trace cả packages/* nằm ngoài thư mục app.
const workspaceRoot = path.join(__dirname, "../..");

// Package @shh/* xuất mã nguồn TypeScript (không build sẵn) nên Next phải transpile —
// gồm cả phụ thuộc gián tiếp (VD @shh/api-client qua module), đi theo dependencies.
function workspaceDeps(pkgDir: string, found = new Set<string>()): string[] {
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  for (const name of Object.keys(dependencies)) {
    if (!name.startsWith("@shh/") || found.has(name)) continue;
    found.add(name);
    workspaceDeps(path.join(workspaceRoot, "node_modules", name), found);
  }
  return [...found];
}
const workspacePackages = workspaceDeps(__dirname);

// Backend Express. Trình duyệt chỉ gọi cùng origin `/api/*` (cookie HttpOnly đi
// kèm, không cần CORS); Next chuyển tiếp sang backend. Lưu ý: rewrites được tính
// lúc `next dev` khởi động / `next build` — đổi BACKEND_URL thì phải khởi động
// lại hoặc build lại. Trong Docker, nginx đã route `/api/` thẳng tới backend.
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:5000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  transpilePackages: workspacePackages,
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
