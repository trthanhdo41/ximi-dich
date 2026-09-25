"use client";

// Trang báo lỗi chung (tiếng Việt) khi có sự cố bất ngờ.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Ối, có lỗi xảy ra</h1>
      <p className="max-w-xs text-fg-2">Nội dung trò chuyện đã được lưu trong máy. Bấm thử lại nhé.</p>
      <button onClick={reset} className="btn-primary h-12 rounded-2xl px-8 font-semibold text-on-accent">
        Thử lại
      </button>
    </main>
  );
}
