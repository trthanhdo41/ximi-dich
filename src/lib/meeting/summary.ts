import type { Segment } from "@/lib/soniox/segments";
import { VnError } from "@/lib/errors";
import { AUTO, getLangPair, langInline, NOTES } from "@/lib/languages";

/** Đánh dấu lỗi giữa dòng stream (mã HTTP không đổi được sau khi đã bắt đầu gửi). */
export const SUMMARY_ERROR_MARK = "@@ERROR@@";

/** Giờ:phút theo giờ máy, vd. "14:32" (thêm giây nếu cần). */
export function formatClock(ms: number, withSeconds = false) {
  return new Date(ms).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
}

/** Tên hiển thị của người nói ("Sếp Vương" nếu đã đặt tên, không thì "Người 1"). */
export type SpeakerNames = Record<string, string>;
export function speakerName(speaker: string | undefined, names?: SpeakerNames) {
  if (!speaker) return undefined;
  return names?.[speaker]?.trim() || `Người ${speaker}`;
}

/** Biến các câu thành bản ghi gọn để gửi AI tóm tắt / gợi ý. */
export function buildTranscript(segments: Segment[], names?: SpeakerNames): string {
  return segments
    .map((s) => {
      const original = (s.originalFinal + s.originalPartial).trim();
      if (!original) return null;
      const who = speakerName(s.speaker, names) ?? "Không rõ";
      const time = `${s.starred ? "⭐ " : ""}${s.at ? `[${formatClock(s.at, false)}] ` : ""}`;
      const lang = langInline(s.language);
      if (s.language === getLangPair().mine) return `${time}${who} (${lang}): ${original}`;
      const vi = (s.translationFinal + s.translationPartial).trim();
      return `${time}${who} (${lang}): ${original}\n  → dịch máy: ${vi || "(chưa dịch)"}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Ngôn ngữ của đối tác trong cuộc họp: theo Cài đặt; chọn "tự nhận" thì lấy thứ tiếng (khác tiếng mình)
 * xuất hiện nhiều nhất trong cuộc họp.
 */
export function partnerOf(segments: Segment[]) {
  const { partner, mine } = getLangPair();
  // Chỉ ghi chép: hai bên cùng nói tiếng của mình.
  if (partner === NOTES) return mine;
  if (partner !== AUTO) return partner;
  const count = new Map<string, number>();
  for (const s of segments) if (s.language && s.language !== mine) count.set(s.language, (count.get(s.language) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "en";
}

export function countSpoken(segments: Segment[]) {
  return segments.filter((s) => (s.originalFinal + s.originalPartial).trim()).length;
}

/** Gọi API AI (mặc định /api/summary) và nhận chữ chạy dần. */
export async function streamSummary(
  body: Record<string, unknown>,
  onText: (text: string) => void,
  signal?: AbortSignal,
  url = "/api/summary",
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new VnError("Không có mạng. Kiểm tra Wi-Fi hoặc 4G rồi thử lại.");
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new VnError(data.error ?? `Lỗi máy chủ (mã ${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const mark = text.indexOf(SUMMARY_ERROR_MARK);
    if (mark >= 0) {
      onText(text.slice(0, mark));
      throw new VnError(text.slice(mark + SUMMARY_ERROR_MARK.length));
    }
    onText(text);
  }
  return text;
}

/** Bỏ ký hiệu Markdown để chép sang Zalo/Messenger cho gọn. */
export function toPlainText(markdown: string) {
  return markdown
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^##\s*/gm, "")
    .replace(/^- /gm, "• ")
    .trim();
}
