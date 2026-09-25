// Một phiên WebSocket tới Soniox: gửi config, gửi audio, nhận token.

import { SONIOX_WS_URL, describeSonioxError } from "./config";
import type { SonioxToken } from "./segments";

export type SonioxResponse = {
  tokens?: SonioxToken[];
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
  finished?: boolean;
  error_code?: number;
  error_type?: string;
  error_message?: string;
};

export type SessionHandlers = {
  onResponse: (res: SonioxResponse, receivedAt: number) => void;
  /** `fatal`: lỗi không nên tự kết nối lại (khoá sai, hết tiền, cấu hình sai). */
  onError: (message: string, fatal: boolean) => void;
  onFinished: () => void;
};

import { VnError } from "@/lib/errors";

/** Lỗi không nên tự thử lại (sai mật khẩu, thiếu cấu hình, hết tiền…). */
export class FatalSessionError extends VnError {}

export async function fetchTemporaryKey(): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/soniox-token", { method: "POST" });
  } catch {
    throw new VnError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 500) {
    throw new FatalSessionError(data.error ?? `Lỗi máy chủ (${res.status}).`);
  }
  if (!res.ok) throw new VnError(data.error ?? `Lỗi máy chủ (mã ${res.status}).`);
  return data.apiKey as string;
}

export class SonioxSession {
  private ws?: WebSocket;
  private finished = false;
  private stopping = false;
  private failed = false;
  /** Thời điểm gửi dữ liệu gần nhất, để biết khi nào cần keepalive. */
  lastSentAt = 0;
  /** Tổng số ms audio đã gửi (PCM s16le 16 kHz = 32 byte/ms). */
  sentAudioMs = 0;

  constructor(private handlers: SessionHandlers) {}

  open(config: object): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(SONIOX_WS_URL);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify(config));
        resolve();
      };
      ws.onmessage = (e) => {
        const receivedAt = performance.now();
        const res = JSON.parse(e.data as string) as SonioxResponse;
        if (res.error_code) {
          this.failed = true;
          const fatal = [400, 401, 402].includes(res.error_code);
          this.handlers.onError(describeSonioxError(res.error_code, res.error_message), fatal);
          return;
        }
        this.handlers.onResponse(res, receivedAt);
        if (res.finished) {
          this.finished = true;
          this.handlers.onFinished();
        }
      };
      ws.onerror = () => {
        if (!opened) reject(new VnError("Không mở được kết nối nhận giọng nói. Kiểm tra mạng."));
      };
      ws.onclose = () => {
        if (!opened) reject(new VnError("Không mở được kết nối nhận giọng nói. Kiểm tra mạng."));
        if (opened && !this.finished && !this.stopping && !this.failed) {
          this.handlers.onError("Mất kết nối giữa chừng.", false);
        }
      };
    });
  }

  sendAudio(pcm: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcm);
      this.lastSentAt = performance.now();
      this.sentAudioMs += pcm.byteLength / 32;
    }
  }

  /** Giữ kết nối khi tạm không gửi audio (Soniox ngắt sau 20 giây im lặng). */
  keepalive() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "keepalive" }));
      this.lastSentAt = performance.now();
    }
  }

  /** Số byte còn nằm chờ trong máy chưa gửi đi được – tăng lên khi mạng yếu. */
  get bufferedBytes() {
    return this.ws?.bufferedAmount ?? 0;
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Báo hết audio; Soniox chốt nốt token rồi gửi `finished`. */
  finish() {
    this.stopping = true;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send("");
  }

  close() {
    this.stopping = true;
    this.ws?.close();
  }
}
