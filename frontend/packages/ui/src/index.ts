// @shh/ui — design system: component trình bày, khung giao diện, class Tailwind dùng chung.
// Không chứa logic nghiệp vụ và không import packages/modules/* (kiểm bằng npm run check:arch).
// Design token: "@shh/ui/theme.css" (app import trong globals.css).

export * from "./classes";

// Thành phần cơ bản
export { Button } from "./components/Button";
export type { ButtonProps } from "./components/Button";
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./components/Dialog";
export { Input } from "./components/Input";
export type { InputProps } from "./components/Input";
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/Select";
export { default as ConfirmDialog } from "./components/ConfirmDialog";
export { default as EmptyState } from "./components/EmptyState";
export { default as FullPageSpinner } from "./components/FullPageSpinner";
export { default as InlineEdit } from "./components/InlineEdit";
export { default as ProgressBar } from "./components/ProgressBar";
export { default as QrCode } from "./components/QrCode";
export { default as SeverityBadge } from "./components/SeverityBadge";
export type { Severity } from "./components/SeverityBadge";
export { default as Skeleton } from "./components/Skeleton";
export { default as StatsCard } from "./components/StatsCard";
export { default as StatusBadge } from "./components/StatusBadge";
export type { StatusKind } from "./components/StatusBadge";
export { default as Stepper } from "./components/Stepper";
export { default as Switch } from "./components/Switch";
export { default as Timeline } from "./components/Timeline";
export type { TimelineItem } from "./components/Timeline";
export { ThemeToggle } from "./components/ThemeToggle";
export { ToastProvider, useToast } from "./components/Toast";

// Khối dựng trang console + trạng thái tải/lỗi (câu lỗi tiếng Việt từ @shh/api-client)
export { default as AccessGrantNotice } from "./components/AccessGrantNotice";
export { default as ConfirmModal } from "./components/ConfirmModal";
export { default as ErrorPanel } from "./components/ErrorPanel";
export { default as InfoCell } from "./components/InfoCell";
export { default as ModalShell } from "./components/ModalShell";
export { default as OnlineIndicator } from "./components/OnlineIndicator";
export { InlineError, LoadErrorBar, PageError, PageLoading } from "./components/PageStates";
export { default as Panel, PanelEmpty } from "./components/Panel";

// Khung giao diện
export { default as ErrorView } from "./layout/ErrorView";
export { default as LoadingView } from "./layout/LoadingView";
export { default as NotFoundView } from "./layout/NotFoundView";
export { default as NotificationBell } from "./layout/NotificationBell";
export type { BellNotification } from "./layout/NotificationBell";
export { default as ShellFrame } from "./layout/ShellFrame";
export { default as ThemeProvider } from "./layout/ThemeProvider";
export { isNavGroup } from "./layout/types";
export type { NavGroup, NavItem, NavLink, NavSection, ShellAccount } from "./layout/types";
