"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { AI_TEMPLATE_KEY, readStorage, writeStorage } from "@/lib/browser/storage";
import { copyText } from "@/lib/browser/clipboard";
import { AI_TEMPLATES, aiUrl, buildAiText, isCustomized, promptFor, savePrompt } from "@/lib/meeting/ai-export";
import type { SavedMeeting } from "@/lib/meeting/storage";
import { CopyIcon, ExternalIcon } from "./icons";
import { useToast } from "./toast";

/**
 * Bảng "Gửi cho AI": chọn mục đích (báo giá, hợp đồng…) → chép lời nhờ + cả cuộc trò chuyện → mở ChatGPT / Claude để dán.
 * Dùng tài khoản AI riêng của người dùng (đã "train" theo cách làm việc của họ), không tốn tiền AI của app.
 */
export function AiExportPanel({ meeting }: { meeting: SavedMeeting }) {
  const { toast } = useToast();
  const [id, setId] = useState(() => {
    const saved = readStorage(AI_TEMPLATE_KEY, "quote");
    return AI_TEMPLATES.some((t) => t.id === saved) ? saved : "quote";
  });
  const [prompt, setPrompt] = useState(() => promptFor(id));
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState(() => isCustomized(id));
  const lines = meeting.segments.filter((s) => s.originalFinal.trim()).length;

  const pick = (next: string) => {
    setId(next);
    writeStorage(AI_TEMPLATE_KEY, next);
    setPrompt(promptFor(next));
    setCustom(isCustomized(next));
    setEditing(false);
  };

  const send = (target?: "chatgpt" | "claude") => {
    const text = buildAiText(meeting, prompt);
    // Chép trước (ngay trong lần bấm), rồi mới mở tab mới – tránh trình duyệt chặn.
    const copying = copyText(text);
    if (target) window.open(aiUrl(target, text), "_blank", "noopener");
    void copying.then((ok) =>
      toast(
        ok
          ? {
              kind: "success",
              message: target
                ? `Đã chép ${lines} câu – dán (giữ và chọn Dán / Ctrl+V) vào ô chat của ${target === "chatgpt" ? "ChatGPT" : "Claude"}`
                : `Đã chép ${lines} câu kèm lời nhờ – dán vào ChatGPT, Claude hay bất kỳ AI nào`,
            }
          : { kind: "warning", message: "Không chép được, thử lại nhé" },
      ),
    );
  };

  return (
    <div className="space-y-4 pb-2">
      <p className="text-[14px] leading-relaxed text-fg-2">
        Chọn việc cần làm. App chép sẵn <b className="text-fg">lời nhờ + toàn bộ {lines} câu</b> để dán vào ChatGPT hay
        Claude của bạn.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {AI_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            className={`rounded-2xl p-3 text-left ring-1 transition-colors ${
              id === t.id ? "bg-accent-soft ring-accent/50" : "bg-surface-2 ring-line"
            }`}
          >
            <span className="block text-[14px] font-semibold">{t.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-fg-2">{t.desc}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-surface-2 ring-1 ring-line">
        <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
          <span className="text-[13px] font-medium text-fg-2">Lời nhờ AI{custom ? " (đã sửa)" : ""}</span>
          <div className="flex gap-3 text-[13px] font-semibold text-accent">
            {custom && (
              <button
                type="button"
                onClick={() => {
                  savePrompt(id, null);
                  setPrompt(promptFor(id));
                  setCustom(false);
                }}
              >
                Mẫu gốc
              </button>
            )}
            <button type="button" onClick={() => setEditing((v) => !v)}>
              {editing ? "Xong" : "Sửa"}
            </button>
          </div>
        </div>
        {editing ? (
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              savePrompt(id, e.target.value);
              setCustom(isCustomized(id));
            }}
            rows={10}
            className="mt-2 w-full resize-none rounded-b-2xl bg-transparent px-3.5 pb-3 text-[14px] leading-relaxed outline-none"
          />
        ) : (
          <p className="line-clamp-4 px-3.5 pt-1.5 pb-3 text-[13px] leading-relaxed whitespace-pre-line text-fg-3">{prompt}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["chatgpt", "Mở ChatGPT"],
            ["claude", "Mở Claude"],
          ] as const
        ).map(([target, label]) => (
          <motion.button
            key={target}
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={!lines}
            onClick={() => send(target)}
            className="btn-primary flex h-12 items-center justify-center gap-2 rounded-2xl font-semibold text-on-accent disabled:opacity-40"
          >
            <ExternalIcon className="size-[18px]" /> {label}
          </motion.button>
        ))}
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          disabled={!lines}
          onClick={() => send()}
          className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-[14px] font-semibold ring-1 ring-line disabled:opacity-40"
        >
          <CopyIcon className="size-[18px]" /> Chỉ chép (dán vào AI khác)
        </motion.button>
      </div>
      <p className="text-[12px] leading-relaxed text-fg-3">
        Mẹo: tạo sẵn một Project / GPT riêng chứa bảng giá, mẫu hợp đồng của bạn rồi dán vào đó, AI sẽ làm đúng kiểu của bạn.
      </p>
    </div>
  );
}
