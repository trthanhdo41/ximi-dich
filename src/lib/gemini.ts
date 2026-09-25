// Gọi Gemini (Interactions API) từ server. Khoá GEMINI_API_KEY chỉ nằm ở server.
// Docs: https://ai.google.dev/api/interactions-api

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Tóm tắt cuộc họp: Flash mới nhất. */
export const SUMMARY_MODEL = "gemini-3.8-flash";
/** Dịch từng câu ở chế độ tiết kiệm: Flash-Lite, rẻ và nhanh nhất. */
export const TRANSLATE_MODEL = "gemini-3.5-flash-lite";

type ThinkingLevel = "minimal" | "low" | "medium" | "high";

type Request = {
  model: string;
  system: string;
  input: string;
  thinking: ThinkingLevel;
  maxTokens: number;
};

/** Lỗi đã được dịch sang tiếng Việt, hiện thẳng cho người dùng. */
export class GeminiError extends Error {}

/** Hết lượt / vượt giới hạn tốc độ của model → nên chuyển ngay sang model khác thay vì thử lại. */
export class RateLimitError extends GeminiError {}

function describe(status: number, body: string): string {
  // Google trả 400 kèm lý do cụ thể khi khoá sai.
  if (/API_KEY_INVALID|API key not valid/i.test(body)) return "Khoá Gemini không hợp lệ, kiểm tra lại GEMINI_API_KEY.";
  if (status === 402 || /prepayment|credits are depleted/i.test(body)) {
    return "Tài khoản Gemini đã hết tiền trả trước, cần nạp thêm tại AI Studio (ai.studio/projects).";
  }
  if (/BILLING|billing/.test(body)) return "Tài khoản Gemini chưa bật thanh toán.";
  if (status === 400) return "Yêu cầu gửi Gemini không hợp lệ.";
  if (status === 401 || status === 403) return "Khoá Gemini không hợp lệ hoặc chưa bật thanh toán.";
  if (status === 404) return "Không tìm thấy model Gemini, cần cập nhật app.";
  if (status === 429) return "Gemini đang quá tải hoặc hết hạn mức, đợi một lát rồi thử lại.";
  if (status >= 500) return "Máy chủ Gemini đang lỗi, thử lại sau ít phút.";
  return `Gemini báo lỗi (mã ${status}).`;
}

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

async function post(req: Request, stream: boolean): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(stream ? `${ENDPOINT}?alt=sse` : ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        model: req.model,
        input: req.input,
        system_instruction: req.system,
        generation_config: { thinking_level: req.thinking, max_output_tokens: req.maxTokens },
        stream,
        // Không lưu nội dung cuộc họp trên máy chủ Google.
        store: false,
      }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("Gemini network error", e);
    throw new GeminiError("Máy chủ không kết nối được tới Gemini.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Gemini error", res.status, body);
    throw new (res.status === 429 ? RateLimitError : GeminiError)(describe(res.status, body));
  }
  return res;
}

/** Trả về cả câu trả lời một lần (dùng cho câu ngắn). */
export async function geminiText(req: Request): Promise<string> {
  const res = await post(req, false);
  const data = (await res.json()) as {
    steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  };
  return (data.steps ?? [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
}

/** Trả về chữ chạy dần (SSE: các sự kiện step.delta chứa text). */
export async function* geminiStream(req: Request): AsyncGenerator<string> {
  const res = await post(req, true);
  if (!res.body) throw new GeminiError("Gemini không trả về dữ liệu.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: {
        event_type?: string;
        delta?: { type?: string; text?: string };
        error?: { code?: string | number; message?: string };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.event_type === "error") {
        console.error("Gemini stream error", event.error);
        throw new GeminiError("Gemini gặp lỗi giữa chừng, thử lại nhé.");
      }
      if (event.event_type === "step.delta" && event.delta?.type === "text" && event.delta.text) {
        yield event.delta.text;
      }
    }
  }
}
