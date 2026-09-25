// localStorage có thể bị chặn (chế độ riêng tư) nên mọi lần đọc/ghi đều bọc try/catch.
export function readStorage(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // bỏ qua
  }
}

export const GLOSSARY_KEY = "glossary";
export const THEME_KEY = "theme";
/** Chế độ nghe: "soniox" (chính xác, mặc định) hoặc "browser" (tiết kiệm, miễn phí). */
export const ENGINE_KEY = "engine";
/** Bối cảnh / chương trình cuộc họp dán trước (giúp nghe và gợi ý đúng chủ đề hơn). */
export const MEETING_CONTEXT_KEY = "meetingContext";
/** Tên của người dùng (vd. "小阮, 阮, Nguyễn") để báo khi sếp nhắc tên. */
export const MY_NAMES_KEY = "myNames";
/** Tự tạm dừng khi im lặng: số phút, "0" = tắt. Mặc định 3. */
export const AUTO_PAUSE_KEY = "autoPauseMinutes";
/** Dịch lại từng câu bằng AI cho đúng thành ngữ / khẩu ngữ / thương mại ("1" bật – mặc định, "0" tắt). */
export const REFINE_KEY = "refineTranslation";
/** Kiểu hiển thị lời thoại: "lines" (Dòng thoại – mặc định) hoặc "bubbles" (bong bóng chat). */
export const VIEW_KEY = "transcriptView";
/** Hiện pinyin dưới câu tiếng Trung ("1" bật – mặc định, "0" tắt). */
export const PINYIN_KEY = "showPinyin";
/** Ngôn ngữ đối tác nói (mã Soniox, vd. "zh", "en") hoặc "auto" = tự nhận nhiều thứ tiếng. Mặc định "zh". */
export const PARTNER_LANG_KEY = "partnerLanguage";
/** Ngôn ngữ của mình – mọi câu được dịch sang ngôn ngữ này; nói bằng nó thì không dịch. Mặc định "vi". */
export const MY_LANG_KEY = "myLanguage";
/** Tự đọc to bản dịch khi đối tác nói xong một câu ("1" bật – mặc định, "0" tắt). */
export const AUTO_READ_KEY = "autoRead";
/** Giọng đọc AI đã chọn (theo tiếng của mình), trống = giọng mặc định. */
export const TTS_VOICE_KEY = "ttsVoice";
/** Cách tự đọc: "live" (đọc từng vế ngay khi đối tác đang nói – mặc định) hoặc "accurate" (đọc bản AI dịch lại sau mỗi câu). */
export const READ_MODE_KEY = "readMode";
/** Đọc to bản dịch lời mình (sang tiếng đối tác) cho đối tác nghe ("1" bật – mặc định, "0" tắt). */
export const READ_MINE_KEY = "readMine";
/** Giọng đọc AI cho tiếng của đối tác (trống = giọng mặc định). */
export const PARTNER_VOICE_KEY = "partnerVoice";
/** Giọng nam đã chọn cho tiếng của mình / tiếng đối tác (người nói là nam thì đọc bằng giọng nam). */
export const TTS_VOICE_MALE_KEY = "ttsVoiceMale";
export const PARTNER_VOICE_MALE_KEY = "partnerVoiceMale";
/** Kiểu trò chuyện: "auto" (tự hiểu theo nội dung – mặc định), "work", "couple", "friends". */
export const CONVERSATION_KEY = "conversationType";
