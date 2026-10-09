# Frontend — 3 app web theo role

npm workspaces gồm 3 app Next.js 16 độc lập (mỗi role hệ thống một app) và 2 gói code dùng chung. Các app gọi **API thật** của backend: Admin/Operator qua `/api/dashboard/**`, cổng khách hàng qua `/api/portal/**`. Chỉ còn vài màn hình dùng mock — xem [Còn là mock](#còn-là-mock).

| App | Thư mục | Cổng dev | Role | Cookie phiên | Kênh API | Tài khoản demo |
|---|---|---|---|---|---|---|
| Admin console | `admin/` | http://localhost:3001 | `ADMIN` | `sh_admin` | `/api/dashboard/**` | `admin / admin123` |
| Operator console | `operator/` | http://localhost:3002 | `OPERATOR` | `sh_operator` | `/api/dashboard/**` | `operator01 / operator123` |
| Cổng khách hàng | `user/` | http://localhost:3003 | `USER` | `sh_user` | `/api/portal/**` | `user01@smarthome.local / user123` |

Mỗi app chỉ nhận phiên đúng role của mình: đăng nhập nhầm cổng bị từ chối, kèm hướng dẫn sang đúng cổng. Tài khoản khách hàng không đăng nhập được Admin/Operator (backend trả `USE_MOBILE_APP`, FR-1.4) — họ dùng cổng khách hàng hoặc app di động.

## Cấu trúc

```
frontend/
├── package.json            workspaces + script chung
├── tsconfig.base.json      compilerOptions dùng chung
├── eslint.config.mjs       lint toàn workspace
├── packages/
│   ├── shared/             @smarthome/shared — dùng cho cả 3 app
│   │   ├── api/            http.ts (api(), apiFetcher, apiErrorCode — gắn X-Portal) + errors.ts (FetchError)
│   │   ├── app-shell/      ShellFrame, Sidebar, Header, NotificationBell, AppProviders, trang lỗi/404
│   │   ├── auth/           AuthProvider, AuthGuard/GuestGuard, Login, Đăng ký (khách), Quên mật khẩu,
│   │   │                   session.ts (tên cookie, ?reauth=), proxy.ts (helper cho src/proxy.ts), demoAccounts.ts
│   │   ├── mock/           types, seed, store, ai — chỉ còn cho phần còn là mock (xem bên dưới)
│   │   ├── styles/theme.css  design token (light/dark)
│   │   └── ui/             Button, Dialog, Switch, StatusBadge, TelemetryChart, InlineEdit, ...
│   └── console/            @smarthome/console — tính năng dùng chung Admin + Operator (gọi /api/dashboard/**)
│       ├── shell/ConsoleShell.tsx   khung + badge + chuông thông báo staff
│       ├── auth/usePermissions.ts   quyền theo role của console
│       └── smart-homes, customers, gateways, devices, ota, automation, logs, notifications, ai
├── admin/                  route + dashboard Admin + Team/Operator Access/Settings (chỉ Admin)
├── operator/               route + dashboard Operator (không có Team/Settings, chỉ 5 loại log)
└── user/                   cổng khách hàng: Tổng quan, Phòng, Thiết bị, Tự động hoá, Thông báo, Thành viên, Thêm Smart Home, Hồ sơ
    └── src/lib/api/        lớp gọi /api/portal/** (types.ts = DTO, client.ts = SWR + polling, mỗi nhóm endpoint một file)
```

Mỗi app có `src/config/portal.ts` (role, tên, trang chủ), `src/config/nav.ts` (menu sidebar) và `src/proxy.ts`. Route file chỉ re-export page:

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

## Chạy với backend thật

1. Chạy backend Express (cổng `5000`, cần MySQL; xem `docs/11_CHAY_LOCAL.md`). Backend tự seed dữ liệu demo khi `NODE_ENV` khác `production` (hoặc `SEED_DEMO_DATA=true`) — xem bảng tài khoản và mã kích hoạt bên dưới.
2. Chạy frontend: `npm run dev` (hoặc `dev:admin` / `dev:operator` / `dev:user`).
3. Backend ở chỗ khác `http://localhost:5000` thì đặt `BACKEND_URL` (biến môi trường của shell hoặc `frontend/.env.local`), VD `BACKEND_URL=http://192.168.1.10:5000 npm run dev`. Chỉ ghi gốc URL, không kèm `/api`.

> `BACKEND_URL` được đọc lúc `next dev` khởi động và lúc `next build` (rewrites được ghi vào bản build) — đổi giá trị thì khởi động lại / build lại. Khi chạy bằng Docker, nginx route `/api/` thẳng tới backend nên rewrites chỉ là phương án dự phòng.

### Web nói chuyện với backend thế nào

- **Một origin.** Trình duyệt chỉ gọi `/api/*` cùng origin. `next.config.ts` của mỗi app có `rewrites` `/api/:path*` → `${BACKEND_URL ?? "http://localhost:5000"}/api/:path*`, nên không cần CORS và cookie đi kèm tự động.
- **Cookie phiên HttpOnly theo cổng:** `sh_admin`, `sh_operator`, `sh_user`. 3 app dev chạy chung host `localhost` (khác cổng) nên mỗi role một tên cookie để không ghi đè phiên của nhau. JS phía client không đọc được token.
- **Header `X-Portal: admin|operator|user`** do `packages/shared/api/http.ts` gắn vào MỌI request. Backend dùng nó để chọn cookie của đúng cổng, đồng thời coi đó là lớp chống CSRF: request ghi (POST/PUT/PATCH/DELETE) thiếu header bị từ chối `403 CSRF_CHECK_FAILED`.
- **Lỗi** ném `FetchError(status, body)`, `body.error` là mã lỗi backend. UI luôn đổi sang câu hướng dẫn tiếng Việt (`user/src/lib/errors.ts`, `packages/shared/auth/errors.ts`), không hiện mã thô. `401` ở request thường → `AuthProvider` kết thúc phiên và đưa về `/login?reauth=expired`.
- **`src/proxy.ts`** (Next 16 `proxy`, dùng `packages/shared/auth/proxy.ts`) là cổng UX: chưa có cookie phiên mà vào trang riêng tư → chuyển `/login`; đã có cookie mà vào `/login` (hoặc `/register` ở cổng khách) → chuyển trang chủ; bỏ qua `/api`, `/_next` và file tĩnh. Proxy **không xác thực** — backend kiểm tra JWT ở mọi request `/api/**`; cookie giả/hết hạn vẫn nhận 401 và bị đưa về trang đăng nhập (`?reauth=` chặn vòng lặp chuyển hướng).
- **Không có WebSocket trên web.** Dữ liệu cập nhật bằng polling SWR: tổng quan nhà / thiết bị 5 s, thông báo 15 s, log 30 s, danh sách console 10 s. Mobile mới dùng WebSocket.
- Cổng khách: cache SWR riêng cho mỗi lần đăng nhập (`user/src/lib/api/PortalSwrProvider.tsx`) để tài khoản đăng nhập sau không thấy dữ liệu của tài khoản trước.

### Tài khoản demo và mã kích hoạt (backend seed — `CONTRACT_V2 §8`)

| Cổng | Tài khoản | Mật khẩu |
|---|---|---|
| Admin | `admin` | `admin123` |
| Operator | `operator01`, `operator02` | `operator123` |
| Khách hàng | `user01@smarthome.local` (Nguyễn Hoàng Đạt, `dat#4821`) | `user123` |
| Khách hàng | `lan@smarthome.local` (Trần Thị Lan — CONTROLLER nhà của Đạt) | `user123` |
| Khách hàng | `hoa@smarthome.local` (Phạm Thị Hoa — VIEWER nhà của Đạt) | `user123` |
| Khách hàng | `hung@smarthome.local` (Lê Văn Hùng — chủ "Nhà Quận 7") | `user123` |
| Khách hàng | `kimanh@smarthome.local` (Ngô Kim Anh, `kimanh#1560` — chưa có nhà, dùng để thử claim / operator gán nhà) | `user123` |

Activation Code để thử trang **Thêm Smart Home** (nhập chữ thường, thiếu dấu gạch đều được):

| Mã | Kết quả |
|---|---|
| `7K2M-9QXA-4TPB` | hợp lệ — "Kit KIT_A #0003" |
| `H3VD-8NRW-2CYE` | hợp lệ — "Kit KIT_B #0004" |
| `Q4ZT-6MJK-1PSX` | đã dùng (Nhà Quận 7) → "Mã này đã được dùng…" |
| `B9FE-3WRA-7GMK` | hết hạn → "Mã kích hoạt đã hết hạn…" |
| mã bất kỳ khác | không tồn tại; nhập sai ≥ 5 lần / 15 phút bị khoá tạm (`RATE_LIMITED`) |

Muốn thử lời mời Khách: đăng nhập `user01`, vào **Thành viên** — nhà demo đã có sẵn lời mời `minh@smarthome.local` (GUEST, chỉ Đèn phòng khách).

## Còn là mock

Dữ liệu các phần này vẫn lấy từ `packages/shared/mock/` (trong bộ nhớ từng app, tải lại trang là về seed):

- **AI dashboard** (`packages/console/ai`, `packages/shared/mock/ai.ts`) — chưa có API; doc `03` §18.
- **Cài đặt hệ thống của Admin** (`admin/src/features/settings`) — chưa có API.

`packages/shared/mock/portal.ts` (API giả kênh khách hàng cũ) không còn được import ở đâu nữa — có thể xoá khi dọn mock.

## Việc còn lại

Chuyển từ nhật ký tiến độ cũ (`docs/06_FRONTEND_REFACTOR_PROGRESS.md`, đã gỡ — còn trong lịch sử git). Thiết kế đích ở [`docs/05`](../docs/05_FRONTEND_REFACTOR_SMARTHOME.md).

- **Responsive mobile** (`05` §16.2, Phase 8): Sidebar mới chỉ collapse icon-only, chưa có chế độ hamburger + overlay trên màn hẹp; bảng mật độ cao (Logs, Gateways) chưa chuyển sang dạng card.
- **Trang đăng nhập console** (`05` §9.15): chưa có dòng "Cổng quản trị nội bộ — khách hàng dùng Mobile App". Tài khoản khách đăng nhập nhầm cổng vẫn nhận hướng dẫn (`packages/shared/auth/errors.ts`).
- **Gán thiết bị đã có vào phòng** (`05` §9.5): tab Rooms của Smart Home Detail chỉ xem thiết bị theo phòng; thiết bị mới chỉ tạo được qua Provisioning Wizard.
- **Biểu đồ theo `sensor_type`** (`05` §9.6): `packages/shared/ui/TelemetryChart.tsx` vẫn chỉ vẽ 2 trường cố định `temperature`/`humidity`.
- **Automation kéo-thả** (`05` §9.12, Phase 9): chưa làm, đúng khuyến nghị — chỉ đầu tư khi tập trigger/action đã phong phú hơn form IF/THEN.

**Lệch PRD:** app `user/` (cổng web khách hàng) nằm ngoài phạm vi PRD V2 — `docs/13` §2.2 và FR-1.4 quy định khách hàng chỉ dùng Mobile. App được làm theo yêu cầu trực tiếp; nếu giữ hướng này cần cập nhật PRD và `docs/01`, `docs/05`.

## Docker

`Dockerfile` / `Dockerfile.dev` dùng chung cho cả 3 app, chọn app bằng `--build-arg APP=admin|operator|user`. Trong `docker-compose.yml` có 3 service `frontend-admin`, `frontend-operator`, `frontend-user` (host port 3001/3002/3003). Nginx route theo subdomain: `localhost` / `admin.localhost` → Admin, `operator.localhost` → Operator, `user.localhost` → khách hàng; `/api/` → backend.

## Lưu ý

- Next.js 16 có breaking change so với kiến thức phổ biến — đọc `node_modules/next/dist/docs/` trước khi dùng API chưa chắc (xem `AGENTS.md`). `middleware` đã đổi tên thành `proxy` (`src/proxy.ts`).
- Không bao giờ hiển thị secret thiết bị / gateway và không log mật khẩu, token (CLAUDE.md, bất biến 1–2). Activation Code của khách chỉ nằm trong state của trang Thêm Smart Home, không lưu và không ghi log.
- Lỗi hiển thị bằng câu hướng dẫn tiếng Việt (NFR-U2), không mã thô.
- Dev server (`next dev`) và `next build` dùng chung thư mục app — đừng build khi dev server đang chạy cùng app.
