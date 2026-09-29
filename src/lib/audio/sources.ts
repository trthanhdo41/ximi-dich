// Nguồn âm thanh → PCM s16le 16 kHz mono, chia khúc ~100 ms.
// Micro và file ghi âm dùng chung đường xử lý để kết quả test giống hệt lúc họp thật.

import { SAMPLE_RATE } from "@/lib/soniox/config";

export type PcmChunk = { pcm: ArrayBuffer; rms: number };
export type ChunkHandler = (chunk: PcmChunk) => void;

export interface AudioSource {
  start(onChunk: ChunkHandler): Promise<void>;
  stop(): void;
  /** Gọi khi nguồn tự kết thúc (file phát hết). */
  onEnded?: () => void;
}

/**
 * Tạo AudioContext NGAY trong sự kiện bấm nút (bắt buộc trên iOS Safari),
 * trước mọi lệnh await.
 */
export function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  void ctx.resume();
  return ctx;
}

/** Bộ phân tích phổ để vẽ sóng âm (không ảnh hưởng âm thanh gửi đi). */
function createWaveAnalyser(ctx: AudioContext) {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -20;
  return analyser;
}

/** Máy tính có lấy được âm thanh của một tab (Google Meet, Zoom web…) không – điện thoại thì không. */
export function canCaptureTab() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return false;
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export class MicSource implements AudioSource {
  private stream?: MediaStream;
  private tabStream?: MediaStream;
  private node?: AudioWorkletNode;
  private sourceNode?: MediaStreamAudioSourceNode;
  private tabNode?: MediaStreamAudioSourceNode;
  /** Phổ tần số thật của micro, để vẽ sóng âm. */
  analyser?: AnalyserNode;
  onEnded?: () => void;
  /** Có vấn đề với âm thanh tab (không chọn tab, không bật chia sẻ âm thanh, dừng chia sẻ…) – vẫn nghe micro. */
  onTabIssue?: (message: string) => void;
  /** Đang nghe cả âm thanh tab. */
  tabActive = false;

  constructor(
    private ctx: AudioContext,
    private browserProcessing: boolean,
    /** Nghe thêm âm thanh của một tab (vd. Google Meet) – chỉ trên máy tính. */
    private includeTab = false,
  ) {}

  /** Xin chia sẻ âm thanh tab (gọi sớm, ngay sau lần bấm, để trình duyệt cho mở hộp chọn tab). */
  private async openTab() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Gợi ý cho Chrome: ưu tiên chọn tab, có âm thanh.
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
      // Chỉ cần tiếng, bỏ hình cho nhẹ máy.
      stream.getVideoTracks().forEach((t) => t.stop());
      const track = stream.getAudioTracks()[0];
      if (!track) {
        this.onTabIssue?.("Chưa bật “Chia sẻ âm thanh của thẻ” nên chỉ nghe được micro. Bấm dừng rồi nghe lại để chọn lại.");
        return;
      }
      track.addEventListener("ended", () => {
        this.tabActive = false;
        this.tabNode?.disconnect();
        this.onTabIssue?.("Đã dừng chia sẻ âm thanh tab – giờ chỉ nghe micro.");
      });
      this.tabStream = stream;
    } catch {
      this.onTabIssue?.("Chưa chọn tab để nghe nên chỉ nghe được micro.");
    }
  }

  async start(onChunk: ChunkHandler) {
    if (this.includeTab) await this.openTab();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: this.browserProcessing,
        autoGainControl: this.browserProcessing,
      },
    });
    // Nếu người dùng rút/tắt micro giữa chừng.
    this.stream.getAudioTracks()[0]?.addEventListener("ended", () => this.onEnded?.());

    await this.ctx.audioWorklet.addModule("/pcm-worklet.js");
    await this.ctx.resume();
    // Trộn micro (+ tab) thành một kênh rồi mới gửi đi.
    const mix = this.ctx.createGain();
    mix.channelCount = 1;
    mix.channelCountMode = "explicit";
    mix.channelInterpretation = "speakers";
    this.sourceNode = this.ctx.createMediaStreamSource(this.stream);
    this.sourceNode.connect(mix);
    if (this.tabStream) {
      this.tabNode = this.ctx.createMediaStreamSource(this.tabStream);
      this.tabNode.connect(mix);
      this.tabActive = true;
    }
    this.analyser = createWaveAnalyser(this.ctx);
    mix.connect(this.analyser);
    this.node = new AudioWorkletNode(this.ctx, "pcm-downsampler");
    this.node.port.onmessage = (e: MessageEvent<PcmChunk>) => onChunk(e.data);
    mix.connect(this.node);
    // Nối vào destination để trình duyệt chịu chạy worklet; worklet không xuất âm thanh.
    this.node.connect(this.ctx.destination);
  }

  stop() {
    this.node?.port.close();
    this.node?.disconnect();
    this.sourceNode?.disconnect();
    this.tabNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.tabStream?.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }
}

