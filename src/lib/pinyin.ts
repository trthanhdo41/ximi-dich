"use client";

// Phiên âm pinyin cho câu tiếng Trung (thư viện pinyin-pro, chạy ngay trên máy, không tốn tiền/mạng).
// Chỉ tải thư viện (~140KB) khi người dùng bật pinyin.

import { useEffect, useState } from "react";

const PUNCT: Record<string, string> = { "，": ",", "。": ".", "！": "!", "？": "?", "、": ",", "；": ";", "：": ":" };

let convert: ((text: string) => string) | null = null;
let loading: Promise<void> | null = null;

export function loadPinyin() {
  loading ??= import("pinyin-pro").then(({ pinyin }) => {
    convert = (text) =>
      pinyin(text, { toneType: "symbol", nonZh: "consecutive" })
        // Dấu câu tiếng Trung → dấu thường, dính vào chữ trước; bỏ khoảng trắng thừa.
        .replace(/[，。！？、；：]/g, (c) => PUNCT[c] ?? c)
        .replace(/\s*([,.!?;:])(?!\d)\s*/g, "$1 ")
        .replace(/\s+/g, " ")
        .trim();
  });
  return loading;
}

/** Pinyin của câu (chuỗi rỗng nếu thư viện chưa tải xong). */
export function toPinyin(text: string) {
  return convert && text ? convert(text) : "";
}

/** Tải thư viện khi `enabled`; trả về true khi đã sẵn sàng. */
export function usePinyinReady(enabled: boolean) {
  const [ready, setReady] = useState(() => convert !== null);
  useEffect(() => {
    if (!enabled || convert) return;
    let alive = true;
    void loadPinyin().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled && (ready || convert !== null);
}
