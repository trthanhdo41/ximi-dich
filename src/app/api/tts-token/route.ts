import { isAuthed } from "@/lib/auth";

// Khoá tạm cho giọng đọc AI (Soniox TTS): trình duyệt nối thẳng tới Soniox, đọc nhanh hơn đi vòng qua máy chủ.
// Khoá thật (SONIOX_API_KEY) không bao giờ rời máy chủ; khoá tạm chỉ dùng được để đọc và tự hết hạn sau 1 giờ.

export const runtime = "nodejs";

const LIFETIME_SECONDS = 3600;

export async function POST() {
  if (!(await isAuthed())) {
    return Response.json({ error: "Cần nhập mật khẩu trước." }, { status: 401 });
  }
  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) return Response.json({ error: "Máy chủ chưa có khoá Soniox." }, { status: 500 });

  let res: Response;
  try {
    res = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ usage_type: "tts_rt", expires_in_seconds: LIFETIME_SECONDS }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Máy chủ chưa kết nối được tới Soniox." }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.api_key) {
    console.warn("Soniox TTS temporary key error", res.status, data);
    return Response.json({ error: "Chưa lấy được khoá đọc, thử lại nhé." }, { status: 502 });
  }
  return Response.json({ apiKey: data.api_key, expiresAt: Date.parse(data.expires_at) || Date.now() + LIFETIME_SECONDS * 1000 });
}
