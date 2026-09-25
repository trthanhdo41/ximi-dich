// Danh sách ngôn ngữ Soniox (model stt-rt-v5) hỗ trợ nghe và dịch – dịch được giữa mọi cặp.
// Tên hiển thị bằng tiếng Việt; `native` là tên bản xứ; `bcp47` dùng cho giọng đọc / nhận giọng của máy.

import { MY_LANG_KEY, PARTNER_LANG_KEY, readStorage, writeStorage } from "./browser/storage";

export type Script =
  | "Latin" | "Han" | "Japanese" | "Hangul" | "Thai" | "Cyrillic" | "Arabic" | "Hebrew" | "Devanagari"
  | "Bengali" | "Gujarati" | "Gurmukhi" | "Tamil" | "Telugu" | "Kannada" | "Malayalam" | "Greek";

export type Language = { code: string; name: string; native: string; bcp47: string; script: Script };

const L = (code: string, name: string, native: string, bcp47: string, script: Script = "Latin"): Language => ({
  code,
  name,
  native,
  bcp47,
  script,
});

export const LANGUAGES: Language[] = [
  L("zh", "Tiếng Trung", "中文", "zh-CN", "Han"),
  L("en", "Tiếng Anh", "English", "en-US"),
  L("ko", "Tiếng Hàn", "한국어", "ko-KR", "Hangul"),
  L("ja", "Tiếng Nhật", "日本語", "ja-JP", "Japanese"),
  L("th", "Tiếng Thái", "ไทย", "th-TH", "Thai"),
  L("id", "Tiếng Indonesia", "Bahasa Indonesia", "id-ID"),
  L("ms", "Tiếng Mã Lai", "Bahasa Melayu", "ms-MY"),
  L("tl", "Tiếng Philippines (Tagalog)", "Tagalog", "fil-PH"),
  L("fr", "Tiếng Pháp", "Français", "fr-FR"),
  L("de", "Tiếng Đức", "Deutsch", "de-DE"),
  L("ru", "Tiếng Nga", "Русский", "ru-RU", "Cyrillic"),
  L("es", "Tiếng Tây Ban Nha", "Español", "es-ES"),
  L("hi", "Tiếng Hindi (Ấn Độ)", "हिन्दी", "hi-IN", "Devanagari"),
  L("ar", "Tiếng Ả Rập", "العربية", "ar-SA", "Arabic"),
  L("vi", "Tiếng Việt", "Tiếng Việt", "vi-VN"),
  L("af", "Tiếng Afrikaans", "Afrikaans", "af-ZA"),
  L("sq", "Tiếng Albania", "Shqip", "sq-AL"),
  L("az", "Tiếng Azerbaijan", "Azərbaycanca", "az-AZ"),
  L("eu", "Tiếng Basque", "Euskara", "eu-ES"),
  L("be", "Tiếng Belarus", "Беларуская", "be-BY", "Cyrillic"),
  L("bn", "Tiếng Bengal", "বাংলা", "bn-BD", "Bengali"),
  L("pt", "Tiếng Bồ Đào Nha", "Português", "pt-BR"),
  L("bs", "Tiếng Bosnia", "Bosanski", "bs-BA"),
  L("bg", "Tiếng Bulgaria", "Български", "bg-BG", "Cyrillic"),
  L("fa", "Tiếng Ba Tư", "فارسی", "fa-IR", "Arabic"),
  L("pl", "Tiếng Ba Lan", "Polski", "pl-PL"),
  L("ca", "Tiếng Catalan", "Català", "ca-ES"),
  L("hr", "Tiếng Croatia", "Hrvatski", "hr-HR"),
  L("he", "Tiếng Do Thái", "עברית", "he-IL", "Hebrew"),
  L("da", "Tiếng Đan Mạch", "Dansk", "da-DK"),
  L("et", "Tiếng Estonia", "Eesti", "et-EE"),
  L("gl", "Tiếng Galicia", "Galego", "gl-ES"),
  L("gu", "Tiếng Gujarat", "ગુજરાતી", "gu-IN", "Gujarati"),
  L("nl", "Tiếng Hà Lan", "Nederlands", "nl-NL"),
  L("hu", "Tiếng Hungary", "Magyar", "hu-HU"),
  L("el", "Tiếng Hy Lạp", "Ελληνικά", "el-GR", "Greek"),
  L("kn", "Tiếng Kannada", "ಕನ್ನಡ", "kn-IN", "Kannada"),
  L("kk", "Tiếng Kazakh", "Қазақ тілі", "kk-KZ", "Cyrillic"),
  L("lv", "Tiếng Latvia", "Latviešu", "lv-LV"),
  L("lt", "Tiếng Litva", "Lietuvių", "lt-LT"),
  L("mk", "Tiếng Macedonia", "Македонски", "mk-MK", "Cyrillic"),
  L("ml", "Tiếng Malayalam", "മലയാളം", "ml-IN", "Malayalam"),
  L("mr", "Tiếng Marathi", "मराठी", "mr-IN", "Devanagari"),
  L("no", "Tiếng Na Uy", "Norsk", "nb-NO"),
  L("fi", "Tiếng Phần Lan", "Suomi", "fi-FI"),
  L("pa", "Tiếng Punjab", "ਪੰਜਾਬੀ", "pa-IN", "Gurmukhi"),
  L("ro", "Tiếng Romania", "Română", "ro-RO"),
  L("cs", "Tiếng Séc", "Čeština", "cs-CZ"),
  L("sr", "Tiếng Serbia", "Српски", "sr-RS", "Cyrillic"),
  L("sk", "Tiếng Slovakia", "Slovenčina", "sk-SK"),
  L("sl", "Tiếng Slovenia", "Slovenščina", "sl-SI"),
  L("sw", "Tiếng Swahili", "Kiswahili", "sw-KE"),
  L("ta", "Tiếng Tamil", "தமிழ்", "ta-IN", "Tamil"),
  L("te", "Tiếng Telugu", "తెలుగు", "te-IN", "Telugu"),
  L("tr", "Tiếng Thổ Nhĩ Kỳ", "Türkçe", "tr-TR"),
  L("sv", "Tiếng Thụy Điển", "Svenska", "sv-SE"),
  L("uk", "Tiếng Ukraina", "Українська", "uk-UA", "Cyrillic"),
  L("ur", "Tiếng Urdu", "اردو", "ur-PK", "Arabic"),
  L("cy", "Tiếng Wales", "Cymraeg", "cy-GB"),
  L("it", "Tiếng Ý", "Italiano", "it-IT"),
];

