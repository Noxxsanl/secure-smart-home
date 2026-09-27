# Image production dùng chung cho 3 app — chọn app bằng build arg:
#   docker build --build-arg APP=admin|operator|user -t smarthome-<app> frontend/
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/console/package.json packages/console/
COPY admin/package.json admin/
COPY operator/package.json operator/
COPY user/package.json user/
RUN npm ci

FROM node:20-alpine AS builder
ARG APP=admin
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @smarthome/${APP}

FROM node:20-alpine AS runner
ARG APP=admin
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 APP=${APP}
# Output standalone của monorepo giữ nguyên cấu trúc thư mục: <app>/server.js
COPY --from=builder /app/${APP}/.next/standalone ./
COPY --from=builder /app/${APP}/.next/static ./${APP}/.next/static
COPY --from=builder /app/${APP}/public ./${APP}/public
EXPOSE 3000
CMD ["sh", "-c", "node \"$APP/server.js\""]
