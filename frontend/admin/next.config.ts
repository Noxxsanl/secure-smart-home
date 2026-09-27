import path from "node:path";
import type { NextConfig } from "next";

// Gốc workspace (frontend/) — Turbopack chỉ resolve file nằm trong root, và
// output standalone cần trace cả packages/* nằm ngoài thư mục app.
const workspaceRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  transpilePackages: ["@smarthome/shared", "@smarthome/console"],
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
};

export default nextConfig;
