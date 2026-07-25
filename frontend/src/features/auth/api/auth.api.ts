import { FetchError } from "@/shared/api/errors";
import { mockDelay } from "@/shared/mock/store";
import type { User } from "@/features/auth/types";

const STORAGE_KEY = "mock_auth_session";

// Demo accounts — no backend required. Shown as a hint on the Login page.
const MOCK_ACCOUNTS: { username: string; password: string; user: User }[] = [
  { username: "admin", password: "admin123", user: { id: 1, username: "admin", role: "admin" } },
  { username: "operator01", password: "operator123", user: { id: 2, username: "operator01", role: "operator" } },
];

function readSession(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<User> {
  await mockDelay(undefined, 300);
  const match = MOCK_ACCOUNTS.find((a) => a.username === username && a.password === password);
  if (!match) {
    throw new FetchError(401, { error: "INVALID_CREDENTIALS" });
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(match.user));
  }
  return match.user;
}

export async function logout(): Promise<void> {
  await mockDelay(undefined, 100);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export async function getUser(): Promise<User | null> {
  await mockDelay(undefined, 150);
  return readSession();
}