/**
 * Chỉ mở micro để vẽ sóng âm (chế độ tiết kiệm, nơi trình duyệt tự giữ micro để nhận giọng).
 * Không mở trên iPhone/iPad vì dễ tranh micro với tính năng nhận giọng của máy.
 */
export class WaveTap {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  analyser?: AnalyserNode;

  static allowed() {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    return !ios && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(ctx: AudioContext): Promise<AnalyserNode | undefined> {
    this.ctx = ctx;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await ctx.resume();
      this.analyser = createWaveAnalyser(ctx);
      ctx.createMediaStreamSource(this.stream).connect(this.analyser);
      return this.analyser;
    } catch {
      this.stop();
      return undefined;
    }
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.analyser = undefined;
  }
}

/** Giải mã file và hạ về 16 kHz mono bằng OfflineAudioContext. */
async function decodeTo16kMono(ctx: AudioContext, file: File) {
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  const length = Math.ceil(decoded.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return { decoded, mono: rendered.getChannelData(0) };
}

function floatToPcm16(samples: Float32Array): PcmChunk {
  const out = new Int16Array(samples.length);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    sum += s * s;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return { pcm: out.buffer, rms: Math.sqrt(sum / Math.max(1, samples.length)) };
}

/**
 * Phát file vào luồng đúng tốc độ thật (1x) để đo độ trễ như khi họp.
 * Có thể phát tiếng ra loa cùng lúc, đồng bộ theo đồng hồ của AudioContext.
 */
export class FileSource implements AudioSource {
  private timer?: ReturnType<typeof setInterval>;
  private player?: AudioBufferSourceNode;
  onEnded?: () => void;
  duration = 0;

  constructor(
    private ctx: AudioContext,
    private file: File,
    private playAloud: boolean,
  ) {}

  /** Giải mã trước khi mở kết nối để không tốn thời gian phiên. */
  private prepared?: { decoded: AudioBuffer; mono: Float32Array };
  async prepare() {
    this.prepared = await decodeTo16kMono(this.ctx, this.file);
    this.duration = this.prepared.decoded.duration;
  }

  async start(onChunk: ChunkHandler) {
    if (!this.prepared) await this.prepare();
    const { decoded, mono } = this.prepared!;
    await this.ctx.resume();

    const t0 = this.ctx.currentTime;
    if (this.playAloud) {
      this.player = this.ctx.createBufferSource();
      this.player.buffer = decoded;
      this.player.connect(this.ctx.destination);
      this.player.start(t0);
    }

    const CHUNK = SAMPLE_RATE / 10;
    let sent = 0;
    this.timer = setInterval(() => {
      const due = Math.min(mono.length, Math.floor((this.ctx.currentTime - t0) * SAMPLE_RATE));
      while (due - sent >= CHUNK || (due === mono.length && sent < due)) {
        const end = Math.min(sent + CHUNK, due);
        onChunk(floatToPcm16(mono.subarray(sent, end)));
        sent = end;
      }
      if (sent >= mono.length) {
        clearInterval(this.timer);
        this.onEnded?.();
      }
    }, 50);
  }

  stop() {
    clearInterval(this.timer);
    try {
      this.player?.stop();
    } catch {
      // đã dừng
    }
    void this.ctx.close();
  }
}

/**
 * Ánh xạ vị trí audio (ms) → thời điểm thực (performance.now) mà đoạn audio đó được thu/gửi.
 * Dùng để đo: "người nói dứt câu" → "bản dịch hiện xong".
 */
export class AudioClock {
  private audioEnds: number[] = [];
  private walls: number[] = [];
  private totalSamples = 0;

  /** Gọi mỗi khi một khúc audio vừa thu xong (ngay trước khi gửi). */
  mark(samples: number, wallNow: number) {
    this.totalSamples += samples;
    this.audioEnds.push((this.totalSamples / SAMPLE_RATE) * 1000);
    this.walls.push(wallNow);
  }

  get audioMs() {
    return (this.totalSamples / SAMPLE_RATE) * 1000;
  }

  wallAt(audioMs: number): number | undefined {
    const ends = this.audioEnds;
    if (!ends.length || audioMs > ends[ends.length - 1]) return undefined;
    let lo = 0;
    let hi = ends.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ends[mid] < audioMs) lo = mid + 1;
      else hi = mid;
    }
    return this.walls[lo] - (ends[lo] - audioMs);
  }
}