/** Mấy thứ tiếng hay gặp nhất ở Việt Nam – đứng đầu danh sách chọn. */
export const POPULAR_CODES = ["zh", "en", "ko", "ja", "th", "id", "ms", "tl", "fr", "de", "ru", "es", "hi", "ar"];

/** Đối tác nói nhiều thứ tiếng / không rõ → để Soniox tự nhận. */
export const AUTO = "auto";

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function language(code?: string): Language | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

/** "Tiếng Trung", "Tiếng Anh"… (mã lạ thì trả lại mã). */
export function langName(code?: string) {
  if (code === AUTO) return "Nhiều thứ tiếng";
  return language(code)?.name ?? (code ? code.toUpperCase() : "Không rõ");
}

/** Tên dùng giữa câu: "tiếng Trung", "tiếng Anh" (chỉ viết thường chữ "tiếng"). */
export function langInline(code?: string) {
  return langName(code).replace(/^Tiếng /, "tiếng ");
}

/** Chữ viết tắt trên huy hiệu nhỏ: 中 / 日 / 한 / EN / VI… */
export function langBadge(code?: string) {
  if (code === "zh") return "中";
  if (code === "ja") return "日";
  if (code === "ko") return "한";
  return code ? code.toUpperCase() : "?";
}

/** Tiếng Trung / Nhật dùng phông chữ Hán cho đẹp và đúng nét. */
export function langFont(code?: string) {
  return code === "zh" || code === "ja" ? "font-zh" : "";
}

/** Ngôn ngữ viết liền không cách chữ (ghép câu không thêm dấu cách). */
export function unspaced(code?: string) {
  return code === "zh" || code === "ja" || code === "th";
}

