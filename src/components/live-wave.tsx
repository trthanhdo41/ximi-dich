"use client";

import { useEffect, useRef } from "react";
import { motion, type MotionValue } from "motion/react";

/**
 * Sóng âm realtime kiểu Siri: nhiều lớp sóng uốn lượn, biên độ theo phổ tần số thật của micro
 * (giọng trầm → sóng dài, giọng cao → sóng lăn tăn). Vẽ canvas 60 khung hình/giây, không render lại React.
 * Không có bộ phân tích phổ (vd. iPhone ở chế độ tiết kiệm) thì dùng âm lượng để điều khiển.
 */

// Mỗi lớp: dải tần điều khiển, tần số sóng, tốc độ trôi, màu (chỉ tông son → cam → vàng).
const LAYERS = [
  { band: 0, freq: 1.2, speed: 0.9, color: [240, 73, 43], width: 3.2, alpha: 0.95 },
  { band: 1, freq: 1.9, speed: -1.25, color: [255, 122, 61], width: 2.4, alpha: 0.8 },
  { band: 2, freq: 2.8, speed: 1.6, color: [255, 176, 32], width: 1.8, alpha: 0.7 },
  { band: 1, freq: 3.6, speed: -2.1, color: [255, 210, 122], width: 1.2, alpha: 0.55 },
] as const;

// Dải tần (theo chỉ số bin của FFT 1024 @ ~48 kHz ≈ 47 Hz/bin): trầm, trung, cao của giọng nói.
const BANDS: [number, number][] = [
  [2, 8], // ~90–375 Hz
  [8, 30], // ~375 Hz–1.4 kHz
  [30, 90], // ~1.4–4.2 kHz
];

export function LiveWave({
  analyser,
  level,
  active,
  ambient = false,
  height = 130,
}: {
  analyser: AnalyserNode | null;
  level: MotionValue<number>;
  active: boolean;
  /** Sóng "thở" nhẹ tự chạy (màn chờ, chưa có micro). */
  ambient?: boolean;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = () => document.documentElement.dataset.theme !== "light";

    let w = 0;
    let h = 0;
    const resize = () => {
      // Giới hạn độ phân giải canvas để nhẹ máy (mắt không phân biệt được trên dải sóng mảnh).
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Dải màu mỗi lớp chỉ phụ thuộc chiều rộng → tạo sẵn, không tạo lại mỗi khung hình.
      strokes = LAYERS.map((layer) => {
        const [r, g, bl] = layer.color;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(${r},${g},${bl},0)`);
        grad.addColorStop(0.5, `rgba(${r},${g},${bl},${layer.alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        const glow = ctx.createLinearGradient(0, 0, w, 0);
        glow.addColorStop(0, `rgba(${r},${g},${bl},0)`);
        glow.addColorStop(0.5, `rgba(${r},${g},${bl},${layer.alpha * 0.16})`);
        glow.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        return { grad, glow };
      });
    };
    let strokes: { grad: CanvasGradient; glow: CanvasGradient }[] = [];
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const energy = [0, 0, 0];
    const phase = LAYERS.map((_, i) => i * 1.7);
    let last = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      // Màn chờ (sóng "thở"): 30 khung hình/giây là đủ mượt, đỡ tốn pin.
      if (ambient && now - last < 30) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Năng lượng từng dải tần (0..1), làm mượt: lên nhanh, xuống chậm cho sóng "thở".
      const fallback = Math.min(1, Math.sqrt(level.get()) * 2.4);
      if (analyser && bins) analyser.getByteFrequencyData(bins);
      for (let b = 0; b < BANDS.length; b++) {
        let target = fallback * (1 - b * 0.18);
        if (analyser && bins) {
          const [lo, hi] = BANDS[b];
          let sum = 0;
          for (let i = lo; i < hi; i++) sum += bins[i];
          target = Math.min(1, (sum / (hi - lo) / 255) * 1.5);
        }
        if (ambient) target = 0.16 + 0.1 * Math.sin(now / 900 + b * 1.7) + 0.05 * Math.sin(now / 370 + b);
        else if (!active) target = 0;
        const k = target > energy[b] ? 0.35 : 0.08;
        energy[b] += (target - energy[b]) * k;
      }

      ctx.clearRect(0, 0, w, h);
      const mid = h * 0.55;
      ctx.globalCompositeOperation = dark() ? "lighter" : "source-over";

      LAYERS.forEach((layer, li) => {
        if (!reduce) phase[li] += dt * layer.speed * (1 + energy[layer.band] * 2.2);
        // Luôn còn một chút gợn để sóng không phẳng lì khi im lặng.
        const amp = (active ? 3 : 1.5) + energy[layer.band] * h * 0.55;
        const [r, g, bl] = layer.color;

        ctx.beginPath();
        const step = 4;
        for (let x = 0; x <= w; x += step) {
          const t = x / w;
          // Nhỏ dần ở hai mép, và lõm ở giữa (chỗ nút micro che) để hai đỉnh sóng nằm hai bên nút.
          const envelope =
            Math.pow(Math.sin(Math.PI * t), 1.6) * (1 - 0.7 * Math.exp(-(((t - 0.5) / 0.1) ** 2)));
          const y =
            mid +
            Math.sin(t * Math.PI * 2 * layer.freq + phase[li]) *
              Math.cos(t * Math.PI * 1.3 - phase[li] * 0.35) *
              amp *
              envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // Vầng sáng giả: một nét rộng rất mờ phía dưới (nhẹ hơn nhiều so với shadowBlur).
        ctx.strokeStyle = strokes[li].glow;
        ctx.lineWidth = layer.width * (4 + energy[layer.band] * 5);
        ctx.stroke();
        ctx.strokeStyle = strokes[li].grad;
        ctx.lineWidth = layer.width;
        ctx.stroke();

        // Lớp đầu tiên có thêm mảng màu mờ bên dưới cho cảm giác "đặc".
        if (li === 0) {
          ctx.lineTo(w, mid);
          ctx.lineTo(0, mid);
          ctx.closePath();
          const fill = ctx.createLinearGradient(0, mid - amp, 0, mid + amp);
          fill.addColorStop(0, `rgba(${r},${g},${bl},0)`);
          fill.addColorStop(0.5, `rgba(${r},${g},${bl},${0.08 + energy[0] * 0.12})`);
          fill.addColorStop(1, `rgba(${r},${g},${bl},0)`);
          ctx.fillStyle = fill;
          ctx.fill();
        }
      });
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, level, active, ambient]);

  return (
    <motion.canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none block w-full"
      style={{ height }}
      initial={{ opacity: 0 }}
      animate={{ opacity: active || ambient ? 1 : 0.35 }}
      transition={{ duration: 0.6 }}
    />
  );
}
