"use client";

// Thông báo dạng toast: trượt xuống từ mép trên (phía dưới là nút micro và câu mới nhất nên không che),
// xếp chồng tối đa 3 cái, vuốt lên để tắt, toast tự tắt có thanh thời gian chạy lùi.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export type ToastKind = "error" | "warning" | "success" | "info" | "loading";

export type ToastInput = {
  /** Cùng id thì toast cũ được thay bằng toast mới (không chồng trùng). */
  id?: string;
  kind?: ToastKind;
  title?: string;
  message: string;
  action?: { label: string; onClick: () => void };
  /** Icon riêng thay cho icon theo loại. */
  icon?: React.ReactNode;
  /** ms; null = không tự tắt. Mặc định: lỗi 7s, còn lại 2.8s. */
  duration?: number | null;
  onClose?: () => void;
};

type Toast = ToastInput & { id: string; kind: ToastKind; duration: number | null; key: number };

type Api = { toast: (t: ToastInput) => string; dismiss: (id: string) => void };

const ToastContext = createContext<Api>({ toast: () => "", dismiss: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const closers = useRef(new Map<string, () => void>());
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    const onClose = closers.current.get(id);
    closers.current.delete(id);
    onClose?.();
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const kind = input.kind ?? "info";
      const id = input.id ?? `t${++seq.current}`;
      const duration =
        input.duration !== undefined ? input.duration : kind === "error" ? 7000 : kind === "loading" ? null : 2800;
      const next: Toast = { ...input, id, kind, duration, key: ++seq.current };
      setToasts((list) => {
        // Bỏ toast trùng id hoặc trùng nội dung, rồi đưa toast mới lên đầu.
        const rest = list.filter((x) => x.id !== id && x.message !== input.message);
        return [next, ...rest].slice(0, MAX_VISIBLE);
      });
      if (input.onClose) closers.current.set(id, input.onClose);
      else closers.current.delete(id);
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      if (duration) timers.current.set(id, setTimeout(() => dismiss(id), duration));
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t, i) => (
            <ToastCard key={t.key} toast={t} index={i} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

const TONE: Record<ToastKind, { color: string; bg: string }> = {
  error: { color: "var(--danger)", bg: "color-mix(in oklab, var(--danger) 16%, transparent)" },
  warning: { color: "var(--warn)", bg: "color-mix(in oklab, var(--warn) 16%, transparent)" },
  success: { color: "var(--ok)", bg: "color-mix(in oklab, var(--ok) 16%, transparent)" },
  info: { color: "var(--accent)", bg: "var(--accent-soft)" },
  loading: { color: "var(--warn)", bg: "color-mix(in oklab, var(--warn) 16%, transparent)" },
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", className: "size-[18px]" };
  if (kind === "loading") {
    return (
      <motion.span
        className="block size-[18px] rounded-full border-2 border-current border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      />
    );
  }
  if (kind === "success") {
    return (
      <svg {...common}>
        <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.1 }} />
      </svg>
    );
  }
  if (kind === "info") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 7.5v.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  );
}

function ToastCard({ toast, index, onDismiss }: { toast: Toast; index: number; onDismiss: () => void }) {
  const tone = TONE[toast.kind];
  return (
    <motion.div
      layout
      role={toast.kind === "error" ? "alert" : "status"}
      className="pointer-events-auto relative w-full max-w-md cursor-grab touch-none overflow-hidden rounded-[20px] bg-surface shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] ring-1 ring-line active:cursor-grabbing"
      initial={{ opacity: 0, y: -48, scale: 0.9 }}
      animate={{ opacity: 1 - index * 0.12, y: 0, scale: 1 - index * 0.03 }}
      exit={{ opacity: 0, y: -30, scale: 0.92, transition: { duration: 0.22 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.6, bottom: 0.1 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -24 || info.velocity.y < -400) onDismiss();
      }}
    >
      <div className="flex items-start gap-3 p-3.5 pr-2">
        <motion.span
          className="grid size-8 shrink-0 place-items-center rounded-full"
          style={{ color: tone.color, background: tone.bg }}
          initial={{ scale: 0.4, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.05 }}
        >
          {toast.icon ?? <ToastIcon kind={toast.kind} />}
        </motion.span>
        <div className="min-w-0 flex-1 pt-1">
          {toast.title && <div className="text-[14px] leading-tight font-semibold">{toast.title}</div>}
          <p className={`text-[14px] leading-snug ${toast.title ? "mt-0.5 text-fg-2" : "text-fg"}`}>{toast.message}</p>
        </div>
        {toast.action && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className="btn-primary mt-0.5 shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-on-accent"
          >
            {toast.action.label}
          </motion.button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng thông báo"
          className="grid size-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg-2"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {/* Thanh thời gian chạy lùi cho toast tự tắt */}
      {toast.duration && (
        <motion.span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] rounded-full"
          style={{ background: tone.color, opacity: 0.6 }}
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: toast.duration / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}
