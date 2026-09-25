// Xuất cuộc họp thành biên bản Markdown (tải file .md, chia sẻ qua Zalo/Messenger, hoặc chép).

import { langName } from "@/lib/languages";
import type { SavedMeeting } from "./storage";
import { formatClock, speakerName, toPlainText } from "./summary";

export function meetingTitle(m: SavedMeeting) {
  const d = new Date(m.startedAt);
  const date = d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  return `Trò chuyện · ${date} · ${formatClock(m.startedAt, false)}`;
}

/** Khoảng giờ từ câu đầu đến câu cuối, vd. "18:42 – 19:30". */
export function meetingSpan(m: SavedMeeting) {
  const times = m.segments.map((s) => s.at).filter((t): t is number => !!t);
  const start = times.length ? Math.min(...times) : m.startedAt;
  const end = times.length ? Math.max(...times) : m.updatedAt;
  return { start, end, text: `${formatClock(start, false)} – ${formatClock(end, false)}` };
}

export function meetingToMarkdown(m: SavedMeeting): string {
  const lines: string[] = [`# ${meetingTitle(m)}`, "", `Thời gian: ${meetingSpan(m).text}`, ""];
  if (m.summary?.vi) {
    lines.push("## Tóm tắt", "", m.summary.vi.replace(/^## /gm, "### "), "");
  }
  const starred = m.segments.filter((s) => s.starred);
  if (starred.length) {
    lines.push("## Câu đã đánh dấu quan trọng", "");
    for (const s of starred) lines.push(`- ${s.at ? `[${formatClock(s.at)}] ` : ""}${s.translationFinal || s.originalFinal}`);
    lines.push("");
  }
  lines.push("## Toàn bộ nội dung", "");
  for (const s of m.segments) {
    const who = speakerName(s.speaker, m.speakers) ?? langName(s.language);
    const time = s.at ? `[${formatClock(s.at)}] ` : "";
    lines.push(`**${time}${who}${s.starred ? " (quan trọng)" : ""}:** ${s.originalFinal}`);
    if (s.translationFinal) lines.push(`> ${s.translationFinal}`);
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export function downloadMarkdown(m: SavedMeeting) {
  const d = new Date(m.startedAt);
  const name = `bien-ban-hop-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.md`;
  const url = URL.createObjectURL(new Blob([meetingToMarkdown(m)], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Chia sẻ qua bảng chia sẻ của điện thoại (Zalo, Messenger…). Trả về false nếu máy không hỗ trợ. */
export async function shareMeeting(m: SavedMeeting): Promise<"shared" | "cancelled" | "unsupported"> {
  const text = toPlainText(meetingToMarkdown(m).replace(/^# /gm, "").replace(/^> /gm, "   → "));
  if (!navigator.share) return "unsupported";
  try {
    await navigator.share({ title: meetingTitle(m), text });
    return "shared";
  } catch {
    return "cancelled";
  }
}
