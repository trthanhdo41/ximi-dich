import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Đăng nhập bằng một mật khẩu chung (APP_PASSWORD). Sau khi đúng, trình duyệt giữ một
// cookie httpOnly; đổi mật khẩu trên server là mọi máy phải nhập lại.

export const AUTH_COOKIE = "mt_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 365;

/** Chuẩn hoá để gõ trên điện thoại không bị lỗi vì tự viết hoa / dấu cách thừa. */
function normalize(password: string) {
  return password.trim().toLowerCase();
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authToken(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", normalize(password)).update("meeting-translator/v1").digest("base64url");
}

export function passwordMatches(input: unknown): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password || typeof input !== "string") return false;
  return safeEqual(normalize(input), normalize(password));
}

export async function isAuthed(): Promise<boolean> {
  const expected = authToken();
  if (!expected) return false;
  const value = (await cookies()).get(AUTH_COOKIE)?.value;
  return !!value && safeEqual(value, expected);
}
