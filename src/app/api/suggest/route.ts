import { isAuthed } from "@/lib/auth";
import { GeminiError, geminiConfigured, geminiText, SUMMARY_MODEL } from "@/lib/gemini";
import { groqConfigured, groqJson } from "@/lib/groq";
import { langInline, language, scriptOf, scriptShare, VI_LETTERS } from "@/lib/languages";
import { isConversationType, SCENE_VI, type ConversationType } from "@/lib/conversation";

// Gợi ý trả lời trong lúc trò chuyện: AI giải thích người kia đang muốn gì và đề xuất vài cách trả lời
// (tiếng Việt để hiểu + tiếng của đối tác để nói/đưa xem). Groq nếu có khoá (nhanh), không thì Gemini.
// Trường "zh" = câu trả lời bằng tiếng của đối tác, "pinyin" = cách đọc (giữ tên cũ cho giao diện).

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTEXT_CHARS = 5_000;

/** Lời dặn gợi ý trả lời: theo thứ tiếng của người kia và kiểu trò chuyện (công việc / người yêu / bạn bè…). */
function suggestSystem(partner: string, conversation: ConversationType) {
  const name = langInline(partner);
  const native = language(partner)?.native ?? partner;
  const reading =
    partner === "zh"
      ? `phiên âm pinyin của câu "zh" (có dấu thanh).`
      : scriptOf(partner) === "Latin"
        ? `để chuỗi rỗng "" (${name} viết bằng chữ Latin, đọc được luôn).`
        : `cách đọc câu "zh" bằng chữ Latin (phiên âm chuẩn của ${name}, vd. romaji cho tiếng Nhật, romanization cho tiếng Hàn).`;
  const tone = {
    auto: "hợp với mối quan hệ và không khí cuộc trò chuyện (tự đoán theo nội dung: công việc thì lịch sự, rõ ràng; người yêu thì ngọt ngào, tình cảm; bạn bè thì thoải mái, vui vẻ)",
    work: `hợp văn hoá công sở của người nói ${name} (lịch sự, rõ ràng, ngắn gọn để nói ngay)`,
    couple: "ngọt ngào, tình cảm, tự nhiên như người yêu nói với nhau",
    friends: "thoải mái, vui vẻ, tự nhiên như bạn bè nói với nhau",
  }[conversation];
  const labels =
    conversation === "work"
      ? `"Đồng ý & cam kết", "Góp ý xây dựng", "Xin làm rõ / thêm thời gian"`
      : conversation === "couple"
        ? `"Ngọt ngào", "Đùa vui", "Hỏi han quan tâm"`
        : conversation === "friends"
          ? `"Hưởng ứng", "Đùa vui", "Hỏi thêm"`
          : `"Đồng ý", "Hỏi thêm", "Đùa vui / nói khéo"`;
  return `Bạn là trợ lý thầm lặng giúp một người Việt trong ${SCENE_VI[conversation]} với người nói ${name}.
Bạn nhận đoạn hội thoại gần nhất (máy tự nhận giọng, có thể sai chữ do giọng địa phương: hãy đoán ý đúng theo ngữ cảnh).
Tập trung vào câu hỏi / ý MỚI NHẤT mà người kia hướng tới người dùng.

Hãy trả về:
1. "understanding": 1–3 câu tiếng Việt giải thích người kia đang nói / hỏi gì, kể cả ý ngầm (vd. đang giận dỗi, đang đùa, đang thúc giục, muốn nghe ý kiến).
2. "suggestions": đúng 3 cách trả lời khác nhau, ${tone}:
   - "label": nhãn ngắn tiếng Việt (vd. ${labels}).
   - "vi": câu trả lời bằng tiếng Việt để người dùng hiểu.
   - "zh": cùng ý bằng ${name} (${native}) tự nhiên như người bản xứ nói, 1–3 câu. (Tên trường là "zh" nhưng nội dung PHẢI là ${name}.)
   - "pinyin": ${reading}
Nếu người dùng cho biết "ý muốn nói" thì cả 3 gợi ý phải bám theo ý đó.
Không bịa số liệu, ngày giờ, tên người; chỗ cần thông tin cụ thể thì để trống dạng [số liệu] / [ngày].${partner === "zh" ? "\nQuy đổi đúng: 周一 = thứ Hai … 周三 = thứ Tư … 周日 = Chủ nhật; 块/元 = tệ." : ""}

Chỉ trả về JSON đúng dạng:
{"understanding":"...","suggestions":[{"label":"...","vi":"...","zh":"...","pinyin":"..."}]}`;
}

