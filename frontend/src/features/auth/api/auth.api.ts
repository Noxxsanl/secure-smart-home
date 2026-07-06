import api from "@/shared/api/client";
import type { User } from "@/features/auth/types";

export async function login(username: string, password: string): Promise<User> {
  const { data } = await api.post<{ user: User }>("/api/auth/login", {
    username,
    password,
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
}

export async function getUser(): Promise<User | null> {
  try {
    const { data } = await api.get<{ user: User }>("/api/auth/me");
    return data.user;
  } catch {
    return null;
  }
}
