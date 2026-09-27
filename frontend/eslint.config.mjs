import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Một cấu hình cho cả workspace: 3 app Next.js + 2 gói dùng chung.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: ["admin/", "operator/", "user/"] },
    },
  },
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
  ]),
]);

export default eslintConfig;
