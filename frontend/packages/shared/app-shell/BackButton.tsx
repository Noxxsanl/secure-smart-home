"use client";

import { useRouter } from "next/navigation";

// Thay cho <Link href="javascript:history.back()"> — React 19 chặn URL javascript:.
export default function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
    >
      Quay lại
    </button>
  );
}
