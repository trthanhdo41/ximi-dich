"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Segment } from "@/lib/soniox/segments";
import { buildTranscript, partnerOf, type SpeakerNames } from "@/lib/meeting/summary";
import { langFont } from "@/lib/languages";
import { getConversationType } from "@/lib/conversation";
import { GLOSSARY_KEY, MEETING_CONTEXT_KEY, readStorage } from "@/lib/browser/storage";
import { copyText } from "@/lib/browser/clipboard";
import { toVietnamese, VnError } from "@/lib/errors";
import { CheckIcon, CopyIcon, ExpandIcon, RefreshIcon, SpeakerIcon } from "./icons";
import { EmptyHint, Thinking } from "./summary-panel";
import { useToast } from "./toast";

/** `zh`: câu trả lời bằng tiếng của đối tác; `pinyin`: cách đọc (tên giữ như cũ). */
type Suggestion = { label: string; vi: string; zh: string; pinyin?: string };
type Result = { understanding: string; suggestions: Suggestion[] };

/** Chỉ gửi ~30 câu gần nhất: gợi ý cần bám vào điều người kia vừa nói. */
const CONTEXT_SEGMENTS = 30;

async function fetchSuggestions(context: string, intent: string, partner: string): Promise<Result> {
  let res: Response;
  try {
    res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context,
        intent,
        partner,
        conversation: getConversationType(),
        glossary: readStorage(GLOSSARY_KEY),
        meetingContext: readStorage(MEETING_CONTEXT_KEY),
      }),
    });
  } catch {
    throw new VnError("Không có mạng. Kiểm tra Wi-Fi hoặc 4G rồi thử lại.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new VnError(data.error ?? `Lỗi máy chủ (mã ${res.status}).`);
  return data as Result;
}

export function SuggestPanel({
  segments,
  names,
  onSpeakZh,
}: {
  segments: Segment[];
  names: SpeakerNames;
  onSpeakZh: (text: string) => void;
}) {
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [showBoss, setShowBoss] = useState<string | null>(null);
  const { toast } = useToast();
  const partner = partnerOf(segments);
  const font = langFont(partner);

  const run = useCallback(
    async (wish: string) => {
      setLoading(true);
      setError(null);
      try {
        const context = buildTranscript(segments.slice(-CONTEXT_SEGMENTS), names);
        setResult(await fetchSuggestions(context, wish, partnerOf(segments)));
      } catch (e) {
        const message = toVietnamese(e, "Lỗi khi gợi ý, thử lại nhé.");
        setError(message);
        toast({ id: "suggest", kind: "error", title: "Chưa gợi ý được", message });
      } finally {
        setLoading(false);
      }
    },
    [names, segments, toast],
  );

  // Mở bảng là gợi ý ngay theo đoạn hội thoại mới nhất.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = setTimeout(() => void run(""), 0);
    return () => clearTimeout(t);
  }, [run]);

  const copy = async (i: number, text: string) => {
    if (await copyText(text)) {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <div className="pb-2">
      {/* Ý muốn nói (không bắt buộc) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(intent);
        }}
        className="flex gap-2"
      >
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Bạn muốn nói ý gì? (không bắt buộc)"
          className="h-12 min-w-0 flex-1 rounded-2xl bg-surface-2 px-4 text-[16px] ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.94 }}
          disabled={loading}
          className="btn-primary flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 font-semibold text-on-accent disabled:opacity-50"
        >
          <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={loading ? { duration: 1, repeat: Infinity, ease: "linear" } : undefined}>
            <RefreshIcon className="size-5" />
          </motion.span>
          Gợi ý
        </motion.button>
      </form>
      <p className="mt-2 text-[12px] text-fg-3">Vd: “đồng ý nhưng xin lùi sang thứ Hai”, “muốn hỏi lại giá”…</p>

      <div className="mt-4 min-h-[40dvh]">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="wait" exit={{ opacity: 0 }}>
              <Thinking label="Đang nghĩ cách trả lời…" />
            </motion.div>
          ) : error ? (
            <EmptyHint key="err" text="Chưa có gợi ý. Bấm “Gợi ý” để thử lại." />
          ) : result ? (
            <motion.div
              key={result.understanding}
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.09 } } }}
              className="space-y-3"
            >
              {result.understanding && (
                <motion.div
                  variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                  className="flex gap-3 rounded-2xl bg-surface-2 p-4 ring-1 ring-line"
                >
                  <span className="grid size-7 shrink-0 -rotate-6 place-items-center rounded-lg bg-accent-strong text-[13px] font-extrabold text-on-accent">
                    Ý
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold text-fg-3">Họ đang muốn nói</div>
                    <p className="mt-0.5 text-[15px] leading-relaxed">{result.understanding}</p>
                  </div>
                </motion.div>
              )}

              {result.suggestions.map((s, i) => (
                <motion.article
                  key={i}
                  variants={{
                    hidden: { opacity: 0, y: 22, scale: 0.96 },
                    show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 280, damping: 24 } },
                  }}
                  className="rounded-2xl bg-surface p-4 ring-1 ring-line"
                >
                  <span className="inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-semibold text-accent">
                    {i + 1}. {s.label}
                  </span>
                  <p className={`mt-2 ${font} text-[21px] leading-snug font-medium`}>{s.zh}</p>
                  {s.pinyin && <p className="mt-1 text-[13px] leading-relaxed text-fg-3 italic">{s.pinyin}</p>}
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{s.vi}</p>
                  <div className="-mx-1.5 mt-2 flex flex-wrap gap-1">
                    <ActionButton label="Đọc" onClick={() => onSpeakZh(s.zh)}>
                      <SpeakerIcon className="size-[18px]" />
                    </ActionButton>
                    <ActionButton label={copied === i ? "Đã chép" : "Chép"} onClick={() => copy(i, s.zh)} active={copied === i}>
                      {copied === i ? <CheckIcon className="size-[18px]" /> : <CopyIcon className="size-[18px]" />}
                    </ActionButton>
                    <ActionButton label="Đưa họ xem" onClick={() => setShowBoss(s.zh)}>
                      <ExpandIcon className="size-[18px]" />
                    </ActionButton>
                  </div>
                </motion.article>
              ))}
              <motion.p variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} className="px-1 text-[12px] text-fg-3">
                AI chỉ gợi ý dựa trên phần máy nghe được. Chỗ có [ ] cần tự điền thông tin đúng.
              </motion.p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Đưa họ xem: câu bằng tiếng của người kia thật to, chạm để đóng */}
      <AnimatePresence>
        {showBoss && (
          <motion.button
            type="button"
            onClick={() => setShowBoss(null)}
            className="fixed inset-0 z-[60] grid place-items-center bg-bg p-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.p
              className={`${font} text-[clamp(32px,9vw,64px)] leading-tight font-bold`}
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              {showBoss}
            </motion.p>
            <span className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] text-[13px] text-fg-3">Chạm để đóng</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({
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
      className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
        active ? "text-accent" : "text-fg-2 hover:bg-surface-2"
      }`}
    >
      {children}
      <span>{label}</span>
    </motion.button>
  );
}
