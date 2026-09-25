"use client";

import { motion } from "motion/react";
import type { Signal } from "@/lib/meeting/use-live-translator";

const INFO: Record<Signal, { bars: number; color: string; label: string }> = {
  good: { bars: 4, color: "var(--ok)", label: "Mạng tốt" },
  fair: { bars: 2, color: "var(--warn)", label: "Mạng hơi chậm" },
  weak: { bars: 1, color: "var(--danger)", label: "Mạng yếu" },
  offline: { bars: 0, color: "var(--danger)", label: "Mất mạng" },
};

export function signalLabel(signal: Signal) {
  return INFO[signal].label;
}

/** 4 vạch sóng: xanh = tốt, vàng = hơi chậm, đỏ = yếu/mất mạng. */
export function SignalBars({ signal }: { signal: Signal }) {
  const { bars, color } = INFO[signal];
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" role="img" aria-label={INFO[signal].label}>
      {[0, 1, 2, 3].map((i) => {
        const on = i < bars;
        return (
          <motion.span
            key={i}
            className="w-[3px] rounded-full"
            initial={false}
            animate={{
              height: 4 + i * 2.6,
              backgroundColor: on ? color : "var(--fg-3)",
              opacity: on ? 1 : signal === "offline" ? [0.2, 0.7, 0.2] : 0.35,
            }}
            transition={
              signal === "offline"
                ? { opacity: { duration: 1, repeat: Infinity, delay: i * 0.12 } }
                : { type: "spring", stiffness: 300, damping: 20, delay: i * 0.04 }
            }
          />
        );
      })}
    </span>
  );
}
