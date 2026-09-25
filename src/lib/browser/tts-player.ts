"use client";

// Tự đọc to bản dịch bằng giọng AI của Soniox, nhanh như phiên dịch viên nói nối:
// - Trình duyệt giữ MỘT kết nối thẳng tới Soniox (khoá tạm lấy từ /api/tts-token) suốt buổi họp.
//   Mỗi vế câu gửi đi là một "luồng đọc" riêng → có tiếng sau ~0,3–0,5 giây.
// - Âm thanh về tới đâu phát tới đâu (Web Audio), các vế nối liền nhau theo đúng thứ tự.
// - Kết nối thẳng lỗi → đọc qua máy chủ (/api/tts) → vẫn lỗi thì dùng giọng có sẵn của máy.
// - AudioContext được "mở khoá" trong lần chạm đầu tiên (iPhone chỉ cho phát tiếng sau khi người dùng chạm).
// - Ghi nhớ các câu vừa đọc để nhận ra "tiếng vọng": micro nghe lại chính giọng máy đọc → bỏ qua.

import { bcp47 } from "../languages";
import { KNOWN_VOICES, voicesFor } from "../voices";
import { speak as speakWithDevice, stopSpeaking } from "./speech";

export type SpeakItem = {
  text: string;
  /** Mã ngôn ngữ của câu đọc (vd. "vi"). */
  lang: string;
  voice?: string;
  /** Đọc theo lời đang nói: đọc chậm quá xa so với người nói thì bỏ bớt cho kịp. */
  live?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
};

const WS_URL = "wss://tts-rt.soniox.com/tts-websocket";
const MODEL = "tts-rt-v2";
const SAMPLE_RATE = 24000;
/** Tốc độ đọc: bình thường hơi nhanh; đang bị tụt lại sau người nói thì đọc nhanh dần (tối đa 1,3). */
function speedFor(backlogS: number) {
  return backlogS > 6 ? 1.3 : backlogS > 3 ? 1.22 : 1.12;
}
/** Nhận tiếng vọng trong khoảng này sau khi đọc xong. */
const ECHO_WINDOW_MS = 4000;
/** Đọc chậm hơn người nói quá mức này (giây) thì bỏ vế mới cho kịp. */
const MAX_BACKLOG_S = 12;

