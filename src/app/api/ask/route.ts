import { isAuthed } from "@/lib/auth";
import { SUMMARY_ERROR_MARK } from "@/lib/meeting/summary";
import { GeminiError, geminiConfigured, geminiStream, SUMMARY_MODEL } from "@/lib/gemini";
import { groqConfigured, groqStream } from "@/lib/groq";

// Hỏi AI về cuộc trò chuyện ("Họ nói gì về giá?", "Ai phải làm gì trước thứ Sáu?"), trả lời chạy dần.
// Gửi kèm bản tóm tắt (trí nhớ dài) + đoạn hội thoại gần nhất, để gọn trong giới hạn của AI.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TRANSCRIPT_CHARS = 6_000;

const SYSTEM = `Bạn là trợ lý của một người Việt đang trò chuyện với người nước ngoài (có thể là công việc, người yêu, bạn bè…).
Trả lời câu hỏi CHỈ dựa trên nội dung cuộc trò chuyện được cung cấp (bản tóm tắt + đoạn hội thoại gần nhất do máy nhận giọng, có thể sai chữ vì giọng địa phương – hãy đoán ý đúng theo ngữ cảnh).
- Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào ý; dùng gạch đầu dòng nếu có nhiều ý; in đậm **thông tin quan trọng**.
- Khi dẫn một câu cụ thể, ghi kèm giờ nói dạng [18:42] nếu có.
- Nội dung cuộc trò chuyện không nhắc tới thì nói rõ "Trong cuộc trò chuyện chưa thấy nhắc tới…", không bịa.
- Nếu là tiếng Trung, quy đổi đúng: 周三 = thứ Tư…; 块/元 = tệ. Tiền tệ khác giữ nguyên đơn vị người nói dùng.`;

type Body = { question?: string; transcript?: string; summary?: string; meetingContext?: string; glossary?: string };

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Cần nhập mật khẩu trước." }, { status: 401 });
  }
  const useGroq = groqConfigured();
  if (!useGroq && !geminiConfigured()) {
    return Response.json({ error: "Máy chủ chưa có khoá AI (GROQ_API_KEY hoặc GEMINI_API_KEY)." }, { status: 500 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const question = body.question?.trim().slice(0, 500);
  if (!question) return Response.json({ error: "Hãy nhập câu hỏi." }, { status: 400 });
  const transcript = (body.transcript ?? "").trim().slice(-MAX_TRANSCRIPT_CHARS);
  if (!transcript && !body.summary?.trim()) {
    return Response.json({ error: "Chưa có nội dung trò chuyện để hỏi." }, { status: 400 });
  }

  const input = [
    body.meetingContext?.trim() ? `Bối cảnh:\n${body.meetingContext.trim().slice(0, 1500)}` : "",
    body.glossary?.trim() ? `Tên riêng / thuật ngữ:\n${body.glossary.trim()}` : "",
    body.summary?.trim() ? `<tom_tat_den_gio>\n${body.summary.trim()}\n</tom_tat_den_gio>` : "",
    transcript ? `<hoi_thoai_gan_nhat>\n${transcript}\n</hoi_thoai_gan_nhat>` : "",
    `Câu hỏi: ${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = useGroq
          ? groqStream({ system: SYSTEM, input, maxTokens: 1200 })
          : geminiStream({ model: SUMMARY_MODEL, system: SYSTEM, input, thinking: "low", maxTokens: 1500 });
        for await (const text of stream) controller.enqueue(encoder.encode(text));
      } catch (error) {
        const message = error instanceof GeminiError ? error.message : "Lỗi khi hỏi AI, thử lại nhé.";
        if (!(error instanceof GeminiError)) console.error("Ask error", error);
        controller.enqueue(encoder.encode(`${SUMMARY_ERROR_MARK}${message}`));
      }
      controller.close();
    },
  });
  return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
