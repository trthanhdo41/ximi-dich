"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Segment } from "@/lib/soniox/segments";
import { clearHistory, deleteFromHistory, loadHistory, type SavedMeeting } from "@/lib/meeting/storage";
import { downloadMarkdown, meetingSpan, meetingToMarkdown, shareMeeting } from "@/lib/meeting/export";
import { copyText } from "@/lib/browser/clipboard";
import { PINYIN_KEY, readStorage } from "@/lib/browser/storage";
import { usePinyinReady } from "@/lib/pinyin";
import { isMine } from "./bubble";
import { TranscriptItem, type TranscriptView } from "./transcript-item";
import { EmptyHint, SummaryBody } from "./summary-panel";
import { ChatIcon, ChevronLeftIcon, ClockIcon, CopyIcon, DownloadIcon, ShareIcon, NotebookIcon, SparkleIcon, StarIcon, TimerIcon, TrashIcon } from "./icons";
import { AiExportPanel } from "./ai-export";
import { Sheet } from "./sheet";

/**
 * Nút xoá chạm 2 lần: lần 1 chuyển đỏ "Xoá?", lần 2 mới xoá thật; để yên 3 giây thì tự trở lại.
 * `compact`: chỉ hiện icon thùng rác (trên thẻ / thanh tiêu đề).
 */
