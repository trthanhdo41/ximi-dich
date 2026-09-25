"use client";

// Kiểu hiển thị "Dòng thoại": như lời bài hát / kịch bản thay vì bong bóng chat.
// - Chữ trải toàn chiều ngang, không khung → thoáng, đọc từ xa dễ.
// - Ảnh đại diện tròn (màu riêng từng người) chỉ hiện khi đổi người nói; câu cùng người nối thành đoạn.
// - Câu mới nhất sáng rõ + vạch son bên trái; câu cũ dịu đi.
// - Chạm vào câu mới hiện nút Đánh dấu / Chép / Đọc → màn hình gọn.

import { memo, useMemo, useState } from "react";
import { toPinyin } from "@/lib/pinyin";
import { getLangPair, langBadge, langFont, langName } from "@/lib/languages";
import { AnimatePresence, motion } from "motion/react";
import type { Segment } from "@/lib/soniox/segments";
import { extractHighlights } from "@/lib/meeting/highlights";
import { HighlightChip } from "./highlight-chip";
import { formatClock } from "@/lib/meeting/summary";
import { RevealText } from "./reveal-text";
import { isMine, speakerDot, TypingDots } from "./bubble";
import { BellRingIcon, CheckIcon, CopyIcon, LightbulbIcon, PencilIcon, SpeakerIcon, StarIcon, VerifiedIcon } from "./icons";

type Props = {
  seg: Segment;
  name?: string;
  /** Cùng người nói với câu trước → không lặp lại ảnh đại diện/tên. */
  continued?: boolean;
  /** Câu mới nhất (đang nói hoặc vừa chốt) → làm nổi bật. */
  latest?: boolean;
  /** Hiện pinyin dưới câu tiếng Trung. */
  pinyin?: boolean;
  mentioned?: boolean;
  domId?: string;
  speaking: boolean;
  onRename?: (speaker: string) => void;
  onToggleStar?: (id: number) => void;
  onSpeak: (seg: Segment) => void;
  onCopy: (seg: Segment) => Promise<boolean>;
};

function initials(label: string) {
  const words = label.replace(/^(Sếp|Anh|Chị|Em|Ông|Bà)\s+/i, "").trim().split(/\s+/);
  const w = words[words.length - 1] ?? label;
  return Array.from(w)[0]?.toUpperCase() ?? "?";
}

