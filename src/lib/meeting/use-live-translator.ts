"use client";

// Luồng nghe – dịch liên tục cho màn hình chính. Hai chế độ:
// - "soniox" (chính xác): Soniox nghe + dịch + phân biệt người nói trong một luồng.
// - "browser" (tiết kiệm): trình duyệt tự nhận giọng (một thứ tiếng của đối tác) miễn phí, AI dịch từng câu.
// Cặp ngôn ngữ (đối tác nói gì → dịch sang tiếng của mình) chọn trong Cài đặt, đọc lúc bấm nghe.
// Soniox:
// - Micro chạy suốt; audio được giữ lại trong lúc đang (re)connect để không mất chữ.
// - Mất mạng / lỗi tạm thời: tự kết nối lại (1s, 2s, 4s… tối đa 10s), transcript giữ nguyên.
// - Lỗi không thể tự sửa (sai khoá, hết tiền, không có quyền micro): dừng và báo rõ.

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue } from "motion/react";
import { createAudioContext, MicSource, WaveTap, type PcmChunk } from "@/lib/audio/sources";
import {
  backgroundFor,
  buildSonioxConfig,
  DEFAULT_STT_OPTIONS,
  parseGlossary,
} from "@/lib/soniox/config";
import { AUTO, bcp47, getLangPair } from "@/lib/languages";
import { genderOf, medianPitch, type Gender } from "@/lib/audio/pitch";
import { getConversationType } from "@/lib/conversation";
import { SegmentBuilder, type Segment } from "@/lib/soniox/segments";
import { fetchTemporaryKey, FatalSessionError, SonioxSession } from "@/lib/soniox/session";
import { ScreenWakeLock } from "@/lib/browser/wake-lock";
import { toVietnamese, VnError } from "@/lib/errors";
import { BrowserSpeechEngine, browserSpeechSupported } from "./browser-engine";

export type Engine = "soniox" | "browser";

export type LiveState =
  | "idle" // chưa nghe / đã dừng
  | "starting" // đang xin micro + kết nối
  | "live" // đang nghe
  | "reconnecting" // mất kết nối, đang tự nối lại
  | "interrupted" // bị hệ điều hành ngắt micro (vd. có cuộc gọi) – cần chạm để nghe tiếp
  | "paused"; // phòng im lặng lâu → đã ngắt Soniox để khỏi tốn tiền, micro vẫn chờ tiếng nói

/** Chất lượng mạng thực tế trong lúc nghe. */
export type Signal = "good" | "fair" | "weak" | "offline";

const MAX_BUFFER_CHUNKS = 300; // ~30 giây audio giữ lại khi mất mạng
/** Âm lượng (RMS) coi là có người nói. */
const VOICE_RMS = 0.02;
/** Giữ sẵn ~3 giây audio gần nhất khi tạm dừng, để lúc nghe tiếp không mất chữ đầu câu. */
const PREROLL_CHUNKS = 30;
const KEEPALIVE_AFTER_MS = 8000;

/** Âm thanh đã gửi trong phiên Soniox hiện tại (~60 giây gần nhất) – để đo cao độ giọng của từng câu. */
class SessionAudio {
  private chunks: { start: number; data: Int16Array }[] = [];
  private total = 0;

  reset() {
    this.chunks = [];
    this.total = 0;
  }

  push(buf: ArrayBuffer) {
    const data = new Int16Array(buf.slice(0));
    this.chunks.push({ start: this.total, data });
    this.total += data.length;
    while (this.chunks.length && this.total - this.chunks[0].start > 60 * 16000) this.chunks.shift();
  }

