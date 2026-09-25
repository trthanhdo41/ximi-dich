"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

// Ví dụ chạy thử trên màn hình chờ, để người dùng hiểu app làm gì mà không cần đọc hướng dẫn.
const EXAMPLES = [
  { zh: "我们下周一开会，大家准备一下。", vi: "Thứ Hai tuần sau họp, mọi người chuẩn bị nhé." },
  { zh: "这批货周五之前一定要发出去。", vi: "Lô hàng này nhất định phải gửi đi trước thứ Sáu." },
  { zh: "价格方面还可以再谈。", vi: "Về giá cả thì vẫn có thể bàn thêm." },
];

export function DemoCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), 4200);
    return () => clearInterval(t);
  }, []);
  const ex = EXAMPLES[i];
  const chars = Array.from(ex.zh);

  return (
    <div className="relative h-[124px] w-full max-w-[20rem]">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -40, rotate: -3, scale: 0.94 }}
          animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="absolute inset-x-0 top-0 rounded-[22px] rounded-tl-md bg-surface px-4 py-3 text-left ring-1 ring-line"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
            <span className="size-1.5 rounded-full bg-warn" />
            Ví dụ · Sếp nói
          </div>
          <p className="mt-1 font-zh text-[13px] text-fg-2">
            {chars.map((ch, k) => (
              <motion.span
                key={k}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 + k * 0.03 }}
              >
                {ch}
              </motion.span>
            ))}
          </p>
          <motion.p
            className="mt-1 text-[17px] leading-snug font-medium text-fg"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + chars.length * 0.03, duration: 0.5 }}
          >
            {ex.vi}
          </motion.p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
