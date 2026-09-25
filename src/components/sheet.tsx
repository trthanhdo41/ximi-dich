"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect } from "react";

/** Bảng trượt lên từ đáy màn hình (vuốt xuống hoặc chạm nền mờ để đóng). */
export function Sheet({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Icon nhỏ cạnh tiêu đề (Lucide). */
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Chỉ kéo được ở phần tay cầm/tiêu đề, để không vướng khi gõ chữ hay cuộn nội dung.
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow)] ring-1 ring-line sm:rounded-[28px]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="-mx-5 -mt-5 shrink-0 touch-none px-5 pt-5" onPointerDown={(e) => drag.start(e)}>
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-fg-3/40 sm:hidden" />
              <h2 className="mb-4 flex items-center gap-2.5 text-lg font-semibold">
                {icon && (
                  <span className="text-fg-2">{icon}</span>
                )}
                {title}
              </h2>
            </div>
            <div className="no-scrollbar -mx-5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
