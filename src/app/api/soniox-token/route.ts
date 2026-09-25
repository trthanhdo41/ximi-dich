import { isAuthed } from "@/lib/auth";

// Cấp temporary API key cho trình duyệt. Key thật (SONIOX_API_KEY) không bao giờ rời server.
// Docs: https://soniox.com/docs/stt/api-reference/auth/create_temporary_api_key

export const runtime = "nodejs";

export async function POST() {
  if (!(await isAuthed())) {
    return Response.json({ error: "Cần nhập mật khẩu trước." }, { status: 401 });
  }
  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Máy chủ chưa có khoá Soniox (SONIOX_API_KEY)." },
      { status: 500 },
    );
  }

  let res: Response;
  try {
    res = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      usage_type: "transcribe_websocket",
      // Key chỉ cần sống đủ lâu để mở kết nối WebSocket.
      expires_in_seconds: 60,
      single_use: true,
      // Cho phép một phiên họp kéo dài tối đa 5 tiếng.
      max_session_duration_seconds: 18000,
    }),
    cache: "no-store",
    });
  } catch (e) {
    // Mạng của máy chủ chập chờn: báo lỗi tạm thời (502) để trình duyệt tự thử lại, không dừng hẳn.
    console.error("Soniox temporary key network error", e);
    return Response.json({ error: "Máy chủ chưa kết nối được tới Soniox, đang thử lại…" }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Soniox temporary key error", res.status, detail);
    return Response.json(
      { error: `Không lấy được khoá tạm từ Soniox (mã ${res.status}).` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { api_key: string; expires_at: string };
  return Response.json(
    { apiKey: data.api_key, expiresAt: data.expires_at },
    { headers: { "Cache-Control": "no-store" } },
  );
}
