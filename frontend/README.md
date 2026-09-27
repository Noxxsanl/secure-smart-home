# Frontend — 3 app web theo role

npm workspaces gồm 3 app Next.js 16 độc lập (mỗi role hệ thống một app) và 2 gói code dùng chung. Toàn bộ dữ liệu hiện chạy trên **mock** (`packages/shared/mock`), chưa nối backend.

| App | Thư mục | Cổng dev | Role | Tài khoản demo |
|---|---|---|---|---|
| Admin console | `admin/` | http://localhost:3001 | `ADMIN` | `admin / admin123` |
| Operator console | `operator/` | http://localhost:3002 | `OPERATOR` | `operator01 / operator123` |
| Cổng khách hàng | `user/` | http://localhost:3003 | `USER` | `user01 / user123` |

Mỗi app chỉ nhận phiên đúng role của mình: đăng nhập nhầm cổng bị từ chối, kèm hướng dẫn sang đúng cổng.

## Cấu trúc

```
frontend/
├── package.json            workspaces + script chung
├── tsconfig.base.json      compilerOptions dùng chung
├── eslint.config.mjs       lint toàn workspace
├── packages/
│   ├── shared/             @smarthome/shared — dùng cho cả 3 app
│   │   ├── app-shell/      ShellFrame, Sidebar, Header, NotificationBell, AppProviders, trang lỗi/404
│   │   ├── auth/           PortalConfig, AuthProvider, AuthGuard/GuestGuard, Login, Quên mật khẩu
│   │   ├── mock/           types, seed, store (DB giả) + portal.ts (API giả kênh khách hàng)
│   │   ├── styles/theme.css  design token (light/dark)
│   │   └── ui/             Button, Dialog, Switch, StatusBadge, SensorChart, ...
│   └── console/            @smarthome/console — tính năng dùng chung Admin + Operator
│       ├── shell/ConsoleShell.tsx   khung + badge + chuông thông báo staff
│       ├── auth/usePermissions.ts   quyền theo role của console
│       └── smart-homes, customers, gateways, devices, ota, automation, logs, notifications, ai
├── admin/                  route + dashboard Admin + Team/Operator Access/Settings (chỉ Admin)
├── operator/               route + dashboard Operator (không có Team/Settings, chỉ 5 loại log)
└── user/                   cổng khách hàng: Tổng quan, Phòng, Thiết bị, Tự động hoá, Thông báo, Thành viên, Thêm Smart Home, Hồ sơ
```

Mỗi app có `src/config/portal.ts` (role, tên, trang chủ) và `src/config/nav.ts` (menu sidebar). Route file chỉ re-export page:

```ts
export { default } from "@smarthome/console/devices/pages/DevicesPage"; // tính năng dùng chung
export { default } from "@/features/dashboard/pages/AdminDashboardPage"; // tính năng riêng của app
```

Import gói dùng chung theo tên package (`@smarthome/shared/...`, `@smarthome/console/...`); `@/` chỉ trỏ vào `src/` của chính app đó. `user/` không phụ thuộc `@smarthome/console`.

## Lệnh

```bash
npm install                 # chạy ở frontend/ — cài chung cho mọi workspace
npm run dev                 # chạy cả 3 app (Ctrl+C dừng tất cả)
npm run dev:admin           # hoặc dev:operator / dev:user
npm run typecheck           # tsc cho 5 workspace
npm run lint                # eslint toàn bộ
npm run build               # next build cả 3 app
```

Tailwind v4 chỉ tự quét code trong app, nên `src/app/globals.css` của mỗi app khai báo thêm `@source` cho `packages/*`. Khi thêm gói mới, nhớ thêm `@source` tương ứng.

## Docker

`Dockerfile` / `Dockerfile.dev` dùng chung cho cả 3 app, chọn app bằng `--build-arg APP=admin|operator|user`. Trong `docker-compose.yml` có 3 service `frontend-admin`, `frontend-operator`, `frontend-user` (host port 3001/3002/3003). Nginx route theo subdomain: `localhost` / `admin.localhost` → Admin, `operator.localhost` → Operator, `user.localhost` → khách hàng.

## Lưu ý

- Next.js 16 có breaking change so với kiến thức phổ biến — đọc `node_modules/next/dist/docs/` trước khi dùng API chưa chắc (xem `AGENTS.md`).
- Mock store nằm trong bộ nhớ của từng app: thao tác ở app này (VD: khách claim nhà) không hiện sang app khác cho tới khi nối backend thật.
- Chưa có route guard phía server (proxy): auth mock lưu phiên ở `localStorage`, còn `AuthGuard` chặn ở client. Khi chuyển sang cookie `HttpOnly` thật, thêm `src/proxy.ts` cho từng app.
