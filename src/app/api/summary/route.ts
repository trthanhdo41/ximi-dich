import { isAuthed } from "@/lib/auth";
import { SUMMARY_ERROR_MARK } from "@/lib/meeting/summary";
import { GeminiError, geminiConfigured, geminiStream, SUMMARY_MODEL } from "@/lib/gemini";
import { groqConfigured, groqStream } from "@/lib/groq";
import { AUTO, langInline, language } from "@/lib/languages";
import { isConversationType, SCENE_VI, type ConversationType } from "@/lib/conversation";

// Tóm tắt cuộc họp (đang họp hoặc đã xong), trả về dạng chữ chạy dần (stream).
// Có GROQ_API_KEY thì dùng Groq (tạm thời), không thì dùng Gemini Flash.

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TRANSCRIPT_CHARS = 400_000;
/** Dưới mức này (≈ 10 phút họp) bản ghi đầy đủ vẫn lọt giới hạn token/phút của Groq miễn phí. */
const GROQ_KEEP_TRANSLATION_CHARS = 6_000;

/** Lời dặn tóm tắt; riêng tiếng Trung có thêm quy đổi thứ/tiền/tên Hán Việt. */
function summarySystem(partner: string, conversation: ConversationType) {
  const zh = partner === "zh";
  const who =
    partner === "none"
      ? "người khác (hai bên cùng nói tiếng Việt, có chen từ tiếng Anh)"
      : partner === AUTO || !language(partner) ? "người nước ngoài (có thể nói nhiều thứ tiếng)" : `người nói ${langInline(partner)}`;
  const accent = zh
    ? "Người nói tiếng Trung có thể nói giọng địa phương nặng (Quảng Đông, Hồ Nam, Bắc Kinh…), nên bản ghi có thể nghe sai chữ. Hãy dựa vào câu gốc tiếng Trung là chính"
    : "Người nói có thể có giọng địa phương nặng, nên bản ghi có thể nghe sai chữ. Hãy dựa vào câu gốc là chính";
  const zhRules = zh
    ? `
- Quy đổi chính xác: 周一/星期一 = thứ Hai, 周二 = thứ Ba, 周三 = thứ Tư, 周四 = thứ Năm, 周五 = thứ Sáu, 周六 = thứ Bảy, 周日/周天 = Chủ nhật. 块/元/人民币 = tệ (nhân dân tệ), không phải "đồng". 万 = 10.000.
- Tên người Việt viết bằng chữ Hán thì đọc theo âm Hán Việt (vd. 小阮 = Tiểu Nguyễn, 阮 = Nguyễn, 陈 = Trần, 黎 = Lê).`
    : `
- Giữ đúng đơn vị tiền tệ và ngày giờ như người nói dùng (vd. USD, won, yên), không tự đổi sang tiền Việt.`;
  return SUMMARY_SYSTEM.replace("{scene}", SCENE_VI[conversation])
    .replace("{who}", who)
    .replace("{accent}", accent)
    .replace("{rules}", zhRules)
    .replace("{names}", zh ? "tên riêng tiếng Trung giữ nguyên hoặc đọc Hán Việt" : "tên riêng giữ nguyên");
}

const SUMMARY_SYSTEM = `Bạn giúp một người Việt nắm lại nội dung {scene} với {who}.
Bạn nhận bản ghi tự động: mỗi dòng là một câu, gồm người nói, câu gốc và bản dịch máy.

Lưu ý khi đọc:
- {accent}, bản dịch chỉ để tham khảo, và suy ra ý đúng từ ngữ cảnh.
- "Người 1/2/3" là nhãn máy tự gán, có thể không chính xác. Nếu biết tên hoặc cách gọi từ nội dung (vd. 王总, Mr. Kim, "anh yêu") thì dùng tên đó.
- Không bịa thông tin. Chỗ nào không chắc, ghi "(chưa rõ)".
- Dòng có ⭐ là câu người dùng đánh dấu quan trọng: ưu tiên đưa vào tóm tắt.
- Nếu có <tom_tat_truoc>: đó là bản tóm tắt phần đầu. Hãy gộp với phần hội thoại mới và trả về bản tóm tắt ĐẦY ĐỦ đã cập nhật (không chỉ phần mới), vẫn đúng khung bên dưới.{rules}

Viết HOÀN TOÀN bằng tiếng Việt (không chèn từ tiếng Anh; {names}), ngắn gọn, dễ hiểu, giọng văn hợp với kiểu trò chuyện (chuyện tình cảm, bạn bè thì viết nhẹ nhàng, gần gũi). Trả lời ĐÚNG theo khung Markdown sau, không thêm lời mở đầu hay kết:

## Ý chính
- (5–7 ý quan trọng nhất; ít nội dung thì viết ít hơn)

## Đã thống nhất
- (điều hai bên đã đồng ý / quyết định / hứa; nếu chưa có thì ghi "- Chưa có điều gì được chốt.")

## Việc cần làm / hẹn
- **Ai** — việc gì / hẹn gì — lúc nào: … (không rõ thì ghi "lúc nào: chưa rõ"; chưa có thì ghi "- Chưa có việc hay lời hẹn nào.")

## Con số & ngày giờ
- (giá, số lượng, ngày giờ, địa điểm… kèm ngữ cảnh; chưa có thì ghi "- Chưa có.")`;

