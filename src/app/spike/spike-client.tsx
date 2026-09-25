"use client";

import { DEFAULT_PAIR } from "@/lib/languages";

// Phase 0 – Spike: kiểm chứng Soniox nghe được giọng các sếp + đo độ trễ.
// Trang thô, chưa phải UI chính thức.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioClock,
  createAudioContext,
  FileSource,
  MicSource,
  type AudioSource,
} from "@/lib/audio/sources";
import {
  backgroundFor,
  buildSonioxConfig,
  DEFAULT_STT_OPTIONS,
  parseTerms,
  parseTranslationTerms,
  SAMPLE_RATE,
  type SttOptions,
} from "@/lib/soniox/config";
import { SegmentBuilder, type Segment } from "@/lib/soniox/segments";
import { fetchTemporaryKey, SonioxSession, type SonioxResponse } from "@/lib/soniox/session";
import { computeStats, formatSeconds, type SegmentLatency } from "@/lib/latency";
import { toVietnamese } from "@/lib/errors";

type Status = "idle" | "connecting" | "running" | "finishing";
type SourceKind = "mic" | "file";

const SPEAKER_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171"];

function readStorage(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // bỏ qua (chế độ riêng tư)
  }
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SpikeClient() {
  const [sourceKind, setSourceKind] = useState<SourceKind>("mic");
  const [file, setFile] = useState<File | null>(null);
  const [playAloud, setPlayAloud] = useState(true);
  const [browserProcessing, setBrowserProcessing] = useState(true);
  const [opts, setOpts] = useState<SttOptions>(() => ({ ...DEFAULT_STT_OPTIONS, backgroundText: backgroundFor(DEFAULT_PAIR) }));
  const [termsText, setTermsText] = useState(() => readStorage("spike-terms"));
  const [translationTermsText, setTranslationTermsText] = useState(() =>
    readStorage("spike-translation-terms"),
  );

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [latencies, setLatencies] = useState<Record<number, SegmentLatency>>({});
  const [level, setLevel] = useState(0);
  const [audioSec, setAudioSec] = useState(0);
  const [fileDuration, setFileDuration] = useState(0);

  const sessionRef = useRef<SonioxSession | null>(null);
  const sourceRef = useRef<AudioSource | null>(null);
  const builderRef = useRef<SegmentBuilder | null>(null);
  const clockRef = useRef<AudioClock | null>(null);
  const rawRef = useRef<{ at: number; res: SonioxResponse }[]>([]);
  const startedAtRef = useRef<Date | null>(null);
  const configUsedRef = useRef<object | null>(null);

  const teardown = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const failWith = useCallback(
    (message: string) => {
      setError(message);
      teardown();
      // Giữ lại toàn bộ transcript đã có.
      builderRef.current?.close(performance.now());
      if (builderRef.current) setSegments(builderRef.current.snapshot());
      setStatus("idle");
    },
    [teardown],
  );

  const handleStart = async () => {
    setError(null);
    if (sourceKind === "file" && !file) return setError("Chọn file ghi âm trước.");
    if (!window.isSecureContext || !navigator.mediaDevices) {
      if (sourceKind === "mic")
        return setError(
          "Trình duyệt chỉ cho dùng micro trên HTTPS. Mở bằng https:// hoặc localhost.",
        );
    }

    // iOS Safari: AudioContext phải được tạo ngay trong thao tác bấm, trước mọi await.
    const ctx = createAudioContext();
    writeStorage("spike-terms", termsText);
    writeStorage("spike-translation-terms", translationTermsText);

    setStatus("connecting");
    setSegments([]);
    setLatencies({});
    setAudioSec(0);
    rawRef.current = [];
    startedAtRef.current = new Date();

    const builder = new SegmentBuilder();
    const clock = new AudioClock();
    builderRef.current = builder;
    clockRef.current = clock;

    builder.onClose = (seg) => {
      const speechEndWall = seg.speechEndMs != null ? clock.wallAt(seg.speechEndMs) : undefined;
      if (speechEndWall == null) return;
      const lat: SegmentLatency = {
        translationDoneMs:
          seg.translationDoneAt != null ? seg.translationDoneAt - speechEndWall : undefined,
        endMs: seg.endedAt != null ? seg.endedAt - speechEndWall : undefined,
        firstTranslationMs:
          seg.firstTranslationAt != null ? seg.firstTranslationAt - speechEndWall : undefined,
      };
      setLatencies((prev) => ({ ...prev, [seg.id]: lat }));
    };

    const source: AudioSource =
      sourceKind === "mic"
        ? new MicSource(ctx, browserProcessing)
        : new FileSource(ctx, file!, playAloud);
    sourceRef.current = source;

    try {
      const fileSource = source instanceof FileSource ? source : null;
      const [apiKey] = await Promise.all([fetchTemporaryKey(), fileSource?.prepare()]);
      if (fileSource) setFileDuration(fileSource.duration);

      const fullOpts: SttOptions = {
        ...opts,
        terms: parseTerms(termsText),
        translationTerms: parseTranslationTerms(translationTermsText),
      };
      const config = buildSonioxConfig(apiKey, fullOpts);
      configUsedRef.current = { ...config, api_key: "(ẩn)" };

      const session = new SonioxSession({
        onResponse: (res, receivedAt) => {
          rawRef.current.push({ at: receivedAt, res });
          if (res.tokens?.length) {
            builder.ingest(res.tokens, receivedAt);
            setSegments(builder.snapshot());
          }
        },
        onError: (message) => failWith(message),
        onFinished: () => {
          builder.close(performance.now());
          setSegments(builder.snapshot());
          teardown();
          setStatus("idle");
        },
      });
      sessionRef.current = session;
      await session.open(config);

      source.onEnded = () => {
        setStatus("finishing");
        session.finish();
      };
      await source.start(({ pcm, rms }) => {
        clock.mark(pcm.byteLength / 2, performance.now());
        session.sendAudio(pcm);
        setLevel(rms);
        setAudioSec(clock.audioMs / 1000);
      });
      setStatus("running");
    } catch (e) {
      failWith(toVietnamese(e));
    }
  };

  const handleStop = () => {
    setStatus("finishing");
    sourceRef.current?.stop();
    sourceRef.current = null;
    setLevel(0);
    const session = sessionRef.current;
    session?.finish();
    // Phòng khi không nhận được "finished".
    setTimeout(() => {
      if (session && sessionRef.current === session) {
        builderRef.current?.close(performance.now());
        if (builderRef.current) setSegments(builderRef.current.snapshot());
        teardown();
        setStatus("idle");
      }
    }, 8000);
  };

  const stats = useMemo(
    () =>
      computeStats(
        Object.values(latencies)
          .map((l) => l.translationDoneMs)
          .filter((v): v is number => v != null),
      ),
    [latencies],
  );

  const speakerColor = (speaker?: string) =>
    speaker ? SPEAKER_COLORS[(Number(speaker) - 1) % SPEAKER_COLORS.length] : "#9ca3af";

  const exportJson = () => {
    download(
      `spike-${Date.now()}.json`,
      JSON.stringify(
        {
          startedAt: startedAtRef.current,
          source: sourceKind === "file" ? { kind: "file", name: file?.name } : { kind: "mic" },
          browserProcessing,
          config: configUsedRef.current,
          stats,
          segments: segments.map((s) => ({
            id: s.id,
            speaker: s.speaker,
            language: s.language,
            original: s.originalFinal + s.originalPartial,
            translation: s.translationFinal + s.translationPartial,
            speechEndMs: s.speechEndMs,
            avgConfidence: s.avgConfidence,
            latency: latencies[s.id],
          })),
          rawResponses: rawRef.current,
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  const exportTxt = () => {
    const lines = segments.map((s) => {
      const lat = latencies[s.id];
      const time = s.speechEndMs != null ? `${(s.speechEndMs / 1000).toFixed(1)}s` : "";
      return [
        `[${time}] Người ${s.speaker ?? "?"} (${s.language ?? "?"}) — trễ ${formatSeconds(lat?.translationDoneMs)}`,
        `  Gốc:  ${s.originalFinal + s.originalPartial}`,
        `  Dịch: ${s.translationFinal + s.translationPartial}`,
      ].join("\n");
    });
    const header = stats
      ? `Số câu: ${stats.count} | TB ${formatSeconds(stats.mean)} | p50 ${formatSeconds(stats.p50)} | p90 ${formatSeconds(stats.p90)} | max ${formatSeconds(stats.max)} | <2s: ${stats.under2sPct.toFixed(0)}%\n\n`
      : "";
    download(`spike-${Date.now()}.txt`, header + lines.join("\n\n"), "text/plain;charset=utf-8");
  };

  const busy = status !== "idle";
  const setOpt = <K extends keyof SttOptions>(key: K, value: SttOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: value }));

  return (
    <main className="mx-auto w-full max-w-3xl p-4 pb-24 text-sm">
      <h1 className="text-xl font-semibold">Phase 0 · Test nghe &amp; dịch Trung ↔ Việt</h1>
      <p className="mt-1 opacity-60">
        Soniox stt-rt-v5 · dịch một chiều zh → vi · audio PCM 16 kHz · đo độ trễ từng câu
      </p>

      {/* Cài đặt */}
      <section className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">

        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0">Nguồn âm thanh</span>
          {(["mic", "file"] as const).map((k) => (
            <button
              key={k}
              disabled={busy}
              onClick={() => setSourceKind(k)}
              className={`rounded-md px-3 py-1 ${sourceKind === k ? "bg-blue-500 text-white" : "bg-white/10"}`}
            >
              {k === "mic" ? "Nói trực tiếp" : "File ghi âm"}
            </button>
          ))}
        </div>

        {sourceKind === "file" ? (
          <div className="space-y-2 pl-30">
            <input
              type="file"
              accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.ogg,.webm"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={playAloud} disabled={busy} onChange={(e) => setPlayAloud(e.target.checked)} />
              Phát tiếng ra loa khi chạy (file được phát đúng tốc độ thật để đo độ trễ)
            </label>
          </div>
        ) : (
          <label className="flex items-center gap-2 pl-30">
            <input type="checkbox" checked={browserProcessing} disabled={busy} onChange={(e) => setBrowserProcessing(e.target.checked)} />
            Lọc ồn + tự chỉnh âm lượng của trình duyệt
          </label>
        )}

        <details className="rounded-lg bg-black/20 p-3">
          <summary className="cursor-pointer select-none">Tham số nhận dạng &amp; thuật ngữ</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={opts.diarization} disabled={busy} onChange={(e) => setOpt("diarization", e.target.checked)} />
              Phân biệt người nói (diarization)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={opts.strictLanguages} disabled={busy} onChange={(e) => setOpt("strictLanguages", e.target.checked)} />
              Chỉ nhận tiếng Trung &amp; tiếng Việt (language_hints_strict)
            </label>
            <label className="block">
              Độ nhạy tách câu: {opts.endpointSensitivity.toFixed(1)}{" "}
              <span className="opacity-50">(cao = tách sớm hơn)</span>
              <input type="range" min={-1} max={1} step={0.1} value={opts.endpointSensitivity} disabled={busy}
                onChange={(e) => setOpt("endpointSensitivity", Number(e.target.value))} className="block w-full" />
            </label>
            <label className="block">
              Mức giảm trễ: {opts.endpointLatencyLevel}{" "}
              <span className="opacity-50">(0–3, cao = chốt câu nhanh hơn, có thể kém chính xác hơn)</span>
              <input type="range" min={0} max={3} step={1} value={opts.endpointLatencyLevel} disabled={busy}
                onChange={(e) => setOpt("endpointLatencyLevel", Number(e.target.value))} className="block w-full" />
            </label>
            <label className="block">
              Chờ tối đa sau khi dứt câu: {opts.maxEndpointDelayMs} ms
              <input type="range" min={500} max={3000} step={100} value={opts.maxEndpointDelayMs} disabled={busy}
                onChange={(e) => setOpt("maxEndpointDelayMs", Number(e.target.value))} className="block w-full" />
            </label>
            <label className="block">
              Thuật ngữ (tên người, công ty, sản phẩm… mỗi dòng một từ)
              <textarea rows={3} value={termsText} disabled={busy} onChange={(e) => setTermsText(e.target.value)}
                placeholder={"王总\n深圳华强\n注塑机"} className="mt-1 w-full rounded-md border border-white/20 bg-transparent p-2" />
            </label>
            <label className="block">
              Dịch cố định (mỗi dòng: <code>nguồn =&gt; đích</code>)
              <textarea rows={3} value={translationTermsText} disabled={busy} onChange={(e) => setTranslationTermsText(e.target.value)}
                placeholder={"王总 => Tổng giám đốc Vương\n注塑机 => máy ép nhựa"} className="mt-1 w-full rounded-md border border-white/20 bg-transparent p-2" />
            </label>
            <label className="block">
              Bối cảnh cuộc họp (tiếng Anh/Trung/Việt đều được)
              <textarea rows={4} value={opts.backgroundText} disabled={busy} onChange={(e) => setOpt("backgroundText", e.target.value)}
                className="mt-1 w-full rounded-md border border-white/20 bg-transparent p-2" />
            </label>
          </div>
        </details>
      </section>

      {/* Điều khiển */}
      <section className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-3 bg-[var(--background)] py-3">
        {status === "idle" ? (
          <button onClick={handleStart} className="rounded-full bg-blue-500 px-6 py-3 text-base font-semibold text-white">
            Bắt đầu
          </button>
        ) : (
          <button onClick={handleStop} disabled={status !== "running"}
            className="rounded-full bg-red-500 px-6 py-3 text-base font-semibold text-white disabled:opacity-50">
            {status === "connecting" ? "Đang kết nối…" : status === "finishing" ? "Đang chốt…" : "Dừng"}
          </button>
        )}
        <div className="h-2 w-24 overflow-hidden rounded bg-white/10" title="Âm lượng">
          <div className="h-full bg-green-400 transition-[width]" style={{ width: `${Math.min(100, level * 400)}%` }} />
        </div>
        <span className="tabular-nums opacity-70">
          {audioSec.toFixed(1)}s{sourceKind === "file" && fileDuration ? ` / ${fileDuration.toFixed(1)}s` : ""}
        </span>
        {segments.length > 0 && !busy && (
          <>
            <button onClick={exportTxt} className="rounded-md bg-white/10 px-3 py-1">Tải .txt</button>
            <button onClick={exportJson} className="rounded-md bg-white/10 px-3 py-1">Tải .json (chi tiết)</button>
          </>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300">{error}</div>
      )}

      {/* Thống kê độ trễ */}
      {stats && (
        <section className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {[
            ["Số câu", String(stats.count)],
            ["Trung bình", formatSeconds(stats.mean)],
            ["p50", formatSeconds(stats.p50)],
            ["p90", formatSeconds(stats.p90)],
            ["Chậm nhất", formatSeconds(stats.max)],
            ["< 2 giây", `${stats.under2sPct.toFixed(0)}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/5 p-2">
              <div className="text-xs opacity-60">{label}</div>
              <div className="text-base font-semibold tabular-nums">{value}</div>
            </div>
          ))}
          <p className="col-span-full text-xs opacity-50">
            Độ trễ = từ lúc người nói dứt câu (theo mốc thời gian của Soniox) đến lúc bản dịch hoàn chỉnh về tới máy.
          </p>
        </section>
      )}

      {/* Transcript */}
      <section className="mt-4 space-y-3">
        {segments.length === 0 && status === "running" && (
          <p className="opacity-50">Đang nghe… hãy nói hoặc đợi file phát.</p>
        )}
        {segments.map((s) => {
          const lat = latencies[s.id];
          const color = speakerColor(s.speaker);
          return (
            <article key={s.id} className="rounded-xl border-l-4 bg-white/5 p-3" style={{ borderColor: color }}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs opacity-70">
                <span style={{ color }}>Người {s.speaker ?? "?"}</span>
                <span>{s.language === "zh" ? "中文 → Tiếng Việt" : s.language === "vi" ? "Tiếng Việt → 中文" : s.language ?? ""}</span>
                {s.speechEndMs != null && <span>@{(s.speechEndMs / 1000).toFixed(1)}s</span>}
                {s.avgConfidence != null && <span>tin cậy {(s.avgConfidence * 100).toFixed(0)}%</span>}
                {lat?.translationDoneMs != null && (
                  <span className={`rounded px-1.5 font-semibold tabular-nums ${lat.translationDoneMs < 2000 ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}`}>
                    trễ {formatSeconds(lat.translationDoneMs)}
                  </span>
                )}
                {!s.closed && <span className="animate-pulse">● đang nghe</span>}
              </div>
              <p className="text-[15px] opacity-60">
                {s.originalFinal}
                <span className="opacity-50">{s.originalPartial}</span>
              </p>
              <p className="mt-1 text-xl leading-snug">
                {s.translationFinal}
                <span className="opacity-40">{s.translationPartial}</span>
              </p>
            </article>
          );
        })}
      </section>

      <p className="mt-8 text-xs opacity-40">
        Âm thanh gửi: PCM s16le {SAMPLE_RATE / 1000} kHz mono. Khoá API thật chỉ nằm ở server; trình duyệt dùng khoá tạm 60 giây.
      </p>
    </main>
  );
}
