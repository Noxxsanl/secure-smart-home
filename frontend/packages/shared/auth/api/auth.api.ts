import { FetchError } from "@smarthome/shared/api/errors";
import { mockDelay } from "@smarthome/shared/mock/store";
import type { User, UserRole } from "@smarthome/shared/auth/types";

// Demo accounts — no backend required. Each portal only accepts its own role,
// mirroring FR-1.4 (sai kênh → 403) so a staff session can never be reused on
// the customer portal and vice versa.
const MOCK_ACCOUNTS: { username: string; password: string; user: User }[] = [
  {
    username: "admin", password: "admin123",
    user: { id: 1, username: "admin", role: "admin", display_name: "admin", customer_id: null },
  },
  {
    username: "operator01", password: "operator123",
    user: { id: 2, username: "operator01", role: "operator", display_name: "operator01", customer_id: null },
  },
  {
    username: "user01", password: "user123",
    user: { id: 101, username: "user01", role: "user", display_name: "Nguyễn Hoàng Đạt", customer_id: 1 },
  },
];

export const DEMO_ACCOUNT_HINTS: Record<UserRole, string> = Object.fromEntries(
  MOCK_ACCOUNTS.map((a) => [a.user.role, `${a.username} / ${a.password}`])
) as Record<UserRole, string>;

function storageKey(role: UserRole) {
  return `mock_auth_session:${role}`;
}

function readSession(role: UserRole): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(role));
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    return user.role === role ? user : null;
  } catch {
    return null;
  }
}

export async function login(portalRole: UserRole, username: string, password: string): Promise<User> {
  await mockDelay(undefined, 300);
  const match = MOCK_ACCOUNTS.find((a) => a.username === username && a.password === password);
  if (!match) {
    throw new FetchError(401, { error: "INVALID_CREDENTIALS" });
  }
  if (match.user.role !== portalRole) {
    throw new FetchError(403, { error: "WRONG_PORTAL", role: match.user.role });
  }
  try {
    window.localStorage.setItem(storageKey(portalRole), JSON.stringify(match.user));
  } catch {
    // Storage bị chặn (private mode) — phiên chỉ sống trong bộ nhớ.
  }
  return match.user;
}

export async function logout(portalRole: UserRole): Promise<void> {
  await mockDelay(undefined, 100);
  try {
    window.localStorage.removeItem(storageKey(portalRole));
  } catch {
    // ignore
  }
}

export async function getUser(portalRole: UserRole): Promise<User | null> {
  await mockDelay(undefined, 150);
  return readSession(portalRole);
}