type Body = {
  context?: string;
  intent?: string;
  glossary?: string;
  meetingContext?: string;
  partner?: string;
  conversation?: ConversationType;
};
type Suggestion = { label: string; vi: string; zh: string; pinyin?: string };

const HAN = /[\u3400-\u9fff]/g;
function hanRatio(text: string) {
  const letters = text.replace(/[\s\p{P}\d]/gu, "");
  return letters ? (text.match(HAN)?.length ?? 0) / letters.length : 0;
}
/** "vi" phải là tiếng Việt, "zh" phải là tiếng của đối tác (AI đôi khi viết nhầm ngôn ngữ). */
function validSuggestion(s: Suggestion, partner: string) {
  if (!s || typeof s.zh !== "string" || typeof s.vi !== "string" || !s.zh.trim()) return false;
  if (partner === "zh") return hanRatio(s.vi) < 0.2 && hanRatio(s.zh) > 0.5;
  if (scriptOf(partner) !== "Latin") return scriptShare(s.vi, partner) < 0.2 && scriptShare(s.zh, partner) > 0.5;
  return !VI_LETTERS.test(s.zh);
}

function parse(raw: string, partner: string): { understanding: string; suggestions: Suggestion[] } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    const suggestions = Array.isArray(data.suggestions)
      ? data.suggestions.filter((x: Suggestion) => validSuggestion(x, partner)).slice(0, 3)
      : [];
    // Cần đủ ít nhất 2 gợi ý hợp lệ; không thì hỏi lại AI.
    if (suggestions.length < 2) return null;
    return { understanding: String(data.understanding ?? ""), suggestions };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Cần nhập mật khẩu trước." }, { status: 401 });
  }
  const useGroq = groqConfigured();
  if (!useGroq && !geminiConfigured()) {
    return Response.json({ error: "Máy chủ chưa có khoá AI (GROQ_API_KEY hoặc GEMINI_API_KEY)." }, { status: 500 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  // Lấy phần cuối hội thoại (gần nhất là quan trọng nhất).
  const context = (body.context ?? "").trim().slice(-MAX_CONTEXT_CHARS);
  if (!context) return Response.json({ error: "Chưa có nội dung trò chuyện để gợi ý." }, { status: 400 });

  const partner = language(body.partner) && body.partner !== "vi" ? body.partner! : "zh";
  const system = suggestSystem(partner, isConversationType(body.conversation) ? body.conversation : "auto");
  const input = [
    body.glossary?.trim() ? `Tên riêng / thuật ngữ:\n${body.glossary.trim()}` : "",
    body.meetingContext?.trim() ? `Bối cảnh:\n${body.meetingContext.trim().slice(0, 1500)}` : "",
    `<hoi_thoai_gan_nhat>\n${context}\n</hoi_thoai_gan_nhat>`,
    body.intent?.trim() ? `Ý người dùng muốn nói: ${body.intent.trim()}` : "Người dùng chưa nêu ý muốn nói, hãy tự đề xuất.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    let result = null;
    // Thử tối đa 2 lần nếu AI trả về sai định dạng.
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      const raw = useGroq
        ? await groqJson({ system, input, maxTokens: 1500 })
        : await geminiText({ model: SUMMARY_MODEL, system, input, thinking: "low", maxTokens: 2000 });
      result = parse(raw, partner);
    }
    if (!result) return Response.json({ error: "AI trả lời chưa đúng dạng, bấm Gợi ý lại nhé." }, { status: 502 });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof GeminiError ? error.message : "Lỗi khi gợi ý, thử lại nhé.";
    if (!(error instanceof GeminiError)) console.error("Suggest error", error);
    return Response.json({ error: message }, { status: 502 });
  }
}