  /** Đoạn âm thanh từ `fromMs` tới `toMs` (tính từ đầu phiên). */
  slice(fromMs: number, toMs: number) {
    const a = Math.max(0, Math.floor(fromMs * 16));
    const b = Math.floor(toMs * 16);
    const out = new Int16Array(Math.max(0, b - a));
    for (const c of this.chunks) {
      const from = Math.max(a, c.start);
      const to = Math.min(b, c.start + c.data.length);
      if (to > from) out.set(c.data.subarray(from - c.start, to - c.start), from - a);
    }
    return out;
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

type Options = {
  getGlossary: () => string;
  getEngine: () => Engine;
  /** Bối cảnh/chương trình cuộc họp người dùng dán trước. */
  getMeetingContext?: () => string;
  /** Tự tạm dừng sau bao nhiêu ms im lặng (0 = tắt). */
  getAutoPauseMs?: () => number;
  /** Có dịch lại từng câu bằng AI cho đúng nghĩa bản địa không (chế độ Soniox). */
  getRefine?: () => boolean;
  /** Các câu đã lưu từ trước (localStorage). */
  initialSegments?: Segment[];
  /** Giới tính người dùng tự chọn cho người nói (ghi đè kết quả tự đoán theo giọng). */
  getGenderOverride?: (speaker?: string) => Gender | undefined;
};

export function useLiveTranslator({
  getGlossary,
  getEngine,
  getMeetingContext,
  getAutoPauseMs,
  getRefine,
  initialSegments,
  getGenderOverride,
}: Options) {
  const [initialBuilder] = useState(() => {
    const b = new SegmentBuilder();
    b.languages = getLangPair();
    if (initialSegments?.length) b.load(initialSegments);
    return b;
  });
  const [state, setState] = useState<LiveState>("idle");
  const [segments, setSegments] = useState<Segment[]>(() => initialBuilder.snapshot());
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [signal, setSignal] = useState<Signal>("good");
  /** Phổ tần số micro để vẽ sóng âm realtime (null khi không có). */
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const waveTapRef = useRef<WaveTap | null>(null);
  /** Soniox đang chậm hơn lời nói bao nhiêu ms (audio đã gửi − audio đã xử lý). */
  const lagRef = useRef<{ ms: number; at: number } | null>(null);
  const level = useMotionValue(0);

  const runningRef = useRef(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MicSource | null>(null);
  const sessionRef = useRef<SonioxSession | null>(null);
  /** Phiên vừa dừng, đang đợi Soniox chốt câu cuối. */
  const finishingRef = useRef<SonioxSession | null>(null);
  const connectingRef = useRef(false);
  const builderRef = useRef(initialBuilder);
  const engineRef = useRef<BrowserSpeechEngine | null>(null);
  const bufferRef = useRef<ArrayBuffer[]>([]);
  const sessionAudioRef = useRef(new SessionAudio());
  // Cao độ giọng gần đây của từng người nói → đoán nam / nữ.
  const pitchRef = useRef(new Map<string, number[]>());
  const [genders, setGenders] = useState<Record<string, Gender>>({});
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef = useRef(false);
  const wakeLockRef = useRef<ScreenWakeLock | null>(null);
  const frameRef = useRef<number | null>(null);
  const connectRef = useRef<() => Promise<void>>(async () => {});
  // Tự tạm dừng khi im lặng
  const pausedRef = useRef(false);
  const prerollRef = useRef<ArrayBuffer[]>([]);
  const lastVoiceAtRef = useRef(0);
  const lastTokenAtRef = useRef(0);
  const voiceStreakRef = useRef(0);
  const stateRef = useRef<LiveState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** Gộp nhiều lần cập nhật trong cùng một khung hình thành một lần render. */
  const publish = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setSegments(builderRef.current.snapshot());
    });
  }, []);

  const clearRetry = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  };

  const stopAudio = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    ctxRef.current = null;
    waveTapRef.current?.stop();
    waveTapRef.current = null;
    setAnalyser(null);
    level.set(0);
  }, [level]);

  const halt = useCallback(
    (message: string | null) => {
      runningRef.current = false;
      pausedRef.current = false;
      clearRetry();
      stopAudio();
      engineRef.current?.stop();
      engineRef.current = null;
      sessionRef.current?.close();
      sessionRef.current = null;
      bufferRef.current = [];
      wakeLockRef.current?.disable();
      builderRef.current.close(performance.now());
      publish();
      setError(message);
      setState("idle");
      setStartedAt(null);
    },
    [publish, stopAudio],
  );

  const scheduleReconnect = useCallback(() => {
    if (!runningRef.current) return;
    setState("reconnecting");
    clearRetry();
    const delay = Math.min(1000 * 2 ** attemptRef.current, 10000);
    attemptRef.current++;
    retryTimerRef.current = setTimeout(() => void connectRef.current(), delay);
  }, []);

  const wakeRef = useRef<() => void>(() => {});

  const handleChunk = useCallback(
    ({ pcm, rms }: PcmChunk) => {
      level.set(mutedRef.current ? 0 : rms);
      const speaking = !mutedRef.current && rms > VOICE_RMS;
      if (speaking) lastVoiceAtRef.current = performance.now();
      voiceStreakRef.current = speaking ? voiceStreakRef.current + 1 : 0;
      if (pausedRef.current) {
        // Đang tạm dừng: chỉ giữ ~3 giây gần nhất; có tiếng nói liên tục ~0,3 giây thì nghe tiếp.
        const pre = prerollRef.current;
        pre.push(pcm);
        if (pre.length > PREROLL_CHUNKS) pre.shift();
        if (voiceStreakRef.current >= 3) wakeRef.current();
        return;
      }
      // Khi app đang đọc to, gửi im lặng để không dịch lại chính giọng đọc của máy.
      const data = mutedRef.current ? new ArrayBuffer(pcm.byteLength) : pcm;
      const session = sessionRef.current;
      if (session?.isOpen) {
        session.sendAudio(data);
        sessionAudioRef.current.push(data);
      } else {
        const buf = bufferRef.current;
        buf.push(data);
        if (buf.length > MAX_BUFFER_CHUNKS) buf.shift();
      }
    },
    [level],
  );

  const connect = useCallback(async () => {
    if (!runningRef.current || connectingRef.current) return;
    connectingRef.current = true;
    clearRetry();
    try {
      const apiKey = await fetchTemporaryKey();
      if (!runningRef.current) return;
      const { terms, translationTerms } = parseGlossary(getGlossary());
      const meetingContext = getMeetingContext?.().trim().slice(0, 3000);
      const pair = builderRef.current.languages;
      const background = backgroundFor(pair, getConversationType());
      const config = buildSonioxConfig(
        apiKey,
        {
          ...DEFAULT_STT_OPTIONS,
          terms,
          translationTerms,
          backgroundText: meetingContext ? `${background}\n\nBối cảnh cuộc trò chuyện:\n${meetingContext}` : background,
        },
        pair,
      );

      const session: SonioxSession = new SonioxSession({
        onResponse: (res, receivedAt) => {
          if (sessionRef.current !== session && finishingRef.current !== session) return;
          if (res.total_audio_proc_ms != null && sessionRef.current === session) {
            lagRef.current = { ms: session.sentAudioMs - res.total_audio_proc_ms, at: receivedAt };
          }
          if (res.tokens?.length) {
            if (res.tokens.some((t) => t.text && t.text !== "<end>")) lastTokenAtRef.current = performance.now();
            builderRef.current.ingest(res.tokens, receivedAt);
            publish();
          }
        },
        onError: (message, fatal) => {
          if (sessionRef.current !== session) return;
          sessionRef.current = null;
          // Chốt câu đang dở để không mất chữ, rồi nối lại.
          builderRef.current.close(performance.now());
          publish();
          if (fatal) halt(message);
          else scheduleReconnect();
        },
        onFinished: () => {
          builderRef.current.close(performance.now());
          publish();
        },
      });
      sessionRef.current = session;
      await session.open(config);
      if (!runningRef.current) return session.close();

      // Gửi phần audio thu được trong lúc chờ kết nối (và ghi lại từ đầu phiên mới để đo cao độ giọng).
      sessionAudioRef.current.reset();
      for (const chunk of bufferRef.current) {
        session.sendAudio(chunk);
        sessionAudioRef.current.push(chunk);
      }
      bufferRef.current = [];
      lagRef.current = null;
      setSignal("good");
      attemptRef.current = 0;
      setState("live");
    } catch (e) {
      sessionRef.current = null;
      if (e instanceof FatalSessionError) halt(e.message);
      else scheduleReconnect();
    } finally {
      connectingRef.current = false;
    }
  }, [getGlossary, getMeetingContext, halt, publish, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const startMic = useCallback(async () => {
    // Phải gọi trong sự kiện chạm/bấm (iOS Safari).
    const ctx = createAudioContext();
    const mic = new MicSource(ctx, true);
    mic.onEnded = () => {
      if (runningRef.current && micRef.current === mic) setState("interrupted");
    };
    ctxRef.current = ctx;
    micRef.current = mic;
    await mic.start(handleChunk);
    setAnalyser(mic.analyser ?? null);
  }, [handleChunk]);

  // ---- Gọi AI dịch một câu theo nghĩa bản địa (trả về bản dịch + ghi chú thành ngữ) ----
  const requestTranslation = useCallback(
    async (b: SegmentBuilder, id: number, text: string, target = b.languages.mine) => {
      // Mạch hội thoại gần nhất của CẢ HAI bên (ai nói, nam/nữ, câu gốc + bản dịch) để AI hiểu đang nói chuyện gì.
      const context = b
        .snapshot()
        .filter((s) => s.id < id && s.closed && s.originalFinal.trim())
        .slice(-6)
        .map((s) => {
          const who = s.language === b.languages.mine ? "Bên mình" : `Người ${s.speaker ?? "?"}`;
          const sex = s.gender === "male" ? " (nam)" : s.gender === "female" ? " (nữ)" : "";
          const tr = s.translationFinal.trim() ? ` → ${s.translationFinal.trim().slice(0, 110)}` : "";
          return `${who}${sex}: ${s.originalFinal.trim().slice(0, 130)}${tr}`;
        });
      let res: Response;
      try {
        res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            context,
            glossary: getGlossary(),
            meetingContext: getMeetingContext?.() ?? "",
            source: b.get(id)?.language ?? b.languages.partner,
            target,
            gender: b.get(id)?.gender,
            conversation: getConversationType(),
          }),
        });
      } catch {
        throw new VnError("Không có mạng nên chưa dịch được.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new VnError(data.error ?? `Lỗi máy chủ (mã ${res.status}).`);
      return data as { translation: string; notes?: { term: string; meaning: string }[] };
    },
    [getGlossary, getMeetingContext],
  );

  // ---- Chế độ tiết kiệm: dịch từng câu sau khi trình duyệt chốt câu ----
  const translateSegment = useCallback(
    async (id: number, text: string) => {
      const b = builderRef.current;
      try {
        const data = await requestTranslation(b, id, text);
        // Câu đã được ghép thêm mảnh mới trong lúc chờ → bỏ kết quả cũ (bản dịch cả câu sẽ tới sau).
        if (b.get(id)?.originalFinal !== text) return;
        b.patch(id, {
          translationFinal: data.translation ?? "",
          notes: data.notes ?? [],
          refined: true,
          refining: false,
          pendingTranslation: false,
          translationDoneAt: performance.now(),
        });
      } catch (e) {
        const seg = b.get(id);
        if (seg?.originalFinal !== text) return;
        // Đã có bản dịch tạm thì giữ nó, chỉ báo lỗi khi không có gì để xem.
        if (seg.translationFinal) b.patch(id, { pendingTranslation: false, refining: false });
        else {
          b.patch(id, { pendingTranslation: false, refining: false, translationFailed: true });
          setError(toVietnamese(e, "Lỗi khi dịch, thử lại nhé."));
        }
      }
      if (builderRef.current === b) publish();
    },
    [publish, requestTranslation],
  );

  // ---- Chế độ Soniox: dịch lại từng câu tiếng Trung cho đúng thành ngữ / khẩu ngữ / thương mại ----
  // Chạy song song tối đa 2 câu (nhanh mà không vượt giới hạn gói AI miễn phí); lỗi thì giữ bản dịch nhanh của Soniox.
  const refineQueueRef = useRef<(() => Promise<void>)[]>([]);
  const refineActiveRef = useRef(0);
  const pumpRef = useRef<() => void>(() => {});
  useEffect(() => {
    pumpRef.current = () => {
      while (refineActiveRef.current < 2 && refineQueueRef.current.length) {
        const job = refineQueueRef.current.shift()!;
        refineActiveRef.current++;
        void job().finally(() => {
          refineActiveRef.current--;
          pumpRef.current();
        });
      }
    };
  }, []);
  const pumpRefine = useCallback(() => pumpRef.current(), []);
  const refineSegment = useCallback(
    (b: SegmentBuilder, seg: Segment) => {
      const text = seg.originalFinal.trim();
      if (!text || !seg.language || seg.language === b.languages.mine) return;
      b.patch(seg.id, { refining: true });
      refineQueueRef.current.push(async () => {
        try {
          const data = await requestTranslation(b, seg.id, text);
          const current = b.get(seg.id);
          // Câu đã được ghép thêm mảnh mới → bỏ, bản dịch cả câu đang xếp hàng phía sau.
          if (current?.originalFinal.trim() !== text) return;
          b.patch(seg.id, {
            draft: current?.translationFinal,
            translationFinal: data.translation || current?.translationFinal || "",
            notes: data.notes ?? [],
            refined: !!data.translation,
            refining: false,
          });
        } catch (e) {
          console.warn("Refine failed", e);
          if (b.get(seg.id)?.originalFinal.trim() === text) b.patch(seg.id, { refining: false });
        }
        if (builderRef.current === b) publish();
      });
      pumpRefine();
    },
    [publish, pumpRefine, requestTranslation],
  );

  const translateMine = useCallback(
    async (b: SegmentBuilder, seg: Segment) => {
      const text = seg.originalFinal.trim();
      if (!text) return;
      const count = new Map<string, number>();
      for (const s of b.snapshot()) if (s.language && s.language !== b.languages.mine) count.set(s.language, (count.get(s.language) ?? 0) + 1);
      const target = b.languages.partner !== AUTO ? b.languages.partner : [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      if (!target) return;
      try {
        const data = await requestTranslation(b, seg.id, text, target);
        if (b.get(seg.id)?.originalFinal.trim() !== text || !data.translation) return;
        b.patch(seg.id, { translationFinal: data.translation });
        if (builderRef.current === b) publish();
      } catch (e) {
        console.warn("Translate mine failed", e);
      }
    },
    [publish, requestTranslation],
  );

  /** Cao độ giọng của chính câu này (đang nói dở cũng đo được) – không phụ thuộc máy đánh số người nói đúng hay sai. */
  const segmentPitch = useCallback((seg: Segment) => {
    if (seg.speechStartMs == null || seg.speechEndMs == null || seg.speechEndMs <= seg.speechStartMs) return null;
    return medianPitch(sessionAudioRef.current.slice(seg.speechStartMs - 100, seg.speechEndMs + 150));
  }, []);

  /**
   * Giới tính người nói của câu đang nói dở (để đọc vế đầu đã đúng giọng, đúng xưng hô).
   * Ưu tiên cao độ của chính câu đó; chưa đủ tiếng thì theo người nói (đã nghe các câu trước).
   */
  const liveGenderCache = useRef(new Map<number, { end: number; gender?: Gender }>());
  const liveGender = useCallback(
    (seg: Segment): Gender | undefined => {
      const cached = liveGenderCache.current.get(seg.id);
      if (cached && (seg.speechEndMs ?? 0) - cached.end < 600) return cached.gender;
      const f0 = segmentPitch(seg);
      const list = pitchRef.current.get(seg.speaker ?? `?${seg.language}`);
      const gender = f0 ? genderOf(f0) : list?.length ? genderOf(median(list)) : undefined;
      liveGenderCache.current.set(seg.id, { end: seg.speechEndMs ?? 0, gender });
      if (liveGenderCache.current.size > 50) liveGenderCache.current.delete(liveGenderCache.current.keys().next().value!);
      return getGenderOverride?.(seg.speaker) ?? gender;
    },
    [getGenderOverride, segmentPitch],
  );

  /** Đo cao độ giọng của câu vừa chốt (cộng dồn theo người nói) → nam / nữ; người dùng chọn thì theo người dùng. */
  const detectGender = useCallback(
    (seg: Segment): Gender | undefined => {
      const key = seg.speaker ?? `?${seg.language}`;
      const f0 = segmentPitch(seg);
      if (f0) {
        const list = pitchRef.current.get(key) ?? [];
        list.push(f0);
        if (list.length > 12) list.shift();
        pitchRef.current.set(key, list);
      }
      const list = pitchRef.current.get(key);
      const bySpeaker = list?.length ? genderOf(median(list)) : undefined;
      if (bySpeaker && seg.speaker) setGenders((g) => (g[seg.speaker!] === bySpeaker ? g : { ...g, [seg.speaker!]: bySpeaker }));
      // Máy có thể gộp nhầm hai người vào một số → tin cao độ của chính câu này trước.
      return getGenderOverride?.(seg.speaker) ?? (f0 ? genderOf(f0) : bySpeaker);
    },
    [getGenderOverride, segmentPitch],
  );

  // Mỗi câu Soniox chốt xong → (nếu bật) gửi AI dịch lại.
  const attachRefine = useCallback(
    (b: SegmentBuilder) => {
      b.onClose = (seg) => {
        if (engineRef.current) return;
        const gender = detectGender(seg);
        if (gender && gender !== seg.gender) b.patch(seg.id, { gender });
        if (seg.language === b.languages.mine) {
          // Lời mình: Soniox đã dịch sẵn sang tiếng đối tác (dịch hai chiều). Chỉ khi "tự nhận nhiều thứ tiếng"
          // (Soniox không biết dịch sang tiếng nào) mới nhờ AI dịch sang thứ tiếng đối tác nói nhiều nhất.
          if (!seg.translationFinal.trim()) void translateMine(b, seg);
          return;
        }
        // Tắt "dịch lại" thì chỉ nhờ AI khi Soniox không dịch câu của đối tác (vd. gắn nhầm là tiếng của mình).
        if (getRefine?.() === false && seg.translationFinal.trim()) return;
        refineSegment(b, seg);
      };
    },
    [detectGender, getRefine, refineSegment, translateMine],
  );
  useEffect(() => {
    attachRefine(builderRef.current);
  }, [attachRefine]);

  // ---- Chế độ tiết kiệm: dịch tạm ngay trong lúc đang nói (model siêu nhanh, ~1,8 giây/lần) ----
  const draftRef = useRef({ text: "", lastAt: 0, inflight: false });
  const fastTranslate = useCallback(
    async (text: string) => {
      const d = draftRef.current;
      d.inflight = true;
      d.lastAt = performance.now();
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            fast: true,
            conversation: getConversationType(),
            source: builderRef.current.languages.partner,
            target: builderRef.current.languages.mine,
          }),
        });
        const data = await res.json().catch(() => ({}));
        // Vẫn là câu đang nói (chưa chốt sang câu khác) thì hiện bản dịch tạm.
        if (data.translation && d.text.startsWith(text.slice(0, 3))) {
          builderRef.current.liveDraft = data.translation;
          publish();
        }
      } catch {
        // bỏ qua: chỉ là bản dịch tạm
      } finally {
        d.inflight = false;
      }
    },
    [publish],
  );

  const startBrowser = useCallback(() => {
    if (!browserSpeechSupported()) {
      halt("Trình duyệt này không hỗ trợ chế độ tiết kiệm. Hãy dùng Chrome hoặc Safari, hoặc chuyển về chế độ Chính xác trong Cài đặt.");
      return;
    }
    // Nhận giọng của máy chỉ nghe được một thứ tiếng: tiếng của đối tác ("tự nhận" → tiếng Trung).
    const pair = builderRef.current.languages;
    const heard = pair.partner === AUTO ? "zh" : pair.partner;
    const zh = (text: string, is_final: boolean) => ({ text, is_final, language: heard, translation_status: "original" as const });
    const engine = new BrowserSpeechEngine({
      onStart: () => {
        if (runningRef.current) setState("live");
      },
      onInterim: (text) => {
        builderRef.current.ingest(text ? [zh(text, false)] : [], performance.now());
        const d = draftRef.current;
        d.text = text;
        if (!text) builderRef.current.liveDraft = "";
        else if (!d.inflight && text.length >= 4 && performance.now() - d.lastAt > 1800) void fastTranslate(text);
        publish();
      },
      onFinal: (text) => {
        const b = builderRef.current;
        const now = performance.now();
        const draft = b.liveDraft;
        b.liveDraft = "";
        draftRef.current.text = "";
        b.ingest([zh(text, true)], now);
        b.close(now);
        const seg = b.lastClosed();
        if (seg) {
          // Giữ bản dịch tạm trên màn hình trong lúc chờ bản dịch chuẩn.
          b.patch(seg.id, draft && !seg.translationFinal ? { translationFinal: draft, refining: true } : { pendingTranslation: true });
          // Có thể đã được ghép với mảnh trước → dịch cả câu.
          void translateSegment(seg.id, seg.originalFinal);
        }
        publish();
      },
      onSpeech: (speaking) => level.set(speaking ? 0.06 : 0),
      onError: (message, fatal) => {
        if (fatal) halt(message);
        else if (runningRef.current) setState("reconnecting");
      },
    }, bcp47(heard));
    engineRef.current = engine;
    engine.start();
    // Vòi nghe riêng chỉ để vẽ sóng (tạo AudioContext ngay trong lần bấm).
    if (WaveTap.allowed()) {
      const tap = new WaveTap();
      waveTapRef.current = tap;
      void tap.start(createAudioContext()).then((a) => {
        if (waveTapRef.current === tap && a) setAnalyser(a);
      });
    }
  }, [fastTranslate, halt, level, publish, translateSegment]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    pausedRef.current = false;
    prerollRef.current = [];
    lastVoiceAtRef.current = performance.now();
    lastTokenAtRef.current = performance.now();
    attemptRef.current = 0;
    setError(null);
    setState("starting");
    setStartedAt(Date.now());
    // Phiên cũ có thể còn đang chốt chữ cuối.
    finishingRef.current?.close();
    finishingRef.current = null;
    builderRef.current.close(performance.now());
    // Lấy cặp ngôn ngữ mới nhất trong Cài đặt.
    builderRef.current.languages = getLangPair();

    wakeLockRef.current ??= new ScreenWakeLock();
    void wakeLockRef.current.enable();

    if (getEngine() === "browser") return startBrowser();
    try {
      await Promise.all([startMic(), connect()]);
    } catch (e) {
      halt(toVietnamese(e, "Không bật được micro, thử lại nhé."));
    }
  }, [connect, getEngine, halt, startBrowser, startMic]);

  const stop = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    pausedRef.current = false;
    prerollRef.current = [];
    clearRetry();
    stopAudio();
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
      wakeLockRef.current?.disable();
      setState("idle");
      setStartedAt(null);
      builderRef.current.close(performance.now());
      publish();
      return;
    }
    wakeLockRef.current?.disable();
    bufferRef.current = [];
    setState("idle");
    setStartedAt(null);
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session?.isOpen) {
      // Báo hết audio để Soniox chốt nốt câu cuối, rồi đóng hẳn.
      session.finish();
      finishingRef.current = session;
      setTimeout(() => {
        session.close();
        if (finishingRef.current === session) finishingRef.current = null;
      }, 5000);
    } else {
      session?.close();
      builderRef.current.close(performance.now());
      publish();
    }
  }, [publish, stopAudio]);

  /** Nghe tiếp sau khi hệ điều hành ngắt micro. Gọi trong sự kiện chạm. */
  const resume = useCallback(async () => {
    if (!runningRef.current) return;
    stopAudio();
    try {
      await startMic();
      setState(sessionRef.current?.isOpen ? "live" : "reconnecting");
      if (!sessionRef.current?.isOpen) void connect();
    } catch {
      setState("interrupted");
    }
  }, [connect, startMic, stopAudio]);

  /** Tạm dừng vì im lặng: đóng kết nối Soniox (ngừng tính tiền), micro vẫn chạy để chờ tiếng nói. */
  const pauseForSilence = useCallback(() => {
    if (!runningRef.current || pausedRef.current || engineRef.current) return;
    pausedRef.current = true;
    prerollRef.current = [];
    clearRetry();
    const session = sessionRef.current;
    sessionRef.current = null;
    bufferRef.current = [];
    if (session?.isOpen) {
      session.finish(); // chốt nốt câu cuối rồi đóng
      finishingRef.current = session;
      setTimeout(() => {
        session.close();
        if (finishingRef.current === session) finishingRef.current = null;
      }, 5000);
    } else {
      session?.close();
    }
    level.set(0);
    setState("paused");
  }, [level]);

  /** Có tiếng nói lại (hoặc người dùng bấm) → nối lại Soniox, gửi kèm ~3 giây vừa nghe. */
  const wake = useCallback(() => {
    if (!runningRef.current || !pausedRef.current) return;
    pausedRef.current = false;
    bufferRef.current = prerollRef.current;
    prerollRef.current = [];
    lastVoiceAtRef.current = performance.now();
    lastTokenAtRef.current = performance.now();
    attemptRef.current = 0;
    setState("starting");
    void connectRef.current();
  }, []);

  useEffect(() => {
    wakeRef.current = wake;
  }, [wake]);

  /** Đổi cặp ngôn ngữ ngay: chốt câu đang nói dở; đang nghe thì nối lại Soniox với cấu hình mới (không mất chữ). */
  const applyLanguages = useCallback(() => {
    const b = builderRef.current;
    b.close(performance.now());
    b.languages = getLangPair();
    publish();
    if (!runningRef.current) return;
    if (engineRef.current) {
      // Chế độ tiết kiệm: nhận giọng của máy chỉ nghe một thứ tiếng → nghe lại bằng thứ tiếng mới.
      stop();
      void start();
      return;
    }
    if (pausedRef.current) return; // nghe tiếp sẽ dùng cặp mới
    clearRetry();
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session?.isOpen) {
      session.finish();
      finishingRef.current = session;
      setTimeout(() => {
        session.close();
        if (finishingRef.current === session) finishingRef.current = null;
      }, 3000);
    } else {
      session?.close();
    }
    attemptRef.current = 0;
    setState("starting");
    void connectRef.current();
  }, [publish, start, stop]);

  // Kiểm tra im lặng mỗi 5 giây (chỉ chế độ Soniox – chế độ tiết kiệm không tốn tiền nghe).
  useEffect(() => {
    const t = setInterval(() => {
      const limit = getAutoPauseMs?.() ?? 0;
      if (!limit || !runningRef.current || pausedRef.current || engineRef.current) return;
      if (stateRef.current !== "live") return;
      const lastActivity = Math.max(lastVoiceAtRef.current, lastTokenAtRef.current);
      if (performance.now() - lastActivity > limit) pauseForSilence();
    }, 5000);
    return () => clearInterval(t);
  }, [getAutoPauseMs, pauseForSilence]);

  /** Đánh dấu / bỏ đánh dấu câu quan trọng. */
  const toggleStar = useCallback(
    (id: number) => {
      const seg = builderRef.current.get(id);
      if (!seg) return;
      builderRef.current.patch(id, { starred: !seg.starred });
      publish();
    },
    [publish],
  );

  /** Bỏ một câu đã chốt (tiếng máy đọc lọt vào micro). */
  const dropSegment = useCallback(
    (id: number) => {
      builderRef.current.remove(id);
      publish();
    },
    [publish],
  );

  const reset = useCallback(() => {
    builderRef.current = new SegmentBuilder();
    builderRef.current.languages = getLangPair();
    attachRefine(builderRef.current);
    pitchRef.current.clear();
    setGenders({});
    setSegments([]);
    setError(null);
  }, [attachRefine]);

  /** Tắt nghe khi app đang đọc to bản dịch (tránh dịch lại chính giọng đọc của máy). */
  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    if (muted) engineRef.current?.pause();
    else engineRef.current?.resume();
  }, []);

  // Đo mạng mỗi giây: dữ liệu kẹt chờ gửi (mạng lên chậm) và độ chậm xử lý so với lời nói.
  useEffect(() => {
    const t = setInterval(() => {
      if (!runningRef.current || pausedRef.current) return;
      const s = sessionRef.current;
      let next: Signal;
      if (engineRef.current) {
        next = navigator.onLine ? "good" : "offline";
      } else if (!navigator.onLine || !s?.isOpen) {
        next = "offline";
      } else {
        const queuedMs = s.bufferedBytes / 32;
        const lag = lagRef.current;
        const lagMs = lag && performance.now() - lag.at < 5000 ? lag.ms : 0;
        const worst = Math.max(queuedMs, lagMs);
        next = worst < 1500 ? "good" : worst < 3500 ? "fair" : "weak";
      }
      setSignal((prev) => (prev === next ? prev : next));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Keepalive + tự nối lại khi có mạng / quay lại app.
  useEffect(() => {
    const keepalive = setInterval(() => {
      const s = sessionRef.current;
      if (s?.isOpen && performance.now() - s.lastSentAt > KEEPALIVE_AFTER_MS) s.keepalive();
    }, 4000);

    const onOnline = () => {
      if (engineRef.current || pausedRef.current) return; // trình duyệt tự nối lại / đang cố ý tạm dừng
      if (runningRef.current && !sessionRef.current?.isOpen && !connectingRef.current) {
        attemptRef.current = 0;
        void connectRef.current();
      }
    };
    const onVisible = async () => {
      if (document.visibilityState !== "visible" || !runningRef.current) return;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "running") {
        await ctx.resume().catch(() => {});
        if ((ctx.state as AudioContextState) !== "running") setState("interrupted");
      }
      if (!sessionRef.current?.isOpen) onOnline();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(keepalive);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Dọn dẹp khi rời trang.
  useEffect(
    () => () => {
      runningRef.current = false;
      clearRetry();
      micRef.current?.stop();
      sessionRef.current?.close();
      engineRef.current?.stop();
      wakeLockRef.current?.disable();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return { state, segments, error, level, analyser, startedAt, signal, wake, toggleStar, dropSegment, genders, liveGender, applyLanguages, start, stop, resume, reset, setMuted, dismissError: () => setError(null) };
}
