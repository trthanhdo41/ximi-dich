import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-fg-2">Đường dẫn này không tồn tại.</p>
      <Link href="/" className="btn-primary grid h-12 place-items-center rounded-2xl px-8 font-semibold text-on-accent">
        Về trang chính
      </Link>
    </main>
  );
}
