"use client";

import type { Segment } from "@/lib/soniox/segments";
import { Bubble } from "./bubble";
import { TranscriptLine } from "./transcript-line";

export type TranscriptView = "lines" | "bubbles";

type Props = {
  view: TranscriptView;
  seg: Segment;
  name?: string;
  continued?: boolean;
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

/** Hiển thị một câu theo kiểu người dùng chọn: Dòng thoại (mặc định) hoặc bong bóng chat. */
export function TranscriptItem({ view, latest, ...props }: Props) {
  return view === "bubbles" ? <Bubble {...props} /> : <TranscriptLine latest={latest} {...props} />;
}
