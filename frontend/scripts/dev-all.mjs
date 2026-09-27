// Chạy dev server của cả 3 app cùng lúc: `npm run dev` (từ thư mục frontend/).
// Ctrl+C dừng tất cả. Muốn chạy riêng: npm run dev:admin | dev:operator | dev:user.
import { spawn } from "node:child_process";

const APPS = [
  { name: "admin", port: 3001 },
  { name: "operator", port: 3002 },
  { name: "user", port: 3003 },
];

const children = APPS.map(({ name, port }) => {
  const child = spawn("npm", ["run", "dev", "-w", `@smarthome/${name}`], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  const prefix = `[${name}:${port}]`;
  const pipe = (stream, out) =>
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) out.write(`${prefix} ${line}\n`);
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => console.log(`${prefix} đã dừng (exit ${code})`));
  return child;
});

console.log(APPS.map(({ name, port }) => `  ${name.padEnd(9)} http://localhost:${port}`).join("\n"));

function shutdown() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
