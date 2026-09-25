export type SegmentLatency = {
  /** Người nói dứt câu → bản dịch final cuối cùng về tới máy. */
  translationDoneMs?: number;
  /** Người nói dứt câu → nhận "<end>" (câu được chốt). */
  endMs?: number;
  /** Người nói dứt câu → token dịch đầu tiên (âm = dịch đã bắt đầu từ khi đang nói). */
  firstTranslationMs?: number;
};

export type LatencyStats = {
  count: number;
  mean: number;
  p50: number;
  p90: number;
  max: number;
  under2sPct: number;
};

function percentile(sorted: number[], p: number) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function computeStats(values: number[]): LatencyStats | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: sorted[sorted.length - 1],
    under2sPct: (sorted.filter((v) => v < 2000).length / sorted.length) * 100,
  };
}

export function formatSeconds(ms: number | undefined) {
  return ms == null ? "–" : `${(ms / 1000).toFixed(2)}s`;
}
