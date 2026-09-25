"use client";

import { BRAND } from "@/lib/brand";

/** Logo: con dấu son khắc chữ "X" (Ximi Dịch). */
export function Seal({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`relative grid shrink-0 -rotate-3 place-items-center rounded-[22%] bg-accent-strong text-on-accent ${className}`}
      style={{ width: size, height: size }}
      aria-label={BRAND.appName}
    >
      {/* Viền trong của con dấu */}
      <span
        className="absolute rounded-[16%] border-on-accent/70"
        style={{ inset: size * 0.09, borderWidth: Math.max(1, size * 0.035) }}
      />
      <span className="leading-none font-extrabold" style={{ fontSize: size * 0.52 }}>
        {BRAND.seal}
      </span>
    </div>
  );
}

/** Chữ ký "thiết kế bởi …" với ánh sáng lướt qua. */
export function Credit({ className = "", prefix = "Thiết kế & phát triển bởi" }: { className?: string; prefix?: string }) {
  return (
    <p className={`flex items-center justify-center gap-1.5 text-[12px] ${className}`}>
      <span className="text-fg-3">{prefix}</span>
      <span className="font-semibold text-fg-2">{BRAND.author}</span>
    </p>
  );
}
