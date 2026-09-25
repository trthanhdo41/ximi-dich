"use client";

import { memo, useMemo, useState } from "react";
import { toPinyin } from "@/lib/pinyin";
import { getLangPair, isMineLang, langFont, langName } from "@/lib/languages";
import { AnimatePresence, motion } from "motion/react";
import type { Segment } from "@/lib/soniox/segments";
import { BellRingIcon, CheckIcon, CopyIcon, LightbulbIcon, PencilIcon, SpeakerIcon, StarIcon, VerifiedIcon } from "./icons";
import { extractHighlights } from "@/lib/meeting/highlights";
import { HighlightChip } from "./highlight-chip";
import { RevealText } from "./reveal-text";
import { formatClock } from "@/lib/meeting/summary";

/** Màu nhận diện từng người nói – lấy từ biến CSS --spk-1..6 (có bản riêng cho nền sáng/tối). */
export function speakerDot(speaker?: string) {
  const n = Number(speaker);
  return Number.isFinite(n) && n > 0 ? `var(--spk-${((n - 1) % 6) + 1})` : "var(--fg-3)";
}

/** Câu mình nói (bằng tiếng của mình) nằm bên phải, câu của đối tác bên trái. */
export function isMine(seg: Segment) {
  return isMineLang(seg.language);
}

export function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Đang dịch">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-current"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

type Props = {
  seg: Segment;
  /** Tên người nói đã đặt (vd. "Sếp Vương"). */
  name?: string;
  /** Câu nối tiếp của cùng người nói với câu trước → ẩn dòng tên, xếp sát lại. */
  continued?: boolean;
  onRename?: (speaker: string) => void;
  /** Câu nhắc tới tên người dùng → làm nổi bật. */
  mentioned?: boolean;
  /** Hiện pinyin dưới câu tiếng Trung. */
  pinyin?: boolean;
  onToggleStar?: (id: number) => void;
  /** id HTML để cuộn tới câu này (vd. từ thông báo "Sếp vừa nhắc tên em"). */
  domId?: string;
  speaking: boolean;
  onSpeak: (seg: Segment) => void;
  onCopy: (seg: Segment) => Promise<boolean>;
};

