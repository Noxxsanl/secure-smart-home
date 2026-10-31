# Frontend — 3 app web theo role

Monorepo npm workspaces theo kiểu micro-frontend: 3 app Next.js 16 mỏng (mỗi role hệ thống một app, chỉ có route + layout + config) ghép từ các **module nghiệp vụ** đóng gói thành package riêng (`@shh/devices`, `@shh/homes`, …) trên nền `@shh/ui`, `@shh/api-client`, `@shh/utils`. Các app gọi **API thật** của backend: Admin/Operator qua `/api/dashboard/**`, cổng khách hàng qua `/api/portal/**`. Chỉ còn vài màn hình dùng mock — xem [Còn là mock](#còn-là-mock).

| App | Thư mục | Package | Cổng dev | Role | Cookie phiên | Kênh API | Tài khoản demo |
|---|---|---|---|---|---|---|---|
| Admin console | `apps/admin/` | `@shh/admin` | http://localhost:3001 | `ADMIN` | `sh_admin` | `/api/dashboard/**` | `admin / admin123` |
| Operator console | `apps/operator/` | `@shh/operator` | http://localhost:3002 | `OPERATOR` | `sh_operator` | `/api/dashboard/**` | `operator01 / operator123` |
| Cổng khách hàng | `apps/user/` | `@shh/user` | http://localhost:3003 | `USER` | `sh_user` | `/api/portal/**` | `user01@smarthome.local / user123` |

Mỗi app chỉ nhận phiên đúng role của mình: đăng nhập nhầm cổng bị từ chối, kèm hướng dẫn sang đúng cổng. Tài khoản khách hàng không đăng nhập được Admin/Operator (backend trả `USE_MOBILE_APP`, FR-1.4) — họ dùng cổng khách hàng hoặc app di động.

## Cấu trúc

```
frontend/
├── package.json                workspaces: apps/*, packages/*, packages/modules/* + script chung
├── eslint.config.mjs           lint toàn workspace
├── scripts/
│   ├── dev-all.mjs             chạy cả 3 app
│   └── check-architecture.mjs  kiểm quy tắc phụ thuộc (npm run check:arch)
├── apps/                       chỉ route, layout, config — không gọi API, không chứa logic nghiệp vụ
│   ├── admin/                  Dashboard, Smart Homes, …, Team / Operator Access / Settings (chỉ Admin)
│   ├── operator/               như Admin nhưng không có Team/Settings, chỉ 5 loại log
│   └── user/                   cổng khách hàng: Tổng quan, Phòng, Thiết bị, Tự động hoá, Thông báo, Thành viên, …
└── packages/
    ├── config/                 @shh/config      tsconfig.base.json
    ├── utils/                  @shh/utils       cn, định dạng ngày/giờ/nhiệt độ, hook nhỏ (debounce, now), parseRouteId
    ├── api-client/             @shh/api-client  http.ts (api() — cookie, X-Portal, 401) + FetchError
    │   └── src/{dashboard,portal}/  cửa ra theo kênh "@shh/api-client/dashboard" | "/portal":
    │                           client SWR, DTO, câu lỗi tiếng Việt, nhãn enum, khoá/tra cứu dùng chung
    ├── ui/                     @shh/ui          design system + khung giao diện (ShellFrame, NotificationBell,
    │                                            PageStates…) + styles/theme.css (design token)
    └── modules/                mỗi thư mục là một package @shh/<tên>
        ├── auth/               đăng nhập, phiên, guard, quyền console; nhà đang chọn + role trong nhà; hồ sơ
        ├── homes/              Smart Home (console: danh sách, chi tiết, provisioning) · tổng quan, phòng,
        │                       thành viên, lời mời, kích hoạt (khách)
        ├── devices/            thiết bị, gateway, bộ mô phỏng · danh sách, chi tiết, điều khiển (khách)
        ├── telemetry/          biểu đồ/bảng số đo cảm biến
        ├── automation/         quy tắc tự động hoá + gợi ý thói quen
        ├── notifications/      trung tâm thông báo (console), thông báo theo nhà (khách)
        ├── audit/              log theo loại + tab Log của Smart Home
        ├── ota/                firmware + triển khai OTA
        ├── users/              khách hàng, Team, quyền truy cập nhà của Operator
        ├── stats/              Dashboard Admin/Operator + huy hiệu sidebar
        ├── ai/                 AI Dashboard (mock)
        └── settings/           cài đặt hệ thống của Admin (mock)
```

### Bên trong một module

```
packages/modules/devices/
├── package.json        "name": "@shh/devices", "exports": { ".": "./src/index.ts" }
└── src/
    ├── index.ts        cửa ra duy nhất: feature + kiểu công khai
    ├── api/            nơi duy nhất gọi API của module: khoá SWR, hàm gọi, hook (useDeviceDetail, useDevicePower, …)
    ├── model/          kiểu, chuyển dữ liệu API → UI, câu lỗi riêng của module
    ├── ui/             component nhận props và hiển thị, không gọi API (DeviceCard, SimulatorControls, …)
    └── features/       mỗi thư mục = một ca sử dụng hoàn chỉnh, có index.ts riêng
        ├── device-list/       (console) danh sách thiết bị
        ├── device-detail/     (console) chi tiết — nhận slot renderTelemetry
        ├── gateway-detail/    (console) chi tiết gateway — nhận slot renderLogs
        ├── home-device-list/  (khách) thiết bị theo phòng của nhà đang chọn
        └── device-grid/       (khách) lưới thẻ có công tắc — trang Tổng quan/Phòng của homes ghép vào
```

Feature của console và của cổng khách cùng domain nằm chung module; feature của khách đặt tiền tố `home-` (`home-device-list`, `home-automation`, …). Mỗi app có `src/config/portal.ts` (role, tên, trang chủ), `src/config/nav.ts` (menu sidebar, nhãn breadcrumb), `src/widgets/PortalShell.tsx` (ghép khung + chuông + huy hiệu) và `src/proxy.ts`. `@/` chỉ trỏ vào `src/` của chính app; trong package dùng đường dẫn tương đối, sang package khác dùng tên package (`@shh/devices`) — không đi sâu vào `src/` của package khác.

### Quy tắc phụ thuộc

Kiểm tự động bằng `npm run check:arch` ([scripts/check-architecture.mjs](scripts/check-architecture.mjs), chạy trong CI):

| Mã | Quy tắc |
|---|---|
| R1 | App chỉ import package qua cửa ra công khai; không import `@shh/api-client` hay `swr` — app không gọi API trực tiếp, không chứa logic nghiệp vụ. |
| R2 | Trong module: `features/` dùng `api/`, `model/`, `ui/` của chính module; `api/` → `api/`, `model/`; `ui/` → `ui/`, `model/` (ui không gọi API); `model/` → `model/`. Ngoài module được dùng `@shh/ui`, `@shh/api-client`, `@shh/utils`. |
| R3 | `features/<a>` không import `features/<b>`, kể cả trong cùng module — cần ghép thì ghép ở trang của app. |
| R4 | Module không import module khác, trừ `@shh/auth` (người dùng hiện tại, nhà đang chọn, role-gate). |
| R5 | `@shh/ui` không import `modules/`; `@shh/api-client` chỉ dùng `@shh/utils`; `@shh/utils` không dùng `@shh/*`. |
| R6 | Sang package khác chỉ qua cửa ra trong `"exports"`; import tương đối không thoát khỏi package. |

Ẩn feature theo vai trò (`usePermissions`, `permissionsFor`) chỉ để giao diện gọn — quyền thật luôn do backend kiểm tra.

**Ghép ở trang của app (slot).** Feature cần phần của module khác thì nhận prop `render*`, trang của app nối hai bên:

```tsx
// apps/admin/src/app/(private)/devices/[id]/page.tsx
"use client";
import { DeviceDetailPage } from "@shh/devices";
import { DeviceTelemetryPanel } from "@shh/telemetry";

export default function Page() {
  return <DeviceDetailPage renderTelemetry={(p) => <DeviceTelemetryPanel {...p} />} />;
}
```

Các slot hiện có: thiết bị ← số đo (`renderTelemetry`, console + khách); gateway ← bảng log và Smart Home ← tab Log (`renderLogs`); Tổng quan/Phòng của khách ← `DeviceGrid` (`renderDevices`); Thành viên ← lời mời của tôi (`invitationsSlot`); màn hình "chưa có nhà" của `HomeGate` ← lời mời (`CurrentHomeProvider noHomeSlot`, ở `apps/user/src/app/(private)/layout.tsx`). Trang không cần ghép thì chỉ re-export: `export { DevicesPage as default } from "@shh/devices";`.

**Lựa chọn có chủ đích** (để giữ R3/R4 mà không chép code):

- *Nhà đang chọn* (`CurrentHomeProvider`, `HomeGate`, `useCurrentOverview`) và ma trận quyền theo role trong nhà (`permissionsFor`) nằm ở `@shh/auth` — đây là role-gate tầng 2 mà mọi module của cổng khách cần.
- Thứ thuộc **hợp đồng API** mà nhiều module cùng cần nằm ở `@shh/api-client` (đóng vai client sinh từ OpenAPI): DTO, nhãn tiếng Việt của enum (`CATEGORY_LABELS`, `logCategoryLabel`, …), tra cứu dùng chung (`useHomeOptions`, `useHomeRooms`, `useCustomerSearch`, `useHomeOverview`) và khoá SWR của tài nguyên mà module khác phải làm mới (`homesKey`, `overviewKey`, `roomsPrefix`, …). Khoá trùng với module sở hữu nên dùng chung cache.
- `@shh/ui` dùng `@shh/api-client` chỉ để đổi lỗi API thành câu tiếng Việt (`PageError`, `ConfirmModal`, `ErrorPanel`).
- Widget có trạng thái dùng ở nhiều feature của cùng module tách thành hook ở `api/` + view ở `ui/`: `useAssignOwner` + `AssignOwnerModal` (3 feature của homes), `useSimulatorControls` + `SimulatorControls` (thiết bị + gateway).

**Khác với kiến trúc tham khảo** (chưa làm, có thể làm dần từng module): dữ liệu vẫn dùng SWR (chưa chuyển TanStack Query), chưa có schema zod; `@shh/api-client` viết tay vì `contracts/openapi.json` còn là bản tạm; chưa có `@shh/realtime` vì web chưa dùng WebSocket (polling); chạy script bằng npm workspaces, không dùng turbo; tên file giữ quy ước cũ (Component PascalCase, hook camelCase).

## Lệnh

```bash
npm install                 # chạy ở frontend/ — cài chung cho mọi workspace
npm run dev                 # chạy cả 3 app (Ctrl+C dừng tất cả)
npm run dev:admin           # hoặc dev:operator / dev:user
npm run typecheck           # tsc cho mọi workspace (3 app + 15 package)
npm run check:arch          # quy tắc phụ thuộc R1–R6 (tuỳ chọn: -- --package devices)
npm run lint                # eslint toàn bộ
npm run build               # next build cả 3 app
```

**Thêm module mới:** tạo `packages/modules/<tên>/` (chép `package.json` + `tsconfig.json` của một module có sẵn, đổi `name`), viết `src/index.ts`, thêm `"@shh/<tên>": "*"` vào `dependencies` của app dùng nó rồi `npm install`. `next.config.ts` tự transpile mọi `@shh/*` theo đồ thị `dependencies`; `globals.css` đã `@source "../../../../packages"` nên Tailwind quét được class trong package mới.

## Chạy với backend thật

1. Chạy backend Express (cổng `5000`, cần PostgreSQL; xem `docs/guides/CHAY_LOCAL.md`). Backend tự seed dữ liệu demo khi `NODE_ENV` khác `production` (hoặc `SEED_DEMO_DATA=true`) — xem bảng tài khoản và mã kích hoạt bên dưới.
2. Chạy frontend: `npm run dev` (hoặc `dev:admin` / `dev:operator` / `dev:user`).
3. Backend ở chỗ khác `http://localhost:5000` thì đặt `BACKEND_URL` (biến môi trường của shell hoặc `frontend/.env.local`), VD `BACKEND_URL=http://192.168.1.10:5000 npm run dev`. Chỉ ghi gốc URL, không kèm `/api`.

> `BACKEND_URL` được đọc lúc `next dev` khởi động và lúc `next build` (rewrites được ghi vào bản build) — đổi giá trị thì khởi động lại / build lại. Khi chạy bằng Docker, nginx route `/api/` thẳng tới backend nên rewrites chỉ là phương án dự phòng.

### Web nói chuyện với backend thế nào

- **Một origin.** Trình duyệt chỉ gọi `/api/*` cùng origin. `next.config.ts` của mỗi app có `rewrites` `/api/:path*` → `${BACKEND_URL ?? "http://localhost:5000"}/api/:path*`, nên không cần CORS và cookie đi kèm tự động.
- **Cookie phiên HttpOnly theo cổng:** `sh_admin`, `sh_operator`, `sh_user`. 3 app dev chạy chung host `localhost` (khác cổng) nên mỗi role một tên cookie để không ghi đè phiên của nhau. JS phía client không đọc được token.
- **Header `X-Portal: admin|operator|user`** do `packages/api-client/src/http.ts` gắn vào MỌI request. Backend dùng nó để chọn cookie của đúng cổng, đồng thời coi đó là lớp chống CSRF: request ghi (POST/PUT/PATCH/DELETE) thiếu header bị từ chối `403 CSRF_CHECK_FAILED`.
- **Lỗi** ném `FetchError(status, body)`, `body.error` là mã lỗi backend. UI luôn đổi sang câu hướng dẫn tiếng Việt (`errorMessage` / `portalErrorMessage` của `@shh/api-client/dashboard|portal`, lỗi đăng nhập ở `packages/modules/auth/src/model/errors.ts`), không hiện mã thô. `401` ở request thường → `AuthProvider` kết thúc phiên và đưa về `/login?reauth=expired`.
- **`src/proxy.ts`** (Next 16 `proxy`, dùng `createSessionProxy` từ `@shh/auth/proxy`) là cổng UX: chưa có cookie phiên mà vào trang riêng tư → chuyển `/login`; đã có cookie mà vào `/login` (hoặc `/register` ở cổng khách) → chuyển trang chủ; bỏ qua `/api`, `/_next` và file tĩnh. Proxy **không xác thực** — backend kiểm tra JWT ở mọi request `/api/**`; cookie giả/hết hạn vẫn nhận 401 và bị đưa về trang đăng nhập (`?reauth=` chặn vòng lặp chuyển hướng).
- **Không có WebSocket trên web.** Dữ liệu cập nhật bằng polling SWR: tổng quan nhà / thiết bị 5 s, thông báo 15 s, log 30 s, danh sách console 10 s. Mobile mới dùng WebSocket.
- Cổng khách: cache SWR riêng cho mỗi lần đăng nhập (`PortalSwrProvider` của `@shh/auth`) để tài khoản đăng nhập sau không thấy dữ liệu của tài khoản trước.

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

- **AI dashboard** (`@shh/ai`, dữ liệu ở `packages/modules/ai/src/model/mockData.ts`) — chưa có API; doc [Backend](../docs/architecture/BACKEND_REFACTOR_SMARTHOME.md) §18. Khi có API: thêm hook ở `api/`, bỏ `mockData.ts`, không cần sửa app.
- **Cài đặt hệ thống của Admin** (`@shh/settings`) — chưa có API, giá trị hiển thị cố định trong component.

## Việc còn lại

Chuyển từ nhật ký tiến độ cũ (`docs/06_FRONTEND_REFACTOR_PROGRESS.md`, đã gỡ — còn trong lịch sử git). Thiết kế đích ở [Frontend](../docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md).

- **Responsive mobile** ([Frontend](../docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md) §16.2, Phase 8): Sidebar mới chỉ collapse icon-only, chưa có chế độ hamburger + overlay trên màn hẹp; bảng mật độ cao (Logs, Gateways) chưa chuyển sang dạng card.
- **Trang đăng nhập console** ([Frontend](../docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md) §9.15): chưa có dòng "Cổng quản trị nội bộ — khách hàng dùng Mobile App". Tài khoản khách đăng nhập nhầm cổng vẫn nhận hướng dẫn (`packages/modules/auth/src/model/errors.ts`).
- **Gán thiết bị đã có vào phòng** ([Frontend](../docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md) §9.5): tab Rooms của Smart Home Detail chỉ xem thiết bị theo phòng; thiết bị mới chỉ tạo được qua Provisioning Wizard.
- **Biểu đồ theo `sensor_type`** ([Frontend](../docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md) §9.6): `packages/modules/telemetry/src/ui/TelemetryChart.tsx` vẫn chỉ vẽ 2 trường cố định `temperature`/`humidity`.
- **Automation kéo-thả** ([Frontend](../docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md) §9.12, Phase 9): chưa làm, đúng khuyến nghị — chỉ đầu tư khi tập trigger/action đã phong phú hơn form IF/THEN.

**Lệch PRD:** app `apps/user/` (cổng web khách hàng) nằm ngoài phạm vi PRD V2 — `docs/PRD_SMART_HOME.md` §2.2 và FR-1.4 quy định khách hàng chỉ dùng Mobile. App được làm theo yêu cầu trực tiếp; nếu giữ hướng này cần cập nhật PRD và `docs/SMART_HOME_PRODUCT_ARCHITECTURE.md`, `docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md`.

## Docker

`Dockerfile` / `Dockerfile.dev` dùng chung cho cả 3 app, chọn app bằng `--build-arg APP=admin|operator|user` (build `apps/<APP>`; stage `manifests` chỉ gom `package.json` của mọi workspace nên layer `npm ci` không chạy lại khi chỉ sửa code). Trong `compose.yaml` có 3 service `frontend-admin`, `frontend-operator`, `frontend-user` (host port 3001/3002/3003). Nginx route theo subdomain: `localhost` / `admin.localhost` → Admin, `operator.localhost` → Operator, `user.localhost` → khách hàng; `/api/` → backend.

Compose dev bind-mount `frontend/` và giữ `node_modules` trong anonymous volume: sau khi đổi phụ thuộc (thêm module, đổi `package.json`) chạy `docker compose up --build --renew-anon-volumes` (hoặc `make dev`), nếu không container vẫn dùng `node_modules` cũ và báo thiếu `@shh/*`. Image production chạy bằng user `node`, chỉ chứa output standalone (`apps/<APP>/server.js`); `BACKEND_URL` cho rewrites là build arg (mặc định `http://backend:5000`).

## Lưu ý

- Next.js 16 có breaking change so với kiến thức phổ biến — đọc `node_modules/next/dist/docs/` trước khi dùng API chưa chắc (xem `AGENTS.md`). `middleware` đã đổi tên thành `proxy` (`src/proxy.ts`).
- Không bao giờ hiển thị secret thiết bị / gateway và không log mật khẩu, token (CLAUDE.md, bất biến 1–2). Activation Code của khách chỉ nằm trong state của trang Thêm Smart Home, không lưu và không ghi log.
- Lỗi hiển thị bằng câu hướng dẫn tiếng Việt (NFR-U2), không mã thô.
- Dev server (`next dev`) và `next build` dùng chung thư mục app — đừng build khi dev server đang chạy cùng app.
