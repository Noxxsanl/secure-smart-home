# Image production dùng chung cho 3 app — chọn app bằng build arg:
#   docker build --build-arg APP=admin|operator|user -t smarthome-<app> frontend/

# Chỉ gom package.json của mọi workspace (apps/*, packages/*, packages/modules/*) + lockfile, để
# layer `npm ci` chỉ chạy lại khi phụ thuộc đổi — thêm module mới không phải sửa Dockerfile.
FROM node:20-alpine AS manifests
WORKDIR /src
COPY . .
RUN find . -name package.json -not -path "*/node_modules/*" | while read -r f; do \
      mkdir -p "/out/$(dirname "$f")" && cp "$f" "/out/$f"; \
    done \
  && cp package-lock.json /out/

FROM node:20-alpine AS deps
WORKDIR /app
COPY --from=manifests /out ./
RUN npm ci

FROM node:20-alpine AS builder
ARG APP=admin
# rewrites /api/* (next.config.ts) được ghi vào bản build. Trong compose, nginx route /api/ thẳng
# tới backend; rewrites chỉ là đường dự phòng khi gọi thẳng cổng của container frontend.
ARG BACKEND_URL=http://backend:5000
ENV BACKEND_URL=${BACKEND_URL} NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Lấy cả /app của deps (gồm node_modules lồng trong workspace nếu npm không hoist được).
COPY --from=deps /app ./
COPY . .
RUN npm run build -w @shh/${APP}

FROM node:20-alpine AS runner
ARG APP=admin
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 APP=${APP} NEXT_TELEMETRY_DISABLED=1
# Output standalone của monorepo giữ nguyên cấu trúc thư mục: apps/<app>/server.js (package @shh/*
# đã được bundle vào .next nên không cần packages/). Chạy bằng user `node`, sở hữu .next để ghi cache.
COPY --from=builder --chown=node:node /app/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=builder --chown=node:node /app/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
CMD ["sh", "-c", "node \"apps/$APP/server.js\""]
