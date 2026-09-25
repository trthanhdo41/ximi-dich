"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Segment } from "@/lib/soniox/segments";
import { buildTranscript, streamSummary, type SpeakerNames } from "@/lib/meeting/summary";
import { GLOSSARY_KEY, MEETING_CONTEXT_KEY, readStorage } from "@/lib/browser/storage";
import { toVietnamese } from "@/lib/errors";
import { SuggestPanel } from "./suggest-panel";
import { Rich } from "./summary-panel";
import { useToast } from "./toast";
import { ChatIcon, LightbulbIcon } from "./icons";

type Tab = "suggest" | "ask";

/** Bảng "Trợ lý": gợi ý cách trả lời sếp + hỏi AI về nội dung cuộc họp. */
export function AssistantPanel({
  segments,
  names,
  summary,
  onSpeakZh,
}: {
  segments: Segment[];
  names: SpeakerNames;
  /** Bản tóm tắt hiện có (làm "trí nhớ dài" cho câu hỏi). */
  summary: string;
  onSpeakZh: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("suggest");
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 rounded-2xl bg-surface-2 p-1 ring-1 ring-line">
        {(
          [
            ["suggest", "Gợi ý trả lời"],
            ["ask", "Hỏi về cuộc trò chuyện"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`relative h-10 rounded-xl text-[14px] font-semibold transition-colors ${tab === value ? "text-fg" : "text-fg-2"}`}
          >
            {tab === value && (
              <motion.span
                layoutId="assistant-tab"
                className="absolute inset-0 rounded-xl bg-surface shadow-sm ring-1 ring-line"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {value === "suggest" ? <LightbulbIcon className="size-4" /> : <ChatIcon className="size-4" />}
              {label}
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: tab === "ask" ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: tab === "ask" ? -24 : 24 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {tab === "suggest" ? (
            <SuggestPanel segments={segments} names={names} onSpeakZh={onSpeakZh} />
          ) : (
            <AskPanel segments={segments} names={names} summary={summary} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

type QA = { q: string; a: string; status: "loading" | "streaming" | "done" | "error" };

const QUICK = [
  "Họ vừa nói gì?",
  "Ai phải làm gì, hạn khi nào?",
  "Có con số nào quan trọng?",
  "Họ có đang không vui điều gì không?",
];

function AskPanel({ segments, names, summary }: { segments: Segment[]; names: SpeakerNames; summary: string }) {
  const [question, setQuestion] = useState("");
  const [items, setItems] = useState<QA[]>([]);
  const busy = items.some((x) => x.status === "loading" || x.status === "streaming");
  const { toast } = useToast();
  const topRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion("");
    setItems((list) => [{ q: text, a: "", status: "loading" }, ...list]);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const update = (patch: Partial<QA>) =>
      setItems((list) => list.map((x, i) => (i === 0 ? { ...x, ...patch } : x)));
    try {
      await streamSummary(
        {
          question: text,
          transcript: buildTranscript(segments.slice(-60), names),
          summary,
          meetingContext: readStorage(MEETING_CONTEXT_KEY),
          glossary: readStorage(GLOSSARY_KEY),
        },
        (a) => update({ a, status: "streaming" }),
        undefined,
        "/api/ask",
      );
      update({ status: "done" });
    } catch (e) {
      const message = toVietnamese(e, "Lỗi khi hỏi AI, thử lại nhé.");
      update({ status: "error", a: "" });
      toast({ id: "ask", kind: "error", title: "Chưa trả lời được", message });
    }
  };

  return (
    <div className="pb-2" ref={topRef}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Hỏi gì về cuộc trò chuyện?"
          enterKeyHint="send"
          className="h-12 min-w-0 flex-1 rounded-2xl bg-surface-2 px-4 text-[16px] ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.94 }}
          disabled={busy || !question.trim()}
          className="btn-primary h-12 shrink-0 rounded-2xl px-5 font-semibold text-on-accent disabled:opacity-50"
        >
          Hỏi
        </motion.button>
      </form>

      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {QUICK.map((q) => (
          <motion.button
            key={q}
            whileTap={{ scale: 0.94 }}
            disabled={busy}
            onClick={() => void ask(q)}
            className="shrink-0 rounded-full bg-surface-2 px-3.5 py-2 text-[13px] font-medium ring-1 ring-line disabled:opacity-50"
          >
            {q}
          </motion.button>
        ))}
      </div>

      <div className="mt-4 min-h-[36dvh] space-y-3">
        {items.length === 0 && (
          <p className="py-10 text-center text-[14px] text-fg-3">
            Hỏi bất cứ điều gì về cuộc trò chuyện, AI trả lời dựa trên những gì đã nghe được.
          </p>
        )}
        <AnimatePresence initial={false}>
          {items.map((it, i) => (
            <motion.article
              key={items.length - i}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="rounded-2xl bg-surface p-4 ring-1 ring-line"
            >
              <p className="text-[14px] font-semibold text-accent">{it.q}</p>
              <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-fg">
                {it.status === "loading" ? (
                  <span className="inline-flex gap-1 py-1 text-fg-3">
                    {[0, 1, 2].map((k) => (
                      <motion.span
                        key={k}
                        className="size-1.5 rounded-full bg-current"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1, repeat: Infinity, delay: k * 0.15 }}
                      />
                    ))}
                  </span>
                ) : it.status === "error" ? (
                  <span className="text-fg-3">Chưa trả lời được, thử hỏi lại nhé.</span>
                ) : (
                  it.a
                    .split("\n")
                    .filter((l) => l.trim())
                    .map((line, k) =>
                      /^\s*[-•*]\s/.test(line) ? (
                        <p key={k} className="flex gap-2">
                          <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-accent/70" />
                          <span>
                            <Rich text={line.replace(/^\s*[-•*]\s/, "")} />
                          </span>
                        </p>
                      ) : (
                        <p key={k}>
                          <Rich text={line.replace(/^#+\s*/, "")} />
                        </p>
                      ),
                    )
                )}
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
