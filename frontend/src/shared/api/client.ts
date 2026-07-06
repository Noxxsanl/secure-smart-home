import { FetchError } from "./errors";

async function request<T>(
  method: string,
  url: string,
  body?: unknown
): Promise<{ data: T }> {
  const res = await fetch(url, {
    method,
    credentials: "include", // trình duyệt tự gửi kèm cookie HttpOnly token
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Xử lý 401 toàn cục: khi session hết hạn, redirect về login thay vì
  // hiển thị lỗi trên mỗi trang. Loại trừ các endpoint auth để caller tự
  // xử lý 401 của mình (ví dụ: sai mật khẩu trên trang login).
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !url.includes("/api/auth/login") &&
    !url.includes("/api/auth/me")
  ) {
    window.location.href = "/login";
    return { data: undefined as T };
  }

  // Đọc body dưới dạng text trước để thử parse JSON mà không tiêu thụ stream hai lần
  // (res.json() và res.text() không thể cùng gọi trên một response).
  let data: unknown = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new FetchError(res.status, data);
  }

  return { data: data as T };
}

const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  delete: <T = unknown>(url: string, body?: unknown) => request<T>("DELETE", url, body),
};

export default api;
