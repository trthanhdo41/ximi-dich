"use client";

import { motion } from "motion/react";
import { HeartIcon } from "./icons";

export const SPECTRUM = ["#f0492b", "#ff7a3d", "#ffb020", "#ffd27a", "#fff1dc"];

/** Số giả ngẫu nhiên cố định theo chỉ số (render thuần, không đổi giữa các lần vẽ). */
function rand(i: number, salt = 1) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Pháo hoa: các hạt màu (và trái tim) bắn ra từ tâm rồi tan dần.
 * Đổi `burstKey` để bắn lại.
 */
export function Burst({
  burstKey,
  count = 26,
  distance = 150,
  hearts = false,
  delay = 0,
}: {
  burstKey: number | string;
  count?: number;
  distance?: number;
  hearts?: boolean;
  delay?: number;
}) {
  return (
    <div key={burstKey} aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-0">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + rand(i) * 0.5;
        const dist = distance * (0.55 + rand(i, 2) * 0.6);
        const color = SPECTRUM[i % SPECTRUM.length];
        const size = 5 + rand(i, 3) * 7;
        const isHeart = hearts && i % 3 === 0;
        return (
          <motion.span
            key={i}
            className="absolute grid place-items-center"
            style={{ left: -size / 2, top: -size / 2, width: size, height: size }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist + 30,
              scale: [0, 1.4, 0.9, 0],
              opacity: [1, 1, 0.9, 0],
              rotate: (rand(i, 4) - 0.5) * 540,
            }}
            transition={{ duration: 1.2 + rand(i, 5) * 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
          >
            {isHeart ? (
              <span style={{ color: "#f0492b", width: size * 2, height: size * 2 }} className="block">
                <HeartIcon className="size-full" />
              </span>
            ) : (
              <span
                className={i % 2 ? "size-full rounded-full" : "size-full rounded-[2px]"}
                style={{ background: color, boxShadow: `0 0 12px ${color}` }}
              />
            )}
          </motion.span>
        );
      })}
    </div>
  );
}

/** Viền cầu vồng xoay quanh phần tử con (dày `width` px). */
export function SpectrumBorder({
  active,
  radius,
  width = 2,
  className = "",
  children,
}: {
  active: boolean;
  radius: string;
  width?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative ${className}`} style={{ borderRadius: radius }}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute overflow-hidden"
        style={{ inset: -width, borderRadius: radius }}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="spectrum-spin absolute top-1/2 left-1/2 aspect-square w-[250%] -translate-x-1/2 -translate-y-1/2" />
      </motion.div>
      {children}
    </div>
  );
}

/** Nền cực quang: nhiều vệt màu lớn trôi chậm, hoà trộn với nền mực/giấy. */
export function AuroraBackdrop() {
  const blobs = [
    { color: "#f0492b", x: "-20%", y: "-15%", size: "75vmax", dur: 22 },
    { color: "#ff7a3d", x: "55%", y: "-10%", size: "60vmax", dur: 27 },
    { color: "#ffb020", x: "40%", y: "60%", size: "65vmax", dur: 30 },
    { color: "#b3261e", x: "-25%", y: "55%", size: "60vmax", dur: 25 },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ opacity: "var(--aurora-opacity)" }}
    >
      {/* Hoạt ảnh bằng CSS (chạy trên GPU, không tốn JS); tạm dừng khi đang nghe để nhẹ máy. */}
      {blobs.map((b, i) => (
        <div
          key={i}
          className="aurora-blob absolute rounded-full"
          style={{
            left: b.x,
            top: b.y,
            width: b.size,
            height: b.size,
            background: `radial-gradient(closest-side, ${b.color}2b, transparent)`,
            animationDuration: `${b.dur}s`,
            animationDirection: i % 2 ? "alternate-reverse" : "alternate",
          }}
        />
      ))}
    </div>
  );
}