/** Cặp chữ liền nhau (bỏ dấu câu, khoảng trắng) – để so hai câu giống nhau tới đâu. */
function bigrams(text: string) {
  const s = text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** PCM 16-bit (little-endian) → số thực -1..1 cho Web Audio. */
function toFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - (bytes.byteLength % 2));
  const out = new Float32Array(view.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function base64Bytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Stream = {
  id: string;
  item: SpeakItem;
  voice: string;
  speed: number;
  chunks: Float32Array<ArrayBuffer>[];
  /** Đã nhận đủ âm thanh. */
  terminated: boolean;
  /** Không đọc được bằng giọng AI → dùng giọng của máy. */
  failed: boolean;
  started: boolean;
  /** Đã thử đọc qua máy chủ. */
  viaServer: boolean;
  /** Đã báo onEnd (chỉ báo một lần). */
  ended: boolean;
  timers: ReturnType<typeof setTimeout>[];
  memory: { grams: Set<string>; until: number };
};

class TtsPlayer {
  private ctx: AudioContext | null = null;
  private ws: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private token: { key: string; expiresAt: number } | null = null;
  private order: Stream[] = [];
  private byId = new Map<string, Stream>();
  private sources = new Set<AudioBufferSourceNode>();
  /** Các vế đã xếp lịch phát nhưng chưa đọc xong. */
  private active = new Set<Stream>();
  private playHead = 0;
  private seq = 0;
  private deviceBusy = false;
  private isSpeaking = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private recent: { grams: Set<string>; until: number }[] = [];
  /** Báo khi bắt đầu / dừng đọc (để hiện trạng thái trên nút loa). */
  onChange?: (speaking: boolean) => void;

  /**
   * Gọi trong lúc người dùng chạm (bấm nghe, bấm nút loa…) để iPhone cho phép tự phát tiếng về sau.
   * `connect`: mở sẵn kết nối đọc (chỉ khi đang bật tự đọc – tắt thì không gọi gì tới dịch vụ đọc).
   */
  unlock(connect = true) {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
      }
      if (this.ctx.state !== "running") void this.ctx.resume();
      // Phát một mẫu im lặng ngay trong lần chạm – Safari cần vậy mới "mở" loa.
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start();
    } catch {
      // bỏ qua: sẽ dùng giọng có sẵn của máy
    }
    // Mở sẵn kết nối để câu đầu tiên đọc được ngay.
    if (connect) void this.socket().catch(() => {});
  }

  get speaking() {
    return this.isSpeaking;
  }

  /** Đọc một câu / một vế, nối tiếp sau những gì đang đọc. */
  enqueue(item: SpeakItem) {
    const text = item.text.trim();
    if (!text) return;
    const backlog = this.backlog();
    if (item.live && backlog > MAX_BACKLOG_S) return;
    const s: Stream = {
      speed: speedFor(backlog),
      id: `s${++this.seq}-${Date.now().toString(36)}`,
      item: { ...item, text },
      voice: item.voice && KNOWN_VOICES.has(item.voice) ? item.voice : voicesFor(item.lang)[0].id,
      chunks: [],
      terminated: false,
      failed: false,
      started: false,
      viaServer: false,
      ended: false,
      timers: [],
      memory: { grams: bigrams(text), until: Number.POSITIVE_INFINITY },
    };
    this.order.push(s);
    this.byId.set(s.id, s);
    this.recent.push(s.memory);
    this.setSpeaking(true);
    void this.request(s);
  }

  /** Đọc ngay câu này (dừng câu đang đọc, bỏ hàng chờ). */
  speakNow(item: SpeakItem) {
    this.stop();
    this.enqueue(item);
  }

  stop() {
    const pending = [...this.active, ...this.order];
    this.active.clear();
    this.order = [];
    this.byId.clear();
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // đã dừng
      }
    }
    this.sources.clear();
    this.playHead = 0;
    this.deviceBusy = false;
    stopSpeaking();
    for (const s of pending) {
      s.memory.until = Date.now() + ECHO_WINDOW_MS;
      s.timers.forEach(clearTimeout);
      this.end(s);
    }
    this.setSpeaking(false);
  }

  /** Câu micro vừa nghe có phải là tiếng máy đang/vừa đọc lọt vào không. */
  isEcho(text: string) {
    const now = Date.now();
    this.recent = this.recent.filter((r) => r.until > now);
    const grams = bigrams(text);
    if (grams.size < 2 || !this.recent.length) return false;
    const all = new Set<string>();
    for (const r of this.recent) for (const g of r.grams) all.add(g);
    let hit = 0;
    for (const g of grams) if (all.has(g)) hit++;
    return hit / grams.size >= 0.6;
  }

  // ---- Kết nối ----

  private async getToken() {
    if (this.token && this.token.expiresAt - Date.now() > 60_000) return this.token.key;
    const res = await fetch("/api/tts-token", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.apiKey) throw new Error("tts token");
    this.token = { key: data.apiKey, expiresAt: data.expiresAt };
    return this.token.key;
  }

  private socket(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN && this.token && this.token.expiresAt - Date.now() > 60_000) {
      return Promise.resolve(this.ws);
    }
    this.connecting ??= (async () => {
      await this.getToken();
      const ws = new WebSocket(WS_URL);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("tts timeout")), 6000);
        ws.onopen = () => {
          clearTimeout(t);
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(t);
          reject(new Error("tts socket"));
        };
      });
      ws.onmessage = (e) => this.onMessage(e);
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        // Các vế đang chờ tiếng → đọc qua máy chủ.
        for (const s of this.order) if (!s.terminated && !s.failed) void this.viaServer(s);
      };
      this.ws?.close();
      this.ws = ws;
      return ws;
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async request(s: Stream) {
    try {
      const ws = await this.socket();
      if (!this.byId.has(s.id)) return;
      ws.send(
        JSON.stringify({
          api_key: this.token!.key,
          stream_id: s.id,
          model: MODEL,
          language: s.item.lang,
          voice: s.voice,
          audio_format: "pcm_s16le",
          sample_rate: SAMPLE_RATE,
          speed: s.speed,
        }),
      );
      ws.send(JSON.stringify({ stream_id: s.id, text: s.item.text, text_end: true }));
    } catch {
      void this.viaServer(s);
    }
  }

  private onMessage(e: MessageEvent) {
    let m: { stream_id?: string; audio?: string; terminated?: boolean; error_code?: number; error_message?: string };
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    const s = m.stream_id ? this.byId.get(m.stream_id) : undefined;
    if (!s || s.viaServer) return;
    if (m.error_code) {
      console.warn("Soniox TTS", m.error_code, m.error_message);
      if (!s.chunks.length && !s.started) void this.viaServer(s);
      else this.markDone(s);
      return;
    }
    if (m.audio) s.chunks.push(toFloat(base64Bytes(m.audio)));
    if (m.terminated) s.terminated = true;
    this.pump();
  }

  /** Dự phòng: đọc qua máy chủ (/api/tts), âm thanh cũng về tới đâu phát tới đâu. */
  private async viaServer(s: Stream) {
    if (s.viaServer || !this.byId.has(s.id)) return;
    s.viaServer = true;
    s.chunks = [];
    try {
      const params = new URLSearchParams({ text: s.item.text, lang: s.item.lang, voice: s.voice, speed: String(s.speed) });
      const res = await fetch(`/api/tts?${params}`);
      if (!res.ok || !res.body) throw new Error(`tts ${res.status}`);
      const reader = res.body.getReader();
      let carry: Uint8Array | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !this.byId.has(s.id)) break;
        let bytes = value;
        if (carry) {
          bytes = new Uint8Array(carry.length + value.length);
          bytes.set(carry);
          bytes.set(value, carry.length);
          carry = null;
        }
        if (bytes.length % 2) {
          carry = bytes.slice(-1);
          bytes = bytes.slice(0, -1);
        }
        if (bytes.length) s.chunks.push(toFloat(bytes));
        this.pump();
      }
      s.terminated = true;
    } catch {
      s.failed = true;
    }
    this.pump();
  }

  private markDone(s: Stream) {
    s.terminated = true;
    this.pump();
  }

  // ---- Phát tiếng ----

  /** Còn bao nhiêu giây chưa đọc (ước lượng cả các vế chưa có tiếng). */
  private backlog() {
    const playing = this.ctx ? Math.max(0, this.playHead - this.ctx.currentTime) : 0;
    // Tiếng Việt đọc ~15 ký tự/giây ở tốc độ thường.
    const waiting = this.order.filter((s) => !s.started).reduce((sum, s) => sum + s.item.text.length / (15 * s.speed), 0);
    return playing + waiting;
  }

  private pump() {
    const ctx = this.ctx;
    while (this.order.length) {
      const s = this.order[0];
      if (s.failed || !ctx) {
        this.readWithDevice(s);
        return;
      }
      if (ctx.state !== "running") void ctx.resume();
      while (s.chunks.length) {
        const data = s.chunks.shift()!;
        if (!data.length) continue;
        const buf = ctx.createBuffer(1, data.length, SAMPLE_RATE);
        buf.copyToChannel(data, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        // Đang im thì đệm 0,15 giây cho khỏi giật; đang đọc thì nối liền.
        const gap = this.playHead > ctx.currentTime ? 0 : 0.15;
        this.playHead = Math.max(this.playHead, ctx.currentTime + gap);
        src.start(this.playHead);
        this.playHead += buf.duration;
        this.sources.add(src);
        src.onended = () => this.sources.delete(src);
        if (!s.started) {
          // Báo "bắt đầu đọc" đúng lúc tiếng phát ra loa (không phải lúc xếp lịch).
          s.started = true;
          this.active.add(s);
          const startAt = this.playHead - buf.duration;
          s.timers.push(setTimeout(() => s.item.onStart?.(), Math.max(0, (startAt - ctx.currentTime) * 1000)));
        }
      }
      if (!s.terminated) return;
      // Vế này đã xếp lịch xong → báo xong khi đọc hết, chuyển sang vế sau.
      this.order.shift();
      this.byId.delete(s.id);
      const leftMs = Math.max(0, (this.playHead - ctx.currentTime) * 1000);
      s.memory.until = Date.now() + leftMs + ECHO_WINDOW_MS;
      s.timers.push(
        setTimeout(() => {
          this.active.delete(s);
          this.end(s);
        }, leftMs),
      );
    }
    this.scheduleIdleCheck();
  }

  private end(s: Stream) {
    if (s.ended) return;
    s.ended = true;
    s.item.onEnd?.();
  }

  /** Giọng AI không đọc được → giọng có sẵn của máy (đợi phần đang phát xong). */
  private readWithDevice(s: Stream) {
    if (this.deviceBusy) return;
    this.deviceBusy = true;
    const waitMs = this.ctx ? Math.max(0, (this.playHead - this.ctx.currentTime) * 1000) : 0;
    const done = () => {
      if (!this.deviceBusy) return;
      this.deviceBusy = false;
      s.memory.until = Date.now() + ECHO_WINDOW_MS;
      if (this.order[0] === s) {
        this.order.shift();
        this.byId.delete(s.id);
      }
      this.end(s);
      this.pump();
    };
    setTimeout(() => {
      if (!this.byId.has(s.id)) return;
      s.started = true;
      const ok = speakWithDevice(s.item.text, bcp47(s.item.lang), { onStart: s.item.onStart, onEnd: done });
      if (!ok) done();
    }, waitMs);
  }

  private scheduleIdleCheck() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const leftMs = this.ctx ? Math.max(0, (this.playHead - this.ctx.currentTime) * 1000) : 0;
    if (!this.order.length && !this.deviceBusy && leftMs < 20) {
      this.setSpeaking(false);
      return;
    }
    this.idleTimer = setTimeout(() => this.scheduleIdleCheck(), Math.max(50, leftMs));
  }

  private setSpeaking(on: boolean) {
    if (this.isSpeaking === on) return;
    this.isSpeaking = on;
    this.onChange?.(on);
  }
}

let player: TtsPlayer | null = null;

/** Trình đọc dùng chung cho cả app. */
export function getTtsPlayer() {
  player ??= new TtsPlayer();
  return player;
}