function Avatar({ seg, name }: { seg: Segment; name?: string }) {
  const color = speakerDot(seg.speaker);
  const label = name ?? (seg.speaker ? seg.speaker : langBadge(seg.language));
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      className="relative grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold"
      style={{
        color,
        background: `color-mix(in oklab, ${color} 15%, var(--surface))`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${color} 35%, transparent)`,
      }}
    >
      {name ? initials(label) : label}
      {!seg.closed && (
        <motion.span
          className="absolute -inset-1 rounded-full border-2"
          style={{ borderColor: color }}
          animate={{ scale: [1, 1.25], opacity: [0.8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
    </motion.span>
  );
}

function LineView({
  seg,
  name,
  continued,
  latest,
  pinyin,
  mentioned,
  domId,
  speaking,
  onRename,
  onToggleStar,
  onSpeak,
  onCopy,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const mine = isMine(seg);
  const translation = seg.translationFinal + seg.translationPartial;
  const original = seg.originalFinal + seg.originalPartial;
  const highlights = seg.closed ? extractHighlights(mine ? seg.originalFinal : seg.translationFinal) : [];
  const color = speakerDot(seg.speaker);
  const label = name ?? (seg.speaker ? `Người ${seg.speaker}` : langName(seg.language));
  const emphasized = latest || !seg.closed;
  // Pinyin chỉ có với tiếng Trung.
  const py = useMemo(() => (pinyin && seg.language === "zh" ? toPinyin(original) : ""), [pinyin, seg.language, original]);

  const copy = async () => {
    if (await onCopy(seg)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.article
      id={domId}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      // Chỉ bỏ vẽ câu cũ ngoài màn hình: câu đang nói có vòng sáng tràn ra ngoài, bị content-visibility cắt mất.
      className={`${seg.closed && !latest ? "offscreen-skip" : ""} relative flex gap-3 ${continued ? "mt-1" : "mt-5 first:mt-0"}`}
    >
      {/* Cột trái: ảnh đại diện (khi đổi người) hoặc đường nối của cùng người nói */}
      <div className="flex w-9 shrink-0 flex-col items-center">
        {continued ? (
          <span className="w-[2px] flex-1 rounded-full opacity-35" style={{ background: color }} />
        ) : (
          <>
            <Avatar seg={seg} name={name} />
            <span className="mt-1.5 w-[2px] flex-1 rounded-full opacity-35" style={{ background: color }} />
          </>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => seg.closed && setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && seg.closed && setOpen((v) => !v)}
        className={`relative min-w-0 flex-1 rounded-2xl px-3 py-2 transition-[background-color,box-shadow] duration-500 ${
          mentioned
            ? "bg-accent-soft ring-1 ring-accent/30"
            : open
              ? "bg-surface shadow-[0_8px_24px_-16px_rgb(0_0_0/0.35)]"
              : emphasized
                ? ""
                : ""
        }`}
      >
        {/* Vạch son bên trái cho câu mới nhất */}
        <AnimatePresence>
          {emphasized && (
            <motion.span
              aria-hidden
              layoutId="latest-bar"
              className="absolute top-2 bottom-2 -left-1 w-[3px] rounded-full bg-accent"
              initial={{ opacity: 0, scaleY: 0.3 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>

        {!continued && (
          <div className="mb-1 flex items-center gap-2 text-[12.5px]">
            {seg.speaker && onRename ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(seg.speaker!);
                }}
                className="inline-flex items-center gap-1 font-semibold whitespace-nowrap"
                style={{ color }}
                title="Đặt tên người nói"
              >
                {label}
                {!name && <PencilIcon className="size-3 opacity-70" />}
              </button>
            ) : (
              <span className="font-semibold whitespace-nowrap" style={{ color }}>
                {label}
              </span>
            )}
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-fg-3">
              {langBadge(seg.language)}
            </span>
            {seg.refined && !mine && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-ok/15 px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-ok">
                <VerifiedIcon className="size-3" /> chuẩn
              </span>
            )}
            {seg.starred && <StarIcon className="size-3.5 text-accent" filled />}
            {seg.at && <time className="ml-auto whitespace-nowrap tabular-nums text-fg-3">{formatClock(seg.at)}</time>}
          </div>
        )}

        {/* Nội dung chính: bản dịch tiếng Việt thật to (câu của mình: chính câu tiếng Việt) */}
        <div
          className={`text-[22px] leading-snug tracking-[-0.01em] transition-[color,font-weight] duration-500 ${
            emphasized ? "font-semibold text-fg" : "font-medium text-fg/75"
          }`}
        >
          {mine ? (
            <RevealText still={seg.closed} final={seg.originalFinal} partial={seg.originalPartial} />
          ) : translation ? (
            <RevealText still={seg.closed} final={seg.translationFinal} partial={seg.translationPartial} />
          ) : seg.pendingTranslation || (!seg.closed && original) ? (
            <span className="text-fg-3">
              <TypingDots />
            </span>
          ) : seg.translationFailed ? (
            <span className="text-[15px] text-fg-3">(chưa dịch được)</span>
          ) : seg.closed ? (
            <span className="text-[15px] text-fg-3">(câu bị ngắt, chưa kịp dịch)</span>
          ) : null}
          {continued && seg.starred && <StarIcon className="ml-1.5 inline size-4 align-baseline text-accent" filled />}
        </div>

        {/* Câu của mình: bản dịch sang tiếng đối tác nhỏ bên dưới (để đưa đối tác xem / máy đọc to) */}
        {mine && translation && (
          <p className={`mt-1 ${langFont(getLangPair().partner)} text-[14.5px] leading-relaxed text-fg-3`}>
            <RevealText still={seg.closed} final={seg.translationFinal} partial={seg.translationPartial} />
          </p>
        )}

        {/* Câu gốc tiếng Trung nhỏ, dịu bên dưới */}
        {!mine && original && (
          <p className={`mt-1 ${langFont(seg.language)} text-[14.5px] leading-relaxed text-fg-3`}>
            <RevealText still={seg.closed} final={seg.originalFinal} partial={seg.originalPartial} />
          </p>
        )}
        {py && <p className="mt-0.5 text-[13px] leading-relaxed text-fg-3 italic">{py}</p>}

        <AnimatePresence initial={false}>
          {seg.refining && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden pt-1 text-[12px] text-fg-3"
            >
              Đang dịch lại cho chuẩn nghĩa…
            </motion.p>
          )}
        </AnimatePresence>

        {(highlights.length > 0 || mentioned) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mentioned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-on-accent">
                <BellRingIcon className="size-3.5" /> Nhắc tên em
              </span>
            )}
            {highlights.map((h, i) => (
              <HighlightChip key={`${h.kind}-${h.text}`} h={h} index={i} />
            ))}
          </div>
        )}

        {!!seg.notes?.length && (
          <ul className="mt-2 space-y-0.5 border-l-2 border-accent/30 pl-2.5">
            {seg.notes.map((n) => (
              <li key={n.term} className="text-[13px] leading-snug text-fg-2">
                <LightbulbIcon className="mr-1 inline size-3.5 text-accent" />
                <span className={`${langFont(seg.language)} font-semibold text-fg`}>{n.term}</span> — {n.meaning}
              </li>
            ))}
          </ul>
        )}

        {/* Chạm vào câu → hiện nút */}
        <AnimatePresence initial={false}>
          {open && seg.closed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap gap-2 pt-3">
                {onToggleStar && (
                  <LineAction active={!!seg.starred} onClick={() => onToggleStar(seg.id)}>
                    <StarIcon className="size-4" filled={seg.starred} /> {seg.starred ? "Bỏ đánh dấu" : "Đánh dấu"}
                  </LineAction>
                )}
                <LineAction active={copied} onClick={copy}>
                  {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />} {copied ? "Đã chép" : "Chép"}
                </LineAction>
                {!mine && translation && (
                  <LineAction active={speaking} onClick={() => onSpeak(seg)}>
                    <SpeakerIcon className="size-4" /> {speaking ? "Đang đọc…" : "Đọc to"}
                  </LineAction>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

function LineAction({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ring-1 transition-colors ${
        active ? "bg-accent-soft text-accent ring-accent/40" : "bg-surface-2 text-fg-2 ring-line"
      }`}
    >
      {children}
    </motion.button>
  );
}

export const TranscriptLine = memo(LineView);
