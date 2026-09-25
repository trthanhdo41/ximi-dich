"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { BRAND } from "@/lib/brand";
import { Seal } from "./brand";

const SPLASH_MS = 2300;

/** Màn mở đầu: con dấu đóng xuống, mực loang, tên app và chữ ký tác giả hiện ra. Chạm để bỏ qua. */
export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  const title = BRAND.appName.split(" ");
  const author = Array.from(BRAND.author);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex cursor-pointer flex-col items-center justify-center bg-bg"
      onClick={onDone}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative grid place-items-center">
        {/* Mực loang khi con dấu chạm giấy */}
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute size-24 rounded-[26%] border-2"
            style={{ borderColor: "var(--accent-strong)" }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 2.6 + i * 0.5], opacity: [0, 0.55 - i * 0.15, 0] }}
            transition={{ duration: 1.3, delay: 0.42 + i * 0.12, ease: "easeOut" }}
          />
        ))}
        <motion.div
          initial={{ scale: 2.8, opacity: 0, rotate: -24, y: -30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 17, mass: 1.1, delay: 0.12 }}
        >
          <Seal size={96} />
        </motion.div>
      </div>

      <h1 className="mt-12 flex gap-2.5 text-[32px] font-bold tracking-tight">
        {title.map((word, i) => (
          <motion.span
            key={i}
            className=""
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.75 + i * 0.09 }}
          >
            {word}
          </motion.span>
        ))}
      </h1>
      <motion.p
        className="mt-2 text-[15px] text-fg-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.05, duration: 0.5 }}
      >
        {BRAND.tagline}
      </motion.p>

      <div className="absolute inset-x-0 bottom-[max(2.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
        <motion.span
          className="text-[12px] text-fg-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.25 }}
        >
          made by
        </motion.span>
        <div className="flex text-[15px] font-semibold">
          {author.map((ch, i) => (
            <motion.span
              key={i}
              className={ch === " " ? "w-2" : ""}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.35 + i * 0.035, duration: 0.5 }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
