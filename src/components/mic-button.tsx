"use client";

import { motion, useSpring, useTransform, type MotionValue } from "motion/react";
import { MicIcon, StopIcon } from "./icons";
import { RadialVisualizer } from "./radial-visualizer";
import type { LiveState } from "@/lib/meeting/use-live-translator";

type Props = {
  state: LiveState;
  level: MotionValue<number>;
  analyser?: AnalyserNode | null;
  size: "hero" | "dock";
  onPress: () => void;
};

export function MicButton({ state, level, analyser, size, onPress }: Props) {
  // Âm lượng giọng nói thường 0.01–0.2 → kéo giãn cho dễ thấy, rồi làm mượt bằng spring.
  const boosted = useTransform(level, (v) => Math.min(1, Math.sqrt(v) * 2.4));
  const smooth = useSpring(boosted, { stiffness: 260, damping: 22, mass: 0.6 });
  const pulse = useTransform(smooth, [0, 1], [1, 1.08]);

  const active = state !== "idle";
  const listening = state === "live";
  const busy = state === "starting" || state === "reconnecting";
  const px = size === "hero" ? 128 : 76;
  const icon = size === "hero" ? "size-12" : "size-8";

  return (
    <motion.div
      layoutId="mic"
      className="relative grid place-items-center"
      style={{ width: px, height: px }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <RadialVisualizer level={level} analyser={analyser} radius={px / 2 + 8} active={listening} />


      {busy && (
        <motion.span
          aria-hidden
          className="absolute -inset-2 rounded-full border-2 border-accent/15 border-t-accent"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
      )}

      <motion.button
        type="button"
        onClick={onPress}
        aria-label={active ? "Dừng nghe" : "Bắt đầu nghe"}
        style={listening ? { scale: pulse } : undefined}
        animate={{ borderRadius: active ? "32%" : "50%", rotate: active ? -3 : 0 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
        className="relative grid size-full place-items-center bg-accent-strong text-on-accent shadow-[0_8px_20px_-10px_rgb(0_0_0/0.45)] outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
      >
        {/* Viền trong như con dấu */}
        <motion.span
          aria-hidden
          className="absolute inset-[9%] border-[1.5px] border-on-accent/45"
          animate={{ borderRadius: active ? "26%" : "50%" }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
        />
        <motion.span
          key={active ? "stop" : "mic"}
          initial={{ scale: 0.3, opacity: 0, rotate: -90 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
        >
          {active ? <StopIcon className={icon} /> : <MicIcon className={icon} />}
        </motion.span>
      </motion.button>
    </motion.div>
  );
}
