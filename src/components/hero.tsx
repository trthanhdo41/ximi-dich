"use client";

// Màn chờ (chưa họp): tối giản, một hành động chính.
// Sóng âm nền chạy ngang qua nút micro.

import { AUTO, getLangPair, langInline } from "@/lib/languages";
import { motion, useMotionValue } from "motion/react";
import type { LiveState } from "@/lib/meeting/use-live-translator";
import { MicButton } from "./mic-button";
import { LiveWave } from "./live-wave";
import { Credit } from "./brand";


const spring = { type: "spring", stiffness: 260, damping: 26 } as const;

export function Hero({ state, onPress }: { state: LiveState; onPress: () => void }) {
  const level = useMotionValue(0);
  const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: spring } };
  return (
    <motion.div
      className="no-scrollbar absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 pb-20 text-center"
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, scale: 0.98 }}
      variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
    >
      {/* Micro + sóng âm nền */}
      <motion.div variants={item} className="relative grid w-full place-items-center">
        <div className="pointer-events-none absolute inset-x-[-24px] top-1/2 -translate-y-1/2">
          <LiveWave analyser={null} level={level} active={false} ambient height={170} />
        </div>
        <MicButton state={state} level={level} size="hero" onPress={onPress} />
      </motion.div>

      <motion.h1 variants={item} className="mt-12 text-[27px] leading-tight font-bold tracking-tight text-fg">
        Chạm để bắt đầu nghe
      </motion.h1>
      <motion.p variants={item} className="mt-2 max-w-[19rem] text-[15px] leading-relaxed text-fg-2">
        Đặt điện thoại giữa hai người — người kia nói {partnerText()}, app dịch và đọc cho cả hai bên.
      </motion.p>


      <motion.div variants={item} className="absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Credit prefix="made by" />
      </motion.div>
    </motion.div>
  );
}

/** "tiếng Trung", "tiếng Anh"… hoặc "tiếng nước ngoài" khi để tự nhận. */
function partnerText() {
  const { partner } = getLangPair();
  return partner === AUTO ? "tiếng nước ngoài" : langInline(partner);
}
