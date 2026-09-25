// Đọc to bản dịch bằng Web Speech Synthesis.

/** Mã BCP-47 của giọng đọc, vd. "vi-VN", "zh-CN", "en-US". */
export type SpeakLang = string;

function pickVoice(lang: SpeakLang) {
  const voices = window.speechSynthesis.getVoices();
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  return (
    voices.find((v) => norm(v.lang) === lang.toLowerCase()) ??
    voices.find((v) => norm(v.lang).startsWith(lang.slice(0, 2)))
  );
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Trả về false nếu máy không có giọng đọc cho ngôn ngữ này. */
export function speak(
  text: string,
  lang: SpeakLang,
  handlers: { onStart?: () => void; onEnd?: () => void } = {},
): boolean {
  if (!canSpeak() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(lang);
  if (!voice && synth.getVoices().length > 0) return false;

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  if (voice) utter.voice = voice;
  // Tiếng Trung / Nhật / Hàn đọc chậm lại một chút cho dễ nghe.
  utter.rate = /^(zh|ja|ko)/.test(lang) ? 0.95 : 1;
  utter.onstart = () => handlers.onStart?.();
  utter.onend = () => handlers.onEnd?.();
  utter.onerror = () => handlers.onEnd?.();
  synth.speak(utter);
  return true;
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
