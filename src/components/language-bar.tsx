"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { AUTO, LANGUAGES, langName, POPULAR_CODES, type LangPair } from "@/lib/languages";
import { SwapIcon } from "./icons";

/** Danh sách chọn ngôn ngữ: hay dùng trước, còn lại theo vần. */
export function LanguageOptions({ exclude, allowAuto }: { exclude?: string; allowAuto?: boolean }) {
  const list = LANGUAGES.filter((l) => l.code !== exclude);
  const popular = POPULAR_CODES.map((c) => list.find((l) => l.code === c)).filter((l) => !!l);
  const others = list.filter((l) => !POPULAR_CODES.includes(l.code)).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const option = (l: (typeof LANGUAGES)[number]) => (
    <option key={l.code} value={l.code}>
      {l.name === l.native ? l.name : `${l.name} · ${l.native}`}
    </option>
  );
  return (
    <>
      {allowAuto && <option value={AUTO}>Nhiều thứ tiếng (tự nhận)</option>}
      <optgroup label="Hay dùng">{popular.map(option)}</optgroup>
      <optgroup label="Tất cả">{others.map(option)}</optgroup>
    </>
  );
}

const short = (code: string) => (code === AUTO ? "Tự nhận" : langName(code).replace(/^Tiếng /, ""));

/** Một ô ngôn ngữ: chạm vào là mở danh sách chọn có sẵn của máy. */
function LangPill({
  label,
  value,
  exclude,
  allowAuto,
  onChange,
}: {
  label: string;
  value: string;
  exclude?: string;
  allowAuto?: boolean;
  onChange: (code: string) => void;
}) {
  return (
    <label className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-2xl bg-surface-2 px-3 ring-1 ring-line transition-colors active:bg-surface">
      <span className="truncate text-[15px] font-semibold">{short(value)}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        <LanguageOptions exclude={exclude} allowAuto={allowAuto} />
      </select>
    </label>
  );
}

/** Thanh chọn nhanh ngôn ngữ trên màn hình chính: [tiếng của bạn] ⇄ [tiếng người kia]. */
export function LanguageBar({ pair, onChange }: { pair: LangPair; onChange: (pair: LangPair) => void }) {
  const [turns, setTurns] = useState(0);
  const canSwap = pair.partner !== AUTO;
  return (
    <div className="flex items-center gap-2">
      <LangPill label="Bạn nói" value={pair.mine} exclude={pair.partner} onChange={(mine) => onChange({ ...pair, mine })} />
      <motion.button
        type="button"
        aria-label="Đổi chiều hai ngôn ngữ"
        title="Đổi chiều"
        disabled={!canSwap}
        onClick={() => {
          setTurns((n) => n + 1);
          onChange({ mine: pair.partner, partner: pair.mine });
        }}
        animate={{ rotate: turns * 180 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        whileTap={{ scale: 0.85 }}
        className="grid size-11 shrink-0 place-items-center rounded-full text-fg-2 disabled:opacity-30"
      >
        <SwapIcon className="size-5" />
      </motion.button>
      <LangPill
        label="Người kia nói"
        value={pair.partner}
        exclude={pair.mine}
        allowAuto
        onChange={(partner) => onChange({ ...pair, partner })}
      />
    </div>
  );
}
