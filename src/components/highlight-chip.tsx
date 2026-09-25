"use client";

import { motion } from "motion/react";
import type { Highlight } from "@/lib/meeting/highlights";
import { AlarmIcon, CalendarIcon, PackageIcon, PercentIcon, WalletIcon } from "./icons";

const ICONS = { date: CalendarIcon, time: AlarmIcon, money: WalletIcon, qty: PackageIcon, percent: PercentIcon };

/** Nhãn thông tin quan trọng (ngày giờ, tiền, số lượng, %) hiện dưới câu. */
export function HighlightChip({ h, index }: { h: Highlight; index: number }) {
  const Icon = ICONS[h.kind];
  return (
    <motion.span
      initial={{ scale: 0.7, opacity: 0, y: 4 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 26, delay: 0.06 + index * 0.05 }}
      className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent"
    >
      <Icon className="size-3.5" />
      {h.text}
    </motion.span>
  );
}
