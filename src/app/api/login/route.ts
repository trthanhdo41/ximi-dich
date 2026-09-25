import { cookies } from "next/headers";
import { AUTH_COOKIE, AUTH_MAX_AGE, authToken, passwordMatches } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = authToken();
  if (!token) {
    return Response.json({ error: "Máy chủ chưa đặt mật khẩu (APP_PASSWORD)." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  if (!passwordMatches(body?.password)) {
    // Làm chậm việc dò mật khẩu.
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "Sai mật khẩu rồi, thử lại nhé." }, { status: 401 });
  }

  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return Response.json({ ok: true });
}