function BubbleView({ seg, name, continued, onRename, mentioned, pinyin, onToggleStar, domId, speaking, onSpeak, onCopy }: Props) {
  const [copied, setCopied] = useState(false);
  const mine = isMine(seg);
  const live = !seg.closed || !!seg.pendingTranslation || !!seg.refining;
  const translation = seg.translationFinal + seg.translationPartial;
  const original = seg.originalFinal + seg.originalPartial;
  // Pinyin chỉ có với tiếng Trung.
  const py = useMemo(() => (pinyin && seg.language === "zh" ? toPinyin(original) : ""), [pinyin, seg.language, original]);
  // Nhãn ngày giờ / tiền / số lượng lấy từ câu tiếng Việt (bản dịch, hoặc câu gốc nếu mình nói).
  const highlights = seg.closed ? extractHighlights(mine ? seg.originalFinal : seg.translationFinal) : [];

  const handleCopy = async () => {
    if (await onCopy(seg)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.article
      id={domId}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={`${seg.closed ? "offscreen-skip" : ""} flex w-full ${mine ? "justify-end" : "justify-start"} ${continued ? "-mt-1.5" : ""}`}
      style={{ transformOrigin: mine ? "100% 100%" : "0% 100%" }}
    >
      <div className="max-w-[88%] sm:max-w-[78%]">
        <div
          className={`relative overflow-hidden px-4 pt-3 pb-2.5 shadow-[0_6px_18px_-14px_rgb(0_0_0/0.45)] ${
            mine ? "bg-accent-soft" : "bg-surface"
          } ${
            live || mentioned
              ? "bubble-live ring-2 ring-accent/55"
              : mine
                ? "ring-1 ring-accent/20"
                : "ring-1 ring-line"
          } rounded-[26px] ${continued ? "" : mine ? "rounded-tr-lg" : "rounded-tl-lg"}`}
        >
          {/* Vạch màu riêng của từng người nói ở mép bong bóng */}
          {seg.speaker && (
            <span
              aria-hidden
              className={`absolute inset-y-3 w-[3px] rounded-full ${mine ? "right-0" : "left-0"}`}
              style={{ background: speakerDot(seg.speaker) }}
            />
          )}
          {!continued && (
            <div
              className={`mb-1 flex items-center gap-1.5 text-[12px] font-medium text-fg-3 ${mine ? "justify-end" : ""}`}
            >
              {seg.speaker && (
                <motion.span
                  className="size-2 rounded-full"
                  style={{ background: speakerDot(seg.speaker) }}
                  animate={seg.closed ? { scale: 1 } : { scale: [1, 1.5, 1] }}
                  transition={seg.closed ? undefined : { duration: 0.9, repeat: Infinity }}
                />
              )}
              {seg.speaker && onRename ? (
                // Chạm vào tên để đặt tên cho người nói (vd. "Sếp Vương").
                <button
                  type="button"
                  onClick={() => onRename(seg.speaker!)}
                  className="-mx-1 -my-0.5 inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-semibold whitespace-nowrap text-fg-2 hover:bg-surface-2"
                  style={{ color: name ? speakerDot(seg.speaker) : undefined }}
                  title="Đặt tên người nói"
                >
                  {name ?? `Người ${seg.speaker}`}
                  {!name && <PencilIcon className="size-3 opacity-60" />}
                </button>
              ) : seg.speaker ? (
                <span className="font-semibold" style={{ color: name ? speakerDot(seg.speaker) : undefined }}>
                  {name ?? `Người ${seg.speaker}`}
                </span>
              ) : (
                <span>{langName(seg.language)}</span>
              )}
              {seg.speaker && (
                <span className="hidden whitespace-nowrap min-[420px]:inline">· {langName(seg.language)}</span>
              )}
              {seg.refined && !mine && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  title={seg.draft ? `Bản dịch nhanh ban đầu: ${seg.draft}` : "AI đã dịch theo nghĩa bản địa"}
                  className="rounded-full bg-ok/15 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-ok"
                >
                  <VerifiedIcon className="-mt-px mr-0.5 inline size-3" />chuẩn
                </motion.span>
              )}
              {seg.at && (
                <time
                  dateTime={new Date(seg.at).toISOString()}
                  className={`whitespace-nowrap tabular-nums text-fg-3 ${mine ? "order-first mr-auto" : "ml-auto pl-3"}`}
                >
                  {formatClock(seg.at)}
                </time>
              )}
            </div>
          )}

          {mine ? (
            <>
              {/* Câu của mình: chữ to; bản dịch sang tiếng đối tác nhỏ bên dưới */}
              <p className="text-[20px] leading-snug font-medium text-fg">
                <RevealText still={seg.closed}
                  final={seg.originalFinal}
                  partial={seg.originalPartial}
                />
              </p>
              {translation && (
                <p className={`mt-1 ${langFont(getLangPair().partner)} text-[15px] leading-relaxed text-fg-2`}>
                  <RevealText still={seg.closed} final={seg.translationFinal} partial={seg.translationPartial} />
                </p>
              )}
            </>
          ) : (
            <>
              {/* Câu gốc tiếng Trung: nhỏ, mờ */}
              <p className={`${langFont(seg.language)} text-[15px] leading-relaxed text-fg-2`}>
                <RevealText still={seg.closed}
                  final={seg.originalFinal}
                  partial={seg.originalPartial}
                />
              </p>
              {py && <p className="text-[13px] leading-relaxed text-fg-3 italic">{py}</p>}

              {/* Bản dịch tiếng Việt: to, rõ */}
              <div className="mt-1 text-[22px] leading-snug font-medium tracking-[-0.01em] text-fg">
                {translation ? (
                  <RevealText still={seg.closed}
                    final={seg.translationFinal}
                    partial={seg.translationPartial}
                  />
                ) : seg.pendingTranslation ? (
                  <span className="text-fg-3">
                    <TypingDots />
                  </span>
                ) : seg.translationFailed ? (
                  <span className="text-base text-fg-3">
                    (chưa dịch được)
                  </span>
                ) : seg.closed ? (
                  <span className="text-base text-fg-3">
                    (câu bị ngắt giữa chừng, chưa kịp dịch)
                  </span>
                ) : original ? (
                  <span className="text-fg-3">
                    <TypingDots />
                  </span>
                ) : null}
              </div>
              {/* AI đang dịch lại cho đúng nghĩa bản địa */}
              <AnimatePresence initial={false}>
                {seg.refining && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <span className="mt-1 inline-block text-[12px] text-fg-3">
                      Đang dịch lại cho chuẩn nghĩa…
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Giải thích thành ngữ / khẩu ngữ / thuật ngữ */}
              {!!seg.notes?.length && (
                <motion.ul
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                  className="mt-2 space-y-1 rounded-xl bg-surface-2/70 px-3 py-2 ring-1 ring-line"
                >
                  {seg.notes.map((n) => (
                    <motion.li
                      key={n.term}
                      variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                      className="text-[13px] leading-snug text-fg-2"
                    >
                      <LightbulbIcon className="mr-1 inline size-3.5 text-accent" />
                      <span className={`${langFont(seg.language)} font-semibold text-fg`}>{n.term}</span> — {n.meaning}
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </>
          )}

          {(highlights.length > 0 || mentioned) && (
            <div className={`mt-2 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
              {mentioned && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: [0.6, 1.12, 1], opacity: 1 }}
                  className="rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-on-accent"
                >
                  <BellRingIcon className="-mt-px mr-1 inline size-3.5" />Nhắc tên em
                </motion.span>
              )}
              {highlights.map((h, i) => (
                <HighlightChip key={`${h.kind}-${h.text}`} h={h} index={i} />
              ))}
            </div>
          )}

          <AnimatePresence initial={false}>
            {seg.closed && (mine ? original : translation) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.25 }}
                className={`-mx-1.5 mt-1 flex gap-1 ${mine ? "justify-end" : ""}`}
              >
                {onToggleStar && (
                  <IconAction
                    label={seg.starred ? "Bỏ đánh dấu" : "Đánh dấu quan trọng"}
                    onClick={() => onToggleStar(seg.id)}
                    active={!!seg.starred}
                  >
                    <motion.span
                      key={seg.starred ? "on" : "off"}
                      initial={{ scale: 0.5, rotate: -40 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 14 }}
                      className="grid place-items-center"
                    >
                      <StarIcon className="size-[18px]" filled={seg.starred} />
                    </motion.span>
                  </IconAction>
                )}
                <IconAction
                  label={copied ? "Đã chép" : "Chép"}
                  onClick={handleCopy}
                  active={copied}
                >
                  {copied ? (
                    <CheckIcon className="size-[18px]" />
                  ) : (
                    <CopyIcon className="size-[18px]" />
                  )}
                </IconAction>
                {continued && seg.at && (
                  <time
                    dateTime={new Date(seg.at).toISOString()}
                    className={`self-center px-1.5 text-[12px] tabular-nums text-fg-3 ${mine ? "order-first mr-auto" : "order-last ml-auto"}`}
                  >
                    {formatClock(seg.at)}
                  </time>
                )}
                {!mine && (
                  <IconAction
                    label="Đọc bản dịch"
                    onClick={() => onSpeak(seg)}
                    active={speaking}
                  >
                    <motion.span
                      animate={
                        speaking ? { scale: [1, 1.18, 1] } : { scale: 1 }
                      }
                      transition={
                        speaking
                          ? { duration: 0.8, repeat: Infinity }
                          : undefined
                      }
                      className="grid place-items-center"
                    >
                      <SpeakerIcon className="size-[18px]" />
                    </motion.span>
                  </IconAction>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
  );
}

function IconAction({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      className={`grid size-10 place-items-center rounded-full transition-colors ${
        active ? "text-accent" : "text-fg-3 hover:bg-surface-2 hover:text-fg-2"
      }`}
    >
      {children}
    </motion.button>
  );
}

// Câu đã chốt không đổi nữa → không cần vẽ lại khi có chữ mới ở câu khác.
export const Bubble = memo(BubbleView);
