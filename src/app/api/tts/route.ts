import { isAuthed } from "@/lib/auth";
import { language } from "@/lib/languages";
import { KNOWN_VOICES, voicesFor } from "@/lib/voices";

// Đọc to bản dịch bằng giọng AI của Soniox (tự nhiên như người thật, ~0,6 giây là bắt đầu có tiếng).
// Trả âm thanh thô (PCM 16-bit, 24 kHz, 1 kênh) theo luồng: trình duyệt nhận tới đâu phát tới đâu,
// không phải chờ hết cả câu. Khoá Soniox chỉ nằm ở máy chủ.
// Giá: khoảng $0,70 cho mỗi giờ giọng đọc được tạo ra.

export const runtime = "nodejs";
export const maxDuration = 60;

const TTS_URL = "https://tts-rt.soniox.com/tts";
const TTS_MODEL = "tts-rt-v2";
const MAX_CHARS = 800;
const TTS_SAMPLE_RATE = 24000;

function describe(status: number, body: string) {
  if (status === 401) return "Khoá Soniox không hợp lệ nên chưa đọc được.";
  if (status === 402) return "Tài khoản Soniox đã hết tiền, cần nạp thêm để đọc được.";
  if (status === 429) return "Đọc quá nhiều cùng lúc, đợi một chút nhé.";
  console.warn("Soniox TTS error", status, body.slice(0, 300));
  return "Chưa đọc được, thử lại nhé.";
}

export async function GET(request: Request) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Cần nhập mật khẩu trước." }, { status: 401 });
  }
  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) return Response.json({ error: "Máy chủ chưa có khoá Soniox." }, { status: 500 });

  const params = new URL(request.url).searchParams;
  const text = (params.get("text") ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return Response.json({ error: "Không có chữ để đọc." }, { status: 400 });
  const lang = language(params.get("lang") ?? "") ? params.get("lang")! : "vi";
  const asked = params.get("voice") ?? "";
  const voice = KNOWN_VOICES.has(asked) ? asked : voicesFor(lang)[0].id;
  const speed = Math.min(1.3, Math.max(0.8, Number(params.get("speed")) || 1.1));

  let res: Response;
  try {
    res = await fetch(TTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TTS_MODEL,
        language: lang,
        voice,
        audio_format: "pcm_s16le",
        sample_rate: TTS_SAMPLE_RATE,
        speed,
        text,
      }),
    });
  } catch {
    return Response.json({ error: "Máy chủ chưa kết nối được tới Soniox để đọc." }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    return Response.json({ error: describe(res.status, await res.text().catch(() => "")) }, { status: 502 });
  }
  // Chuyển thẳng luồng âm thanh về trình duyệt (phát được ngay từ những byte đầu).
  return new Response(res.body, {
    headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
  });
}
