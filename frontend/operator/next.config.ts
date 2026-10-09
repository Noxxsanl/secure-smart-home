import path from "node:path";
import type { NextConfig } from "next";

// Gốc workspace (frontend/) — Turbopack chỉ resolve file nằm trong root, và
// output standalone cần trace cả packages/* nằm ngoài thư mục app.
const workspaceRoot = path.join(__dirname, "..");

// Backend Express. Trình duyệt chỉ gọi cùng origin `/api/*` (cookie HttpOnly đi
// kèm, không cần CORS); Next chuyển tiếp sang backend. Lưu ý: rewrites được tính
// lúc `next dev` khởi động / `next build` — đổi BACKEND_URL thì phải khởi động
// lại hoặc build lại. Trong Docker, nginx đã route `/api/` thẳng tới backend.
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:5000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  transpilePackages: ["@smarthome/shared", "@smarthome/console"],
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
