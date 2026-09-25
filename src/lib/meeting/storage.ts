// Lưu cuộc họp vào localStorage của trình duyệt (không cần server/database).
// - "Cuộc họp hiện tại" được lưu liên tục, tải lại trang không mất chữ.
// - Bấm "Cuộc họp mới" thì cuộc cũ được cất vào lịch sử (giữ tối đa 30 cuộc).

import type { Segment } from "@/lib/soniox/segments";

const CURRENT_KEY = "meeting.current.v1";
const HISTORY_KEY = "meeting.history.v1";
const MAX_HISTORY = 30;

export type SavedSummary = {
  vi: string;
  /** Bản tóm tắt dịch sang tiếng của đối tác (tên trường giữ "zh" cho dữ liệu cũ). */
  zh: string;
  /** Mã ngôn ngữ của bản `zh` (không có = tiếng Trung). */
  zhLang?: string;
  at: number | null;
  count: number;
  inProgress: boolean;
  /** Id câu cuối cùng đã được tóm tắt (để lần sau chỉ gửi phần mới). */
  coveredId?: number;
};

export type SavedMeeting = {
  id: string;
  startedAt: number;
  updatedAt: number;
  segments: Segment[];
  summary?: SavedSummary;
  /** Tên người dùng đặt cho từng người nói ("1" → "Sếp Vương"). */
  speakers?: Record<string, string>;
  /** Giới tính người dùng chọn cho từng người nói (ghi đè kết quả tự đoán theo giọng). */
  genders?: Record<string, "male" | "female">;
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Ghi; nếu bộ nhớ đầy thì bỏ bớt cuộc họp cũ nhất trong lịch sử rồi thử lại. */
function write(key: string, value: unknown): boolean {
  const json = JSON.stringify(value);
  for (let attempt = 0; attempt < MAX_HISTORY; attempt++) {
    try {
      localStorage.setItem(key, json);
      return true;
    } catch (e) {
      if ((e as { name?: string }).name !== "QuotaExceededError") return false;
      const history = read<SavedMeeting[]>(HISTORY_KEY) ?? [];
      if (!history.length) return false;
      history.shift();
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch {
        return false;
      }
    }
  }
  return false;
}

export function newMeetingId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadCurrent(): SavedMeeting | null {
  const m = read<SavedMeeting>(CURRENT_KEY);
  return m && Array.isArray(m.segments) ? m : null;
}

export function saveCurrent(m: SavedMeeting): boolean {
  return write(CURRENT_KEY, m);
}

/** Cất cuộc họp hiện tại vào lịch sử và xoá khỏi "hiện tại". */
export function archiveCurrent() {
  const current = loadCurrent();
  if (current?.segments.length) {
    const history = (read<SavedMeeting[]>(HISTORY_KEY) ?? []).filter((m) => m.id !== current.id);
    history.push(current);
    write(HISTORY_KEY, history.slice(-MAX_HISTORY));
  }
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch {
    // bỏ qua
  }
}

export function loadHistory(): SavedMeeting[] {
  return read<SavedMeeting[]>(HISTORY_KEY) ?? [];
}

/** Xoá cuộc họp hiện tại khỏi máy (không cất vào lịch sử). */
export function clearCurrent() {
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch {
    // bỏ qua
  }
}

/** Xoá toàn bộ lịch sử cuộc họp đã cất. */
export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // bỏ qua
  }
}

export function deleteFromHistory(id: string) {
  write(
    HISTORY_KEY,
    loadHistory().filter((m) => m.id !== id),
  );
}
