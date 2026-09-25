// Tự nhận ra thông tin quan trọng trong câu (ngày giờ, tiền, số lượng, phần trăm) để hiện thành nhãn.
// Chạy ngay trên máy, không tốn tiền AI.

export type Highlight = { kind: "date" | "time" | "money" | "qty" | "percent"; text: string };

// Ranh giới từ có hiểu chữ có dấu (\b của JS chỉ hiểu chữ không dấu nên "12,5 tệ" sẽ bị sót).
const END = String.raw`(?![\p{L}\d])`;
const P = (src: string) => new RegExp(src, "giu");

const PATTERNS: [Highlight["kind"], RegExp][] = [
  ["date", P(String.raw`(thứ\s+(hai|ba|tư|năm|sáu|bảy)|chủ\s+nhật)(\s+tuần\s+(này|sau|tới))?` + END)],
  ["date", P(String.raw`(ngày\s+\d{1,2}(\s*(\/|tháng)\s*\d{1,2})?|\d{1,2}\/\d{1,2}(\/\d{2,4})?|tháng\s+(sau|tới|\d{1,2})|tuần\s+(sau|tới)|ngày\s+mai|cuối\s+tháng|đầu\s+tháng|quý\s+(\d|một|hai|ba|bốn))` + END)],
  ["time", P(String.raw`\d{1,2}(:\d{2}|\s*giờ(\s*\d{1,2}(\s*phút)?)?)(\s*(sáng|trưa|chiều|tối))?` + END)],
  ["money", P(String.raw`\d[\d.,]*\s*(nhân dân tệ|tệ|đồng|triệu|tỷ|nghìn|vạn|usd|đô(\s*la)?|k)` + END + "|\\$\\s*\\d[\\d.,]*")],
  ["percent", P(String.raw`\d[\d.,]*\s*(%|phần trăm)`)],
  ["qty", P(String.raw`\d[\d.,]*\s*(chiếc|cái|sản phẩm|thùng|tấn|kg|container|đơn|lô|bộ|mét|m2|người)` + END)],
];


export function extractHighlights(text: string, max = 4): Highlight[] {
  if (!text) return [];
  const found: (Highlight & { index: number })[] = [];
  for (const [kind, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const t = m[0].trim();
      const index = m.index ?? 0;
      // Bỏ kết quả trùng/nằm trong kết quả khác (vd. "12,5 tệ" và "12,5").
      if (found.some((f) => Math.abs(f.index - index) < Math.max(f.text.length, t.length) && (f.text.includes(t) || t.includes(f.text)))) continue;
      found.push({ kind, text: t, index });
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .slice(0, max)
    .map(({ kind, text }) => ({ kind, text }));
}

/** Câu có nhắc tới tên người dùng không (so khớp không phân biệt hoa thường). */
export function mentions(text: string, names: string[]) {
  if (!text || !names.length) return false;
  const lower = text.toLowerCase();
  return names.some((n) => n && lower.includes(n.toLowerCase()));
}

export function parseNames(raw: string): string[] {
  return raw
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