function ConfirmDelete({
  onConfirm,
  label,
  confirmLabel = "Xoá?",
  compact = false,
}: {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  compact?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <motion.button
      type="button"
      layout
      whileTap={{ scale: 0.9 }}
      aria-label={armed ? `Chạm lần nữa để ${label.toLowerCase()}` : label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
      className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors ${
        armed ? "bg-danger px-3 text-on-accent" : compact ? "w-9 text-fg-3 hover:bg-surface-2 hover:text-danger" : "px-3 text-danger"
      }`}
    >
      <TrashIcon className="size-[18px]" />
      {(armed || !compact) && <span>{armed ? confirmLabel : label}</span>}
    </motion.button>
  );
}

function Meta({ icon, children, className = "" }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {icon}
      {children}
    </span>
  );
}
import { useToast } from "./toast";

const slide = { type: "spring", stiffness: 380, damping: 36 } as const;

/** Màn hình Lịch sử: danh sách cuộc họp đã lưu trong máy → xem lại, chia sẻ, tải biên bản, xoá. */
export function HistoryScreen({
  open,
  onClose,
  current,
  view,
  running,
  onDeleteCurrent,
  speakingId,
  onSpeak,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  /** Cuộc họp đang diễn ra (chưa cất vào lịch sử). */
  current: SavedMeeting | null;
  view: TranscriptView;
  /** Đang nghe → không cho xoá cuộc họp hiện tại. */
  running: boolean;
  /** Xoá cuộc họp hiện tại (làm trống màn hình chính). */
  onDeleteCurrent: () => void;
  speakingId: number | null;
  onSpeak: (seg: Segment) => void;
  onCopy: (seg: Segment) => Promise<boolean>;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="history"
          className="fixed inset-0 z-50 flex flex-col bg-bg"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={slide}
        >
          <HistoryView
            current={current}
            view={view}
            running={running}
            onDeleteCurrent={onDeleteCurrent}
            onClose={onClose}
            speakingId={speakingId}
            onSpeak={onSpeak}
            onCopy={onCopy}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HistoryView({
  current,
  view,
  running,
  onDeleteCurrent,
  onClose,
  speakingId,
  onSpeak,
  onCopy,
}: {
  current: SavedMeeting | null;
  view: TranscriptView;
  running: boolean;
  onDeleteCurrent: () => void;
  onClose: () => void;
  speakingId: number | null;
  onSpeak: (seg: Segment) => void;
  onCopy: (seg: Segment) => Promise<boolean>;
}) {
  // Đọc lịch sử một lần mỗi khi mở màn hình (mới nhất lên đầu).
  const [items, setItems] = useState<SavedMeeting[]>(() => [...loadHistory()].reverse());
  const [selected, setSelected] = useState<SavedMeeting | null>(null);
  const all = useMemo(
    () => (current?.segments.length ? [current, ...items.filter((m) => m.id !== current.id)] : items),
    [current, items],
  );
  const { toast } = useToast();

  /** Xoá một cuộc họp (cuộc hiện tại thì phải dừng nghe trước). */
  const remove = (m: SavedMeeting) => {
    if (m.id === current?.id) {
      if (running) {
        toast({ kind: "warning", message: "Đang nghe – bấm dừng micro trước rồi mới xoá cuộc trò chuyện hiện tại." });
        return;
      }
      onDeleteCurrent();
    } else {
      deleteFromHistory(m.id);
      setItems((list) => list.filter((x) => x.id !== m.id));
    }
    if (selected?.id === m.id) setSelected(null);
    toast({ kind: "success", message: "Đã xoá cuộc trò chuyện" });
  };

  const removeAll = () => {
    clearHistory();
    setItems([]);
    if (current?.segments.length && !running) onDeleteCurrent();
    toast({
      kind: "success",
      message: running && current?.segments.length ? "Đã xoá lịch sử (giữ lại cuộc trò chuyện đang nghe)" : "Đã xoá toàn bộ lịch sử",
    });
  };

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => (selected ? setSelected(null) : onClose())}
          aria-label={selected ? "Về danh sách" : "Đóng lịch sử"}
          className="grid size-10 place-items-center rounded-full text-fg-2 hover:bg-surface"
        >
          <ChevronLeftIcon className="size-6" />
        </motion.button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={selected ? "detail" : "list"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="min-w-0 flex-1 truncate text-[17px] font-semibold"
          >
            {selected ? dayLabel(selected.startedAt) : "Lịch sử trò chuyện"}
          </motion.h2>
        </AnimatePresence>
        {selected ? (
          <ConfirmDelete compact label="Xoá cuộc trò chuyện này" onConfirm={() => remove(selected)} />
        ) : (
          all.length > 0 && <ConfirmDelete label="Xoá tất cả" confirmLabel="Chạm lần nữa để xoá hết" onConfirm={removeAll} />
        )}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {selected ? (
            <motion.div
              key={`d-${selected.id}`}
              className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain"
              initial={{ x: "30%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "30%", opacity: 0 }}
              transition={slide}
            >
              <MeetingDetail
                meeting={selected}
                view={view}
                isCurrent={selected.id === current?.id}
                speakingId={speakingId}
                onSpeak={onSpeak}
                onCopy={onCopy}
              />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              initial={{ x: "-20%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-20%", opacity: 0 }}
              transition={slide}
            >
              {all.length === 0 ? (
                <EmptyHint text="Chưa có cuộc trò chuyện nào được lưu. Bấm micro để bắt đầu." />
              ) : (
                <motion.ul
                  className="mx-auto max-w-2xl space-y-3"
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.05 } } }}
                >
                  <AnimatePresence initial={false}>
                    {all.map((m) => (
                      <MeetingCard
                        key={m.id}
                        meeting={m}
                        isCurrent={m.id === current?.id}
                        onOpen={() => setSelected(m)}
                        onDelete={() => remove(m)}
                      />
                    ))}
                  </AnimatePresence>
                </motion.ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function dayLabel(ms: number) {
  return new Date(ms).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Một dòng tóm tắt để nhận ra cuộc họp: ý chính đầu tiên, hoặc câu dịch đầu tiên. */
function snippet(m: SavedMeeting) {
  const firstPoint = m.summary?.vi.split("\n").find((l) => /^\s*[-•]\s/.test(l));
  if (firstPoint) return firstPoint.replace(/^\s*[-•]\s*/, "").replace(/\*\*/g, "");
  const first = m.segments.find((s) => s.translationFinal || s.originalFinal);
  return first ? first.translationFinal || first.originalFinal : "";
}

function MeetingCard({
  meeting: m,
  isCurrent,
  onOpen,
  onDelete,
}: {
  meeting: SavedMeeting;
  isCurrent: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const stars = m.segments.filter((s) => s.starred).length;
  const minutes = Math.max(1, Math.round((meetingSpan(m).end - meetingSpan(m).start) / 60000));
  return (
    <motion.li
      layout
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: slide } }}
      exit={{ opacity: 0, x: -60, height: 0, marginTop: 0, transition: { duration: 0.25 } }}
      className="relative"
    >
      <div className="absolute top-3 right-3 z-10">
        <ConfirmDelete compact label="Xoá cuộc trò chuyện này" onConfirm={onDelete} />
      </div>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={onOpen}
        className="w-full rounded-[22px] bg-surface p-4 pr-14 text-left ring-1 ring-line"
      >
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold capitalize">{dayLabel(m.startedAt)}</span>
          {isCurrent && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Hiện tại</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-fg-2">
          <Meta icon={<ClockIcon className="size-3.5" />} className="tabular-nums">{meetingSpan(m).text}</Meta>
          <Meta icon={<TimerIcon className="size-3.5" />}>{minutes} phút</Meta>
          <Meta icon={<ChatIcon className="size-3.5" />}>{m.segments.length} câu</Meta>
          {stars > 0 && (
            <Meta icon={<StarIcon className="size-3.5" filled />} className="text-accent">
              {stars}
            </Meta>
          )}
          {m.summary?.vi && <Meta icon={<NotebookIcon className="size-3.5" />}>Có tóm tắt</Meta>}
        </div>
        {snippet(m) && <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-fg">{snippet(m)}</p>}
      </motion.button>
    </motion.li>
  );
}

function MeetingDetail({
  meeting: m,
  view,
  isCurrent,
  speakingId,
  onSpeak,
  onCopy,
}: {
  meeting: SavedMeeting;
  view: TranscriptView;
  isCurrent: boolean;
  speakingId: number | null;
  onSpeak: (seg: Segment) => void;
  onCopy: (seg: Segment) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [onlyStars, setOnlyStars] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [pinyinOn] = useState(() => readStorage(PINYIN_KEY, "1") !== "0");
  const pinyin = usePinyinReady(pinyinOn);
  const shown = onlyStars ? m.segments.filter((s) => s.starred) : m.segments;

  const share = async () => {
    const result = await shareMeeting(m);
    if (result === "unsupported") {
      downloadMarkdown(m);
      toast({ kind: "success", message: "Máy chưa hỗ trợ chia sẻ, đã tải file nội dung về máy" });
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-fg-2 tabular-nums">
        <Meta icon={<ClockIcon className="size-4" />}>{meetingSpan(m).text}</Meta>
        <Meta icon={<ChatIcon className="size-4" />}>{m.segments.length} câu</Meta>
        {isCurrent && <span className="text-accent">đang diễn ra</span>}
      </p>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        <ActionChip onClick={() => setAiOpen(true)} icon={<SparkleIcon className="size-[18px]" />} label="Gửi cho AI" primary />
        <ActionChip onClick={share} icon={<ShareIcon className="size-[18px]" />} label="Chia sẻ" />
        <ActionChip
          onClick={() => {
            downloadMarkdown(m);
            toast({ kind: "success", message: "Đã tải nội dung (.md) về máy" });
          }}
          icon={<DownloadIcon className="size-[18px]" />}
          label="Tải .md"
        />
        <ActionChip
          onClick={async () => {
            if (await copyText(meetingToMarkdown(m))) toast({ kind: "success", message: "Đã chép toàn bộ nội dung" });
          }}
          icon={<CopyIcon className="size-[18px]" />}
          label="Chép"
        />
      </div>

      <Sheet open={aiOpen} onClose={() => setAiOpen(false)} title="Gửi cho AI" icon={<SparkleIcon className="size-[18px]" />}>
        {aiOpen && <AiExportPanel meeting={m} />}
      </Sheet>

      {m.summary?.vi && (
        <section className="mt-5 rounded-[22px] bg-surface p-4 ring-1 ring-line">
          <h3 className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold text-fg-2">
            <NotebookIcon className="size-4" /> Tóm tắt
          </h3>
          <SummaryBody markdown={m.summary.vi} />
        </section>
      )}

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-fg-2">Toàn bộ nội dung</h3>
        <button
          onClick={() => setOnlyStars((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 transition-colors ${
            onlyStars ? "bg-accent-soft text-accent ring-accent/40" : "text-fg-2 ring-line"
          }`}
        >
          <StarIcon className="size-4" filled={onlyStars} /> Chỉ câu quan trọng
        </button>
      </div>

      <div className={`flex flex-col ${view === "bubbles" ? "gap-3" : ""}`}>
        {shown.length === 0 && <p className="py-8 text-center text-[14px] text-fg-3">Chưa có câu nào được đánh dấu quan trọng.</p>}
        {shown.map((seg, i) => (
          <TranscriptItem
            view={view}
            pinyin={pinyin}
            key={seg.id}
            seg={seg}
            name={seg.speaker ? m.speakers?.[seg.speaker] : undefined}
            continued={!!seg.speaker && shown[i - 1]?.speaker === seg.speaker && isMine(shown[i - 1]) === isMine(seg)}
            speaking={speakingId === seg.id}
            onSpeak={onSpeak}
            onCopy={onCopy}
          />
        ))}
      </div>

    </div>
  );
}

function ActionChip({
  onClick,
  icon,
  label,
  primary,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold ${
        primary ? "btn-primary text-on-accent" : "bg-surface ring-1 ring-line"
      }`}
    >
      {icon}
      {label}
    </motion.button>
  );
}
