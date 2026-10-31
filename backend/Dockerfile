FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build xong bỏ devDependencies (typescript, ts-node-dev, @types/*) — image chạy chỉ cần dependencies.
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
# Firmware upload ghi vào FIRMWARE_STORAGE_DIR (mặc định storage/firmware) — compose.prod mount volume
# vào đây; tạo sẵn và giao cho user `node` để volume mới khởi tạo đúng quyền. Không chạy bằng root.
RUN mkdir -p storage/firmware && chown -R node:node storage
USER node
EXPOSE 5000
# Gọi node trực tiếp (không qua npm) để tiến trình nhận SIGTERM khi `docker stop`.
CMD ["node", "dist/main.js"]