/** Dịch bản tóm tắt sang tiếng của đối tác (để đưa đối tác xem). */
function translateSystem(lang: string) {
  const target = lang === "zh" ? "tiếng Trung giản thể" : `${langInline(lang)} (${language(lang)?.native ?? lang})`;
  return `Dịch bản tóm tắt cuộc trò chuyện dưới đây từ tiếng Việt sang ${target}, giọng văn công việc lịch sự, tự nhiên như người bản xứ viết.
Giữ nguyên cấu trúc Markdown (tiêu đề ##, gạch đầu dòng, chữ **đậm**), dịch cả tiêu đề. Giữ nguyên tên riêng và con số. Chỉ trả về bản dịch.`;
}

type Body = {
  /** "partner" (cũ: "zh"): dịch bản tóm tắt sang `lang`. */
  mode?: "summary" | "partner" | "zh";
  lang?: string;
  /** Ngôn ngữ đối tác nói (mã hoặc "auto") – để lời dặn tóm tắt hợp cuộc trò chuyện. */
  partner?: string;
  conversation?: ConversationType;
  transcript?: string;
  glossary?: string;
  inProgress?: boolean;
  summary?: string;
  /** Bản tóm tắt trước đó (tóm tắt cuốn chiếu: chỉ gửi phần hội thoại mới). */
  previous?: string;
  meetingContext?: string;
};

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Cần nhập mật khẩu trước." }, { status: 401 });
  }
  const useGroq = groqConfigured();
  if (!useGroq && !geminiConfigured()) {
    return Response.json({ error: "Máy chủ chưa có khoá AI để tóm tắt (GROQ_API_KEY hoặc GEMINI_API_KEY)." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  let system: string;
  let input: string;

  if (body.mode === "partner" || body.mode === "zh") {
    if (!body.summary?.trim()) {
      return Response.json({ error: "Chưa có bản tóm tắt để dịch." }, { status: 400 });
    }
    const lang = body.mode === "zh" ? "zh" : language(body.lang) ? body.lang! : "zh";
    system = translateSystem(lang);
    input = body.summary;
  } else {
    let transcript = body.transcript?.trim() ?? "";
    // Groq miễn phí giới hạn ~8.000 token/phút: cuộc họp dài thì bỏ dòng dịch máy, chỉ giữ câu gốc
    // (thường gọn hơn nhiều). Họp ngắn thì giữ lại để tóm tắt chính xác hơn.
    if (useGroq && transcript.length > GROQ_KEEP_TRANSLATION_CHARS) {
      transcript = transcript.replace(/\n\s*→ dịch máy:[^\n]*/g, "");
    }
    if (!transcript) {
      return Response.json({ error: "Chưa có nội dung cuộc họp." }, { status: 400 });
    }
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return Response.json({ error: "Cuộc họp quá dài để tóm tắt một lần." }, { status: 413 });
    }
    system = summarySystem(body.partner ?? "zh", isConversationType(body.conversation) ? body.conversation : "auto");
    input = [
      body.inProgress
        ? "Cuộc trò chuyện VẪN ĐANG DIỄN RA. Hãy tóm tắt những gì đã nói đến giờ."
        : "Cuộc trò chuyện đã kết thúc. Hãy tóm tắt toàn bộ.",
      body.glossary?.trim() ? `Tên riêng / thuật ngữ người dùng cung cấp:\n${body.glossary.trim()}` : "",
      body.meetingContext?.trim() ? `Bối cảnh (người dùng nhập trước):\n${body.meetingContext.trim().slice(0, 2000)}` : "",
      body.previous?.trim() ? `<tom_tat_truoc>\n${body.previous.trim()}\n</tom_tat_truoc>` : "",
      `<transcript>\n${transcript}\n</transcript>`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Suy luận "low": đủ để tóm tắt tốt mà vẫn nhanh và rẻ.
        const stream = useGroq
          ? groqStream({ system, input, maxTokens: 2500 })
          : geminiStream({ model: SUMMARY_MODEL, system, input, thinking: "low", maxTokens: 4096 });
        for await (const text of stream) {
          controller.enqueue(encoder.encode(text));
        }
      } catch (error) {
        const message = error instanceof GeminiError ? error.message : "Lỗi khi tóm tắt, thử lại nhé.";
        if (!(error instanceof GeminiError)) console.error("Summary error", error);
        controller.enqueue(encoder.encode(`${SUMMARY_ERROR_MARK}${message}`));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
