// Chế độ tiết kiệm: dùng tính năng nhận giọng nói có sẵn của trình duyệt (Web Speech API, miễn phí).
// Hạn chế: chỉ nghe một ngôn ngữ (tiếng của đối tác), không phân biệt người nói, trình duyệt hay tự dừng
// sau một lúc im lặng nên phải tự khởi động lại.

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSpeechSupported() {
  return getCtor() !== null;
}

export type BrowserEngineHandlers = {
  onStart: () => void;
  /** Phần đang nghe dở (chưa chốt). */
  onInterim: (text: string) => void;
  /** Một câu đã chốt. */
  onFinal: (text: string) => void;
  /** Có/không có tiếng người nói (để vòng sóng nhảy). */
  onSpeech: (speaking: boolean) => void;
  onError: (message: string, fatal: boolean) => void;
};

const FATAL: Record<string, string> = {
  "not-allowed":
    "Chưa được phép dùng micro hoặc nhận giọng nói. Trên iPhone: Cài đặt → Safari → Micro, và bật Siri & Đọc chính tả.",
  "service-not-allowed": "Trình duyệt chặn nhận giọng nói. Trên iPhone cần bật Cài đặt → Siri → Đọc chính tả.",
  "audio-capture": "Không tìm thấy micro trên máy này.",
  "language-not-supported": "Máy này chưa hỗ trợ nhận giọng thứ tiếng này. Hãy dùng chế độ Chính xác.",
};

export class BrowserSpeechEngine {
  private rec: Recognition | null = null;
  private running = false;
  private paused = false;
  private failures = 0;

  constructor(
    private h: BrowserEngineHandlers,
    /** Mã BCP-47 của thứ tiếng cần nghe, vd. "zh-CN", "en-US". */
    private lang = "zh-CN",
  ) {}

  start() {
    this.running = true;
    this.paused = false;
    this.failures = 0;
    this.spawn();
  }

  private spawn() {
    const Ctor = getCtor();
    if (!Ctor) {
      this.h.onError("Trình duyệt này không hỗ trợ chế độ tiết kiệm. Hãy dùng Chrome hoặc Safari.", true);
      return;
    }
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => this.h.onStart();
    rec.onspeechstart = () => this.h.onSpeech(true);
    rec.onspeechend = () => this.h.onSpeech(false);
    rec.onresult = (e) => {
      this.failures = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (r.isFinal) this.h.onFinal(text);
        else interim += text;
      }
      this.h.onInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      const fatal = FATAL[e.error];
      if (fatal) {
        this.running = false;
        this.h.onError(fatal, true);
      } else if (e.error === "network") {
        this.h.onError("Nhận giọng nói cần mạng, đang thử lại…", false);
      } else {
        console.warn("SpeechRecognition error", e.error);
      }
    };
    // Trình duyệt hay tự dừng (im lặng lâu, hết phiên) → tự bật lại ngay.
    rec.onend = () => {
      this.h.onSpeech(false);
      if (!this.running || this.paused) return;
      this.failures++;
      setTimeout(() => this.running && !this.paused && this.spawn(), Math.min(250 * this.failures, 3000));
    };

    this.rec = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn("SpeechRecognition start failed", e);
    }
  }

  /** Tạm ngừng nghe (vd. khi máy đang đọc to bản dịch). */
  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.rec?.abort();
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.spawn();
  }

  stop() {
    this.running = false;
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      rec.stop();
    }
  }
}