/** Tên tiếng Anh ("Korean"…) – dùng trong lời dặn cho AI / Soniox. */
export function englishName(code?: string) {
  if (!code || code === AUTO) return "multiple languages";
  if (code === "zh") return "Mandarin Chinese";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function bcp47(code?: string) {
  return language(code)?.bcp47 ?? "vi-VN";
}

// ---- Cặp ngôn ngữ đang dùng (lưu trong máy) ----

export type LangPair = { partner: string; mine: string };
export const DEFAULT_PAIR: LangPair = { partner: "zh", mine: "vi" };

let cached: LangPair | null = null;

export function getLangPair(): LangPair {
  if (cached) return cached;
  if (typeof window === "undefined") return DEFAULT_PAIR;
  const partner = readStorage(PARTNER_LANG_KEY, DEFAULT_PAIR.partner);
  const mine = readStorage(MY_LANG_KEY, DEFAULT_PAIR.mine);
  cached = {
    partner: partner === AUTO || BY_CODE.has(partner) ? partner : DEFAULT_PAIR.partner,
    mine: BY_CODE.has(mine) ? mine : DEFAULT_PAIR.mine,
  };
  return cached;
}

export function setLangPair(pair: LangPair) {
  writeStorage(PARTNER_LANG_KEY, pair.partner);
  writeStorage(MY_LANG_KEY, pair.mine);
  cached = { ...pair };
}

/** Câu do bên mình nói (bằng ngôn ngữ của mình) → không cần dịch. */
export function isMineLang(code?: string) {
  return !!code && code === getLangPair().mine;
}

// ---- Nhận ngôn ngữ theo chữ viết ----

const SCRIPT_RE: Record<Script, RegExp> = {
  Latin: /\p{Script=Latin}/gu,
  Han: /\p{Script=Han}/gu,
  Japanese: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  Hangul: /\p{Script=Hangul}/gu,
  Thai: /\p{Script=Thai}/gu,
  Cyrillic: /\p{Script=Cyrillic}/gu,
  Arabic: /\p{Script=Arabic}/gu,
  Hebrew: /\p{Script=Hebrew}/gu,
  Devanagari: /\p{Script=Devanagari}/gu,
  Bengali: /\p{Script=Bengali}/gu,
  Gujarati: /\p{Script=Gujarati}/gu,
  Gurmukhi: /\p{Script=Gurmukhi}/gu,
  Tamil: /\p{Script=Tamil}/gu,
  Telugu: /\p{Script=Telugu}/gu,
  Kannada: /\p{Script=Kannada}/gu,
  Malayalam: /\p{Script=Malayalam}/gu,
  Greek: /\p{Script=Greek}/gu,
};

export function scriptOf(code?: string): Script {
  return language(code)?.script ?? "Latin";
}

/** Tỉ lệ chữ trong `text` thuộc chữ viết của ngôn ngữ `code` (0..1, bỏ qua dấu câu, số, khoảng trắng). */
export function scriptShare(text: string, code?: string) {
  const letters = text.replace(/[\s\p{P}\p{S}\d]/gu, "");
  if (!letters) return 0;
  return (letters.match(SCRIPT_RE[scriptOf(code)])?.length ?? 0) / letters.length;
}

/** Chữ cái chỉ tiếng Việt mới có (ơ, ư, ă, đ, nguyên âm có dấu nặng/hỏi/ngã…). */
export const VI_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

/**
 * Ngôn ngữ thật của câu, xét theo chữ viết: Soniox đôi khi gắn nhầm câu ngắn (vd. "嗯？喂？" bị gắn tiếng Việt)
 * → câu bị xếp sang phía "mình nói" và không được dịch.
 */
export function detectLanguage(text: string, tagged: string | undefined, pair: LangPair) {
  if (!text.replace(/[\s\p{P}\p{S}\d]/gu, "")) return tagged;
  const { mine } = pair;
  const partner = pair.partner === AUTO ? undefined : pair.partner;
  const mineLooksRight = (share: number) =>
    share >= 0.5 && (mine !== "vi" || tagged === "vi" || VI_LETTERS.test(text));

  if (partner && scriptOf(partner) !== scriptOf(mine)) {
    if (scriptShare(text, partner) >= 0.5) return partner;
    if (mineLooksRight(scriptShare(text, mine))) return mine;
    return tagged === mine || tagged === partner ? tagged : partner;
  }
  // Cùng kiểu chữ (vd. tiếng Anh ↔ tiếng Việt) hoặc tự nhận nhiều thứ tiếng: tin nhãn của Soniox,
  // trừ khi câu có chữ chỉ tiếng Việt mới có.
  if (mine === "vi" && tagged !== "vi" && scriptOf(tagged) === "Latin" && VI_LETTERS.test(text)) return "vi";
  if (partner && tagged !== mine && tagged !== partner) return partner;
  return tagged;
}
