import Link from "next/link";
import Image from "next/image";
import BackButton from "@smarthome/shared/app-shell/BackButton";

export default function NotFoundView({ homeHref }: { homeHref: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F6F8FB] px-4 text-gray-900">
      <div className="flex w-full max-w-sm flex-col items-center text-center">

        {/* Illustration — mỗi app có bản sao trong public/ */}
        <Image
          src="/404-not-found.png"
          alt="404 Not Found"
          width={320}
          height={240}
          priority
          className="select-none"
        />

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Lỗi 404
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            Không tìm thấy trang
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Trang bạn đang tìm kiếm không tồn tại<br />hoặc bạn không có quyền truy cập.
          </p>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Link
            href={homeHref}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Về trang chủ
          </Link>
          <BackButton />
        </div>
      </div>
    </main>
  );
}
