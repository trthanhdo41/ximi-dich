// Cấu hình phiên Soniox real-time. Docs: https://soniox.com/docs/stt/api-reference/websocket-api

import { AUTO, DEFAULT_PAIR, englishName, type LangPair } from "../languages";
import type { ConversationType } from "../conversation";

export const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
export const SONIOX_MODEL = "stt-rt-v5";
export const SAMPLE_RATE = 16000;

export type TranslationTerm = { source: string; target: string };

export type SttOptions = {
  diarization: boolean;
  strictLanguages: boolean;
  endpointSensitivity: number; // -1..1
  endpointLatencyLevel: number; // 0..3
  maxEndpointDelayMs: number; // 500..3000
  terms: string[];
  translationTerms: TranslationTerm[];
  backgroundText: string;
};

export const DEFAULT_STT_OPTIONS: SttOptions = {
  diarization: true,
  strictLanguages: true,
  // Cân bằng: chốt câu khá nhanh; nếu sếp ngừng giữa câu mà bị cắt thì SegmentBuilder tự ghép lại
  // và dịch lại cả câu, nên không sai nghĩa.
  endpointSensitivity: 0,
  endpointLatencyLevel: 1,
  maxEndpointDelayMs: 1800,
  terms: [],
  translationTerms: [],
  backgroundText: "",
};

/** Bối cảnh gửi Soniox: loại cuộc trò chuyện + cách dịch theo nghĩa + xưng hô tiếng Việt. */
export function backgroundFor(pair: LangPair, conversation: ConversationType = "auto") {
  const mine = englishName(pair.mine);
  const partner = pair.partner === AUTO ? "a foreign language" : englishName(pair.partner);
  const scene = {
    auto: "A live conversation that could be about anything: work, business, a couple, friends, colleagues or family.",
    work: "A work conversation: a meeting, business talk or colleagues.",
    couple: "A couple chatting: intimate, casual, teasing or arguing.",
    friends: "Friends chatting: relaxed, jokes, banter and slang.",
  }[conversation];
  const pronouns =
    pair.mine !== "vi"
      ? ""
      : conversation === "friends"
        ? " When translating into Vietnamese, friends use 'mình' for I and 'bạn' for you."
        : " When translating into Vietnamese, choose pronouns by the speaker's gender (from their voice): a male speaker calls himself 'anh' and the listener 'em'; a female speaker calls herself 'em' and the listener 'anh'. Do not use 'tôi' or 'bạn'.";
  const zh =
    pair.partner === "zh"
      ? " The Chinese speakers may use Mandarin with strong regional accents (e.g. Guangdong, Hunan, Beijing) and lots of idioms (成语), colloquialisms, internet slang and trade jargon (e.g. 拍板, 画饼, 回款, 黄了, 躺平)."
      : "";
  return (
    `${scene} One side speaks ${partner}, the other speaks ${mine}.${zh} ` +
    `They speak casually and naturally, with idioms, colloquialisms and slang. ` +
    `Translate by the intended meaning, as a native speaker would understand it, never word by word. ` +
    `Translate swearing and profanity faithfully with equally strong words; do not soften or censor it.` +
    pronouns
  );
}

export function buildSonioxConfig(apiKey: string, opts: SttOptions, pair: LangPair = DEFAULT_PAIR) {
  const auto = pair.partner === AUTO;
  const context: Record<string, unknown> = {
    general: [
      { key: "domain", value: "Everyday conversation" },
      {
        key: "languages",
        value: auto ? `${englishName(pair.mine)} and other languages` : `${englishName(pair.partner)} and ${englishName(pair.mine)}`,
      },
    ],
  };
  if (opts.backgroundText.trim()) context.text = opts.backgroundText.trim();
  if (opts.terms.length) context.terms = opts.terms;
  if (opts.translationTerms.length) context.translation_terms = opts.translationTerms;

  return {
    api_key: apiKey,
    model: SONIOX_MODEL,
    audio_format: "pcm_s16le",
    sample_rate: SAMPLE_RATE,
    num_channels: 1,
    // Biết trước 2 thứ tiếng → nghe chính xác nhất; "tự nhận" thì để Soniox tự đoán mọi thứ tiếng.
    language_hints: auto ? [pair.mine] : [pair.partner, pair.mine],
    language_hints_strict: !auto && opts.strictLanguages,
    enable_language_identification: true,
    enable_speaker_diarization: opts.diarization,
    enable_endpoint_detection: true,
    endpoint_sensitivity: opts.endpointSensitivity,
    endpoint_latency_adjustment_level: opts.endpointLatencyLevel,
    max_endpoint_delay_ms: opts.maxEndpointDelayMs,
    context,
    // Dịch cả hai chiều: đối tác nói → tiếng của mình, mình nói → tiếng của đối tác.
    // "Tự nhận nhiều thứ tiếng" thì không biết dịch lời mình sang tiếng nào → chỉ dịch về tiếng của mình
    // (lời mình được AI dịch sang thứ tiếng đối tác nói nhiều nhất).
    translation: auto
      ? { type: "one_way", target_language: pair.mine }
      : { type: "two_way", language_a: pair.partner, language_b: pair.mine },
  };
}

/** Dòng "nguồn => đích" hoặc "nguồn = đích" → cặp dịch cố định. */
export function parseTranslationTerms(text: string): TranslationTerm[] {
  return text
    .split("\n")
    .map((line) => line.split(/=>|=/))
    .filter((parts) => parts.length === 2 && parts[0].trim() && parts[1].trim())
    .map(([source, target]) => ({ source: source.trim(), target: target.trim() }));
}

/**
 * Ô "Tên riêng & từ chuyên môn": mỗi dòng một từ; dòng có dấu "=" là dịch cố định
 * (vd "王总 = Sếp Vương"). Từ bên trái cũng được đưa vào danh sách thuật ngữ để nghe đúng hơn.
 */
export function parseGlossary(text: string) {
  const terms: string[] = [];
  const translationTerms: TranslationTerm[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const pair = parseTranslationTerms(line)[0];
    if (pair) {
      translationTerms.push(pair);
      terms.push(pair.source);
    } else {
      terms.push(...parseTerms(line));
    }
  }
  return { terms: [...new Set(terms)], translationTerms };
}

export function parseTerms(text: string): string[] {
  return text
    .split(/\n|,|，|、/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const ERROR_MESSAGES: Record<number, string> = {
  400: "Cấu hình gửi lên Soniox không hợp lệ",
  401: "Khoá API Soniox không hợp lệ",
  402: "Tài khoản Soniox đã hết tiền, cần nạp thêm",
  403: "Phiên đã hết hạn hoặc không có quyền",
  408: "Quá lâu không nhận được âm thanh nên Soniox đã ngắt",
  413: "Phiên đã đạt thời lượng tối đa",
  429: "Gửi yêu cầu quá nhiều, vui lòng đợi một chút",
  500: "Máy chủ Soniox gặp lỗi",
  503: "Máy chủ Soniox đang quá tải",
};

/** Chỉ hiện câu tiếng Việt; chi tiết gốc (tiếng Anh) của Soniox ghi vào console. */
export function describeSonioxError(code: number, message?: string): string {
  if (message) console.warn("Soniox error", code, message);
  return ERROR_MESSAGES[code] ?? `Máy chủ nhận giọng nói báo lỗi (mã ${code}).`;
}
