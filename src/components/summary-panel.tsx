"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Segment } from "@/lib/soniox/segments";
import { buildTranscript, countSpoken, partnerOf, streamSummary, toPlainText, type SpeakerNames } from "@/lib/meeting/summary";
import { getLangPair, langFont, langInline, langName, language } from "@/lib/languages";
import { getConversationType } from "@/lib/conversation";
import { GLOSSARY_KEY, MEETING_CONTEXT_KEY, readStorage } from "@/lib/browser/storage";
import { copyText } from "@/lib/browser/clipboard";
import { CheckIcon, CopyIcon, RefreshIcon, ShareIcon } from "./icons";
import { Seal } from "./brand";
import { toVietnamese } from "@/lib/errors";
import type { SavedSummary } from "@/lib/meeting/storage";
import { useToast } from "./toast";

type Status = "idle" | "loading" | "streaming" | "done" | "error";
/** "vi": bản tóm tắt tiếng Việt; "zh": bản dịch sang tiếng của đối tác (tên giữ như cũ). */
type Lang = "vi" | "zh";

type SummaryState = {
  vi: string;
  zh: string;
  /** Mã ngôn ngữ của bản `zh`. */
  zhLang?: string;
  status: Status;
  zhStatus: Status;
  error: string | null;
  /** Số câu đã có lúc tóm tắt, để biết có câu mới chưa. */
  count: number;
  /** Id câu cuối đã được tóm tắt (tóm tắt cuốn chiếu). */
  coveredId?: number;
  at: number | null;
  inProgress: boolean;
};

const EMPTY: SummaryState = {
  vi: "",
  zh: "",
  status: "idle",
  zhStatus: "idle",
  error: null,
  count: 0,
  at: null,
  inProgress: false,
};

/** Giữ kết quả tóm tắt ở màn hình chính, để đóng/mở bảng không phải tóm tắt lại. */
export function useSummary(saved?: SavedSummary) {
  const [s, setS] = useState<SummaryState>(() =>
    saved?.vi
      ? { ...EMPTY, ...saved, status: "done", zhStatus: saved.zh ? "done" : "idle" }
      : EMPTY,
  );
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Bản tóm tắt gần nhất đã hoàn chỉnh (dùng làm nền cho lần cập nhật sau).
  const lastDoneRef = useRef<{ vi: string; coveredId?: number } | null>(saved?.vi ? { vi: saved.vi, coveredId: saved.coveredId } : null);

  /**
   * Tóm tắt. Đã có bản trước thì chỉ gửi phần hội thoại mới + bản cũ (tóm tắt cuốn chiếu), nên họp dài
   * vẫn gọn trong giới hạn của AI. `silent`: chạy nền, không báo lỗi (tự cập nhật trong lúc họp).
   */
  const run = useCallback(
    async (segments: Segment[], inProgress: boolean, names?: SpeakerNames, opts: { silent?: boolean; fresh?: boolean } = {}) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const count = countSpoken(segments);
      const coveredId = segments[segments.length - 1]?.id;
      const base = opts.fresh ? null : lastDoneRef.current;
      const fresh = base?.coveredId == null ? segments : segments.filter((x) => x.id > base.coveredId!);
      const previous = base && base.coveredId != null ? base.vi : undefined;
      setS((p) => ({ ...EMPTY, vi: opts.silent ? p.vi : "", zh: "", status: opts.silent ? p.status : "loading", count: p.count, coveredId: p.coveredId, at: p.at, inProgress }));
      try {
        let text = "";
        await streamSummary(
          {
            mode: "summary",
            transcript: buildTranscript(fresh, names),
            previous,
            glossary: readStorage(GLOSSARY_KEY),
            meetingContext: readStorage(MEETING_CONTEXT_KEY),
            inProgress,
            partner: getLangPair().partner,
            conversation: getConversationType(),
          },
          (vi) => {
            text = vi;
            if (!opts.silent) setS((p) => ({ ...p, vi, status: "streaming" }));
          },
          ctrl.signal,
        );
        lastDoneRef.current = { vi: text, coveredId };
        setS((p) => ({ ...p, vi: text, zh: "", zhStatus: "idle", status: "done", count, coveredId, at: Date.now(), error: null }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (opts.silent) {
          setS((p) => ({ ...p, status: p.vi ? "done" : "idle" }));
          return;
        }
        const message = toVietnamese(e, "Lỗi khi tóm tắt, thử lại nhé.");
        setS((p) => ({ ...p, status: "error", error: message }));
        toast({ id: "summary", kind: "error", title: "Chưa tóm tắt được", message });
      }
    },
    [toast],
  );

  const translate = useCallback(async (vi: string, lang: string) => {
    setS((p) => ({ ...p, zh: "", zhLang: lang, zhStatus: "loading" }));
    try {
      await streamSummary({ mode: "partner", lang, summary: vi }, (zh) =>
        setS((p) => ({ ...p, zh, zhStatus: "streaming" })),
      );
      setS((p) => ({ ...p, zhStatus: "done" }));
    } catch (e) {
      const message = toVietnamese(e, "Lỗi khi dịch bản tóm tắt, thử lại nhé.");
      setS((p) => ({ ...p, zhStatus: "error", error: message }));
      toast({ id: "summary-zh", kind: "error", title: "Chưa dịch được bản tóm tắt", message });
    }
  }, [toast]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    lastDoneRef.current = null;
    setS(EMPTY);
  }, []);

  return { summary: s, run, translate, reset };
}

