"use client";

import { motion } from "motion/react";

const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;
// Dấu câu (Trung + Latin) không được đứng một mình đầu dòng.
const PUNCT = /^[\u3000-\u303f\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65.,!?;:)\]}"'\u00bb\u201d\u2019\u2026]+$/;

/**
 * Tách chữ: tiếng Trung theo từng ký tự, tiếng Việt theo từng từ (giữ khoảng trắng).
 * Dấu câu được dính vào chữ đứng trước. Mỗi phần kèm vị trí bắt đầu để biết đã chốt (final) chưa.
 */
function split(text: string): { w: string; start: number }[] {
  const out: { w: string; start: number }[] = [];
  let offset = 0;
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    for (const w of CJK.test(part) ? Array.from(part) : [part]) {
      const prev = out[out.length - 1];
      if (PUNCT.test(w) && prev && !/^\s+$/.test(prev.w)) prev.w += w;
      else out.push({ w, start: offset });
      offset += w.length;
    }
  }
  return out;
}

// Chỉ vài từ cuối mới cần hiệu ứng; phần trước đã hiện xong → chữ thường cho nhẹ (câu dài không bị đơ).
const ANIMATED_TAIL = 16;

/**
 * Chữ hiện ra từng từ (mờ → rõ, trượt nhẹ lên; không dùng blur để mượt trên điện thoại). Phần chưa chốt (non-final) hiện nhạt rồi đậm dần khi chốt.
 * Khoá theo vị trí nên từ đã hiện không bị vẽ lại khi có chữ mới.
 */
export function RevealText({ final, partial, still }: { final: string; partial: string; still?: boolean }) {
  // Câu đã chốt: chữ thường, không còn hiệu ứng (họp cả tiếng vẫn nhẹ).
  if (still) return <>{final + partial}</>;
  const parts = split(final + partial);
  let from = Math.max(0, parts.length - ANIMATED_TAIL);
  const firstPartial = parts.findIndex((p) => p.start >= final.length);
  if (firstPartial >= 0) from = Math.min(from, firstPartial);
  return (
    <>
      {from > 0 && parts.slice(0, from).map((p) => p.w).join("")}
      {parts.slice(from).map(({ w, start }, j) => {
        const i = from + j;
        if (/^\s+$/.test(w)) return w;
        const settled = start < final.length;
        return (
          <motion.span
            key={i}
            className="inline-block whitespace-pre-wrap"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: settled ? 1 : 0.45, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {w}
          </motion.span>
        );
      })}
    </>
  );
}
