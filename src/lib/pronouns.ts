// Sửa xưng hô trong bản dịch nhanh (Soniox hay dịch "tôi / bạn") cho đúng giới tính người nói:
// người nói nam → tự xưng "anh", gọi người nghe "em"; người nói nữ → tự xưng "em", gọi người nghe "anh";
// bạn bè → "mình – bạn".
// Chỉ đổi các chữ chắc chắn là ngôi thứ nhất / thứ hai ("tôi", "chúng tôi", "bạn", "các bạn"),
// không đụng "anh / em" có sẵn (có thể là tên người thứ ba, vd. "anh Vương").

import type { Gender } from "./audio/pitch";

function replaceWord(text: string, word: string, to: string) {
  const re = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, "giu");
  return text.replace(re, (m) => (m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to));
}

export function fixPronouns(text: string, gender?: Gender, style: "gender" | "friends" = "gender") {
  // Bạn bè: "mình – bạn" (không phụ thuộc giới tính).
  if (style === "friends") return replaceWord(replaceWord(text, "chúng tôi", "bọn mình"), "tôi", "mình");
  if (!gender) return text;
  const self = gender === "male" ? "anh" : "em";
  const you = gender === "male" ? "em" : "anh";
  let out = replaceWord(text, "chúng tôi", `bên ${self}`);
  out = replaceWord(out, "tôi", self);
  out = replaceWord(out, "các bạn", `các ${you}`);
  out = replaceWord(out, "bạn", you);
  return out;
}