export type SummaryApi = ReturnType<typeof useSummary>;

// Con dấu nhỏ cho từng mục: Ý chính · Đã thống nhất · Việc cần làm / hẹn · Con số & ngày giờ.
const SECTION_SEALS = ["Ý", "TN", "VL", "SỐ"];

type Section = { title: string; items: string[] };

function parse(markdown: string): Section[] {
  const sections: Section[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) sections.push({ title: line.slice(3), items: [] });
    else {
      if (!sections.length) sections.push({ title: "", items: [] });
      sections[sections.length - 1].items.push(line.replace(/^[-•*]\s*/, ""));
    }
  }
  return sections;
}

/** In đậm phần **…** */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <b key={i} className="font-semibold text-fg">
            {p.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function SummaryBody({ markdown, fontClass = "" }: { markdown: string; fontClass?: string }) {
  const sections = parse(markdown);
  return (
    <div className={`space-y-5 ${fontClass}`}>
      {sections.map((sec, si) => (
        <motion.section
          key={si}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 26 }}
        >
          {sec.title && (
            <div className="mb-2 flex items-center gap-2.5">
              <motion.span
                initial={{ scale: 2, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: -4, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.05 }}
                className="grid size-7 place-items-center rounded-lg bg-accent-strong text-[11px] font-extrabold text-on-accent"
              >
                {SECTION_SEALS[si] ?? "•"}
              </motion.span>
              <h3 className="text-[16px] font-semibold">{sec.title}</h3>
            </div>
          )}
          <ul className="space-y-2 pl-1">
            {sec.items.map((item, ii) => (
              <motion.li
                key={ii}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex gap-2.5 text-[16px] leading-relaxed text-fg-2"
              >
                <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-accent/70" />
                <span>
                  <Rich text={item} />
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.section>
      ))}
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center py-12 text-center text-[15px] text-fg-2"
    >
      <motion.div className="opacity-60">
        <Seal size={44} />
      </motion.div>
      <p className="mt-4 max-w-xs">{text}</p>
    </motion.div>
  );
}

export function Thinking({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <motion.div>
        <Seal size={56} />
      </motion.div>
      <p className="mt-5 text-[15px] font-medium">{label}</p>
      <div className="mt-6 w-full space-y-2.5">
        {[88, 72, 80, 56].map((w, i) => (
          <motion.div
            key={i}
            className="h-3 rounded-full bg-surface-2"
            style={{ width: `${w}%` }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function timeLabel(at: number | null) {
  if (!at) return "";
  return new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function SummaryPanel({
  api,
  segments,
  running,
  names,
  onShare,
}: {
  api: SummaryApi;
  segments: Segment[];
  running: boolean;
  names: SpeakerNames;
  /** Chia sẻ biên bản họp (tóm tắt + toàn bộ nội dung). */
  onShare?: () => void;
}) {
  const { summary, run, translate } = api;
  const [lang, setLang] = useState<Lang>("vi");
  const [copied, setCopied] = useState(false);
  const newLines = countSpoken(segments) - summary.count;
  const busy = summary.status === "loading" || summary.status === "streaming";
  // Tab thứ hai: bản tóm tắt bằng tiếng của đối tác (để đưa đối tác xem).
  const partner = partnerOf(segments);
  const partnerLabel = language(partner)?.native ?? langName(partner);
  const partnerShort = langName(partner).replace(/^Tiếng /, "");
  const text = lang === "vi" ? summary.vi : summary.zh;
  const currentStatus = lang === "vi" ? summary.status : summary.zhStatus;

  const pickLang = (l: Lang) => {
    setLang(l);
    const stale = (summary.zhLang ?? "zh") !== partner;
    if (l === "zh" && summary.status === "done" && (summary.zhStatus === "idle" || (stale && summary.zhStatus === "done")))
      void translate(summary.vi, partner);
  };

  const copy = async () => {
    if (await copyText(toPlainText(text))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="pb-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-2">
          {summary.at
            ? `${summary.inProgress ? "Đến" : "Lúc"} ${timeLabel(summary.at)} · ${summary.count} câu${summary.inProgress ? " · đang nói" : ""}`
            : ""}
        </p>
        <div className="grid shrink-0 grid-cols-2 rounded-xl bg-surface-2 p-0.5 text-[13px] ring-1 ring-line">
          {(["vi", "zh"] as const).map((l) => (
            <button
              key={l}
              onClick={() => pickLang(l)}
              disabled={busy}
              className={`relative h-8 rounded-[10px] px-3 font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${lang === l ? "text-fg" : "text-fg-2"}`}
            >
              {lang === l && (
                <motion.span
                  layoutId="summary-lang"
                  className="absolute inset-0 rounded-[10px] bg-surface shadow-sm ring-1 ring-line"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className={`relative ${l === "zh" ? langFont(partner) : ""}`}>{l === "vi" ? "Tiếng Việt" : partnerLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 min-h-[40dvh]">
        <AnimatePresence mode="wait">
          {currentStatus === "loading" || (currentStatus === "streaming" && !text) ? (
            <motion.div key="wait" exit={{ opacity: 0 }}>
              <Thinking label={lang === "vi" ? "Đang đọc lại cuộc trò chuyện…" : `Đang dịch sang ${langInline(partner)}…`} />
            </motion.div>
          ) : summary.status === "error" && lang === "vi" ? (
            <EmptyHint key="err" text="Chưa có bản tóm tắt. Bấm “Tóm tắt lại” để thử lần nữa." />
          ) : summary.zhStatus === "error" && lang === "zh" ? (
            <EmptyHint
              key="zherr"
              text={`Chưa có bản ${langInline(partner)}. Chuyển sang “Tiếng Việt” rồi bấm “${partnerLabel}” để thử lại.`}
            />
          ) : (
            <motion.div key={`body-${lang}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <SummaryBody markdown={text} fontClass={lang === "zh" ? langFont(summary.zhLang ?? "zh") : ""} />
              {currentStatus === "streaming" && (
                <motion.span
                  className="mt-2 inline-block h-5 w-1.5 rounded-full bg-accent align-middle"
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-surface pt-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={copy}
          disabled={!text || currentStatus !== "done"}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface-2 font-medium ring-1 ring-line disabled:opacity-40"
        >
          {copied ? <CheckIcon className="size-5 text-accent" /> : <CopyIcon className="size-5" />}
          {copied ? "Đã chép" : lang === "vi" ? "Chép bản Việt" : `Chép bản ${partnerShort}`}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            setLang("vi");
            void run(segments, running, names);
          }}
          disabled={busy || (summary.status === "done" && newLines <= 0)}
          className="btn-primary relative flex h-12 items-center justify-center gap-2 rounded-2xl font-semibold text-on-accent disabled:opacity-50"
        >
          <motion.span animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { duration: 1, repeat: Infinity, ease: "linear" } : undefined}>
            <RefreshIcon className="size-5" />
          </motion.span>
          {summary.status === "done" ? (newLines > 0 ? "Cập nhật" : "Đã mới nhất") : "Tóm tắt lại"}
          {newLines > 0 && !busy && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-2 -right-1 rounded-full bg-fg px-2 py-0.5 text-[11px] font-bold text-bg"
            >
              +{newLines} câu
            </motion.span>
          )}
        </motion.button>
        {onShare && summary.status === "done" && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onShare}
            className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-accent ring-1 ring-accent/30"
          >
            <ShareIcon className="size-[18px]" /> Chia sẻ nội dung (Zalo, Messenger…)
          </motion.button>
        )}
      </div>
    </div>
  );
}
