// Mọi lỗi hiện cho người dùng đều bằng tiếng Việt, dễ hiểu. Lỗi gốc (thường tiếng Anh) chỉ ghi vào console.

/** Lỗi mà câu thông báo đã là tiếng Việt, được hiện nguyên văn. */
export class VnError extends Error {}

const BY_NAME: Record<string, string> = {
  NotAllowedError:
    "Chưa được phép dùng micro. Trên iPhone: vào Cài đặt → Safari → Micro → chọn Cho phép, rồi mở lại trang.",
  SecurityError: "Trình duyệt chặn micro. Hãy mở app bằng đường dẫn https://",
  NotFoundError: "Không tìm thấy micro trên máy này.",
  NotReadableError: "Micro đang bị ứng dụng khác dùng (cuộc gọi, ghi âm…). Tắt ứng dụng đó rồi thử lại.",
  OverconstrainedError: "Micro của máy không hỗ trợ cách thu âm này.",
  AbortError: "Thao tác đã bị huỷ.",
  EncodingError: "Không đọc được file này. Thử file .m4a, .mp3 hoặc .wav.",
  NotSupportedError: "Trình duyệt này chưa hỗ trợ tính năng cần thiết. Hãy dùng Chrome hoặc Safari mới nhất.",
  QuotaExceededError: "Bộ nhớ của trình duyệt đã đầy.",
  NetworkError: "Không có mạng. Kiểm tra Wi-Fi hoặc 4G rồi thử lại.",
};

export function toVietnamese(error: unknown, fallback = "Có lỗi xảy ra, thử lại nhé."): string {
  if (error instanceof VnError) return error.message;
  const e = error as { name?: string; message?: string } | null;
  if (e?.name && BY_NAME[e.name]) return BY_NAME[e.name];
  // Không có mediaDevices (trang không phải https) → TypeError khi gọi getUserMedia.
  if (e?.name === "TypeError" && /getUserMedia|mediaDevices/i.test(e.message ?? "")) {
    return BY_NAME.SecurityError;
  }
  if (e?.name === "TypeError" && /fetch|network|load failed/i.test(e.message ?? "")) {
    return BY_NAME.NetworkError;
  }
  console.error(error);
  return fallback;
}
