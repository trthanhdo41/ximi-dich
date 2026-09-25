// Gọi Groq (API kiểu OpenAI) từ server để tóm tắt. Khoá GROQ_API_KEY chỉ nằm ở server.
// Docs: https://console.groq.com/docs/models, https://console.groq.com/docs/reasoning

import { GeminiError, RateLimitError } from "./gemini";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Model ổn định (production) của Groq, đọc tốt tiếng Trung/Việt, rẻ ($0.15 / $0.60 mỗi 1M token). */
export const GROQ_SUMMARY_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export function groqConfigured() {
  return !!process.env.GROQ_API_KEY;
}

function describe(status: number, body: string): string {
  if (status === 401) return "Khoá Groq không hợp lệ, kiểm tra lại GROQ_API_KEY.";
  if (status === 413 || /tokens per minute|Request too large|TPM/i.test(body)) {
    return "Cuộc trò chuyện dài quá mức gói Groq miễn phí cho phép (khoảng 15–20 phút nói). Hãy tóm tắt sớm hơn, hoặc nâng gói Groq / nạp Gemini.";
  }
  if (status === 429) return "Đã dùng hết lượt Groq miễn phí trong lúc này, đợi 1 phút rồi thử lại.";
  if (status >= 500) return "Máy chủ Groq đang lỗi, thử lại sau ít phút.";
  return `Groq báo lỗi (mã ${status}).`;
}

/** Trả về chữ chạy dần (SSE kiểu OpenAI: choices[0].delta.content, kết thúc bằng [DONE]). */
export async function* groqStream(req: { system: string; input: string; maxTokens: number }): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: GROQ_SUMMARY_MODEL,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.input },
        ],
        stream: true,
        max_tokens: req.maxTokens,
        // Thấp để tóm tắt bám sát nội dung, ít "sáng tác" (ngày giờ, con số).
        temperature: 0.2,
        // gpt-oss: suy luận nhẹ, đủ để tóm tắt mà ít tốn token (gói miễn phí giới hạn token/phút).
        ...(GROQ_SUMMARY_MODEL.startsWith("openai/gpt-oss")
          ? { reasoning_effort: "low", include_reasoning: false }
          : { reasoning_format: "hidden" }),
      }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("Groq network error", e);
    throw new GeminiError("Máy chủ không kết nối được tới Groq.");
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error("Groq error", res.status, body);
    throw new (res.status === 429 || res.status === 413 ? RateLimitError : GeminiError)(describe(res.status, body));
  }

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
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
          error?: { message?: string };
        };
        if (chunk.error) {
          console.error("Groq stream error", chunk.error);
          throw new GeminiError("Groq gặp lỗi giữa chừng, thử lại nhé.");
        }
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch (e) {
        if (e instanceof GeminiError) throw e;
      }
    }
  }
}

/** Trả lời một lần dạng JSON (dùng cho gợi ý trả lời / dịch, cần nhanh). `model` mặc định là model tóm tắt. */
export async function groqJson(req: {
  system: string;
  input: string;
  maxTokens: number;
  model?: string;
  temperature?: number;
}): Promise<string> {
  return groqComplete({ ...req, json: true, temperature: req.temperature ?? 0.5 });
}

/** Model siêu nhanh cho bản dịch tạm trong lúc đang nói. */
export const GROQ_FAST_MODEL = process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b";

/** Trả lời một lần dạng chữ thường với model tuỳ chọn (dịch tạm). */
export async function groqPlain(req: { system: string; input: string; maxTokens: number; model: string }): Promise<string> {
  return (await groqComplete({ ...req, json: false, temperature: 0.2 })).trim();
}

/** Model người Trung làm (Alibaba Qwen) – hiểu thành ngữ, khẩu ngữ đại lục tốt nhất; dùng để dịch từng câu. */
export const GROQ_TRANSLATE_MODEL = process.env.GROQ_TRANSLATE_MODEL || "qwen/qwen3.8-27b";

/** Tắt/giảm suy luận cho từng họ model (gpt-oss: effort thấp; Qwen: tắt hẳn để nhanh, ít token). */
function reasoningParams(model: string) {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low", include_reasoning: false };
  if (model.startsWith("qwen/")) return { reasoning_effort: "none" };
  return {};
}

/** Trả lời một lần dạng chữ thường (dùng để dịch từng câu). */
export async function groqText(req: { system: string; input: string; maxTokens: number }): Promise<string> {
  return (await groqComplete({ ...req, json: false, temperature: 0.2 })).trim();
}

async function groqComplete(req: {
  system: string;
  input: string;
  maxTokens: number;
  json: boolean;
  temperature: number;
  model?: string;
}): Promise<string> {
  const model = req.model ?? GROQ_SUMMARY_MODEL;
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ""}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.input },
        ],
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
        ...reasoningParams(model),
      }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("Groq network error", e);
    throw new GeminiError("Máy chủ không kết nối được tới Groq.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Groq error", res.status, body);
    throw new (res.status === 429 || res.status === 413 ? RateLimitError : GeminiError)(describe(res.status, body));
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}
