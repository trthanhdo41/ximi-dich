"use client";

import { useEffect, useRef } from "react";
import { motion, type MotionValue } from "motion/react";

const BARS = 36;

/**
 * Vòng vạch quanh nút micro = phổ tần số thật của giọng nói (đối xứng hai bên: trầm ở trên, cao ở dưới).
 * Không có bộ phân tích phổ thì nhảy theo âm lượng.
 * Vẽ bằng requestAnimationFrame và sửa thẳng thuộc tính SVG, không render lại React.
 */
export function RadialVisualizer({
  level,
  analyser,
  radius,
  active,
}: {
  level: MotionValue<number>;
  analyser?: AnalyserNode | null;
  radius: number;
  active: boolean;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const reach = 26;
  const size = (radius + reach + 4) * 2;
  const c = size / 2;

  useEffect(() => {
    const group = groupRef.current;
    if (!active || !group) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lines = Array.from(group.children) as SVGLineElement[];
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const half = BARS / 2;
    // Mỗi vạch (nửa vòng) ứng với một dải tần, chia theo thang log từ ~90 Hz đến ~5 kHz.
    const ranges = Array.from({ length: half + 1 }, (_, k) => Math.round(2 * Math.pow(55, k / half)));
    const bars = new Float32Array(BARS);
    let smooth = 0;
    let raf = 0;

    const draw = (t: number) => {
      const target = Math.min(1, Math.sqrt(level.get()) * 2.4);
      smooth += (target - smooth) * 0.22;
      if (analyser && bins) analyser.getByteFrequencyData(bins);
      for (let i = 0; i < BARS; i++) {
        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        let amount: number;
        if (analyser && bins) {
          const k = i < half ? i : BARS - 1 - i; // đối xứng trái/phải
          const lo = ranges[k];
          const hi = Math.max(lo + 1, ranges[k + 1]);
          let sum = 0;
          for (let b = lo; b < hi; b++) sum += bins[b];
          const v = Math.min(1, (sum / (hi - lo) / 255) * 1.35);
          bars[i] += (v - bars[i]) * (v > bars[i] ? 0.5 : 0.15);
          amount = bars[i];
        } else {
          const wobble = reduce
            ? 0.8
            : 0.5 + 0.5 * Math.abs(Math.sin(t / 240 + i * 0.83) * Math.cos(t / 390 + i * 0.37));
          amount = smooth * wobble;
        }
        const len = 2 + amount * reach;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const line = lines[i];
        line.setAttribute("x1", String(c + cos * radius));
        line.setAttribute("y1", String(c + sin * radius));
        line.setAttribute("x2", String(c + cos * (radius + len)));
        line.setAttribute("y2", String(c + sin * (radius + len)));
        line.setAttribute("opacity", String(0.45 + 0.55 * Math.min(1, amount * 1.6)));

      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, analyser, level, radius, c]);

  return (
    <motion.svg
      aria-hidden
      width={size}
      height={size}
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      initial={false}
      animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.85 }}
      transition={{ duration: 0.4 }}
    >
      <g ref={groupRef} stroke="var(--accent)" strokeWidth={3.2} strokeLinecap="round">
        {Array.from({ length: BARS }, (_, i) => (
          <line key={i} x1={c} y1={c} x2={c} y2={c} />
        ))}
      </g>
    </motion.svg>
  );
}
