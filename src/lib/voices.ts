// Giọng đọc AI (Soniox TTS) cho từng thứ tiếng: ưu tiên giọng bản xứ, rõ ràng, dễ nghe.
// Mọi giọng đều đọc được mọi thứ tiếng, nhưng giọng bản xứ nghe tự nhiên nhất. Giọng đầu tiên là mặc định.

export type Voice = { id: string; label: string; gender: "male" | "female" };

const f = (id: string, label: string): Voice => ({ id, label, gender: "female" });
const m = (id: string, label: string): Voice => ({ id, label, gender: "male" });

/** Giọng nam dự phòng khi thứ tiếng không có giọng nam bản xứ (đọc rõ mọi thứ tiếng). */
const MALE_FALLBACK = [m("Adrian", "Adrian – nam, trầm, rõ ràng"), m("Harlan", "Harlan – nam, điềm tĩnh")];

export const VOICES: Record<string, Voice[]> = {
  vi: [
    f("Huong", "Hương – nữ, trong trẻo, rõ ràng"),
    f("Linh", "Linh – nữ, nhẹ nhàng, chậm rãi"),
    f("Mai", "Mai – nữ miền Nam, dịu"),
    m("Adrian", "Adrian – nam, trầm, rõ ràng"),
    m("Haoran", "Haoran – nam, nhẹ nhàng"),
    m("Kenji", "Kenji – nam, từ tốn"),
  ],
  en: [f("Iris", "Iris – nữ, rõ ràng, dịu dàng"), f("Hazel", "Hazel – nữ, tự nhiên"), m("Harlan", "Harlan – nam, điềm tĩnh"), m("Adrian", "Adrian – nam, trầm")],
  zh: [f("Meilin", "Meilin – nữ, nhanh nhẹn"), m("Haoran", "Haoran – nam, phát âm chuẩn"), m("Wei", "Wei – nam, trẻ, tự nhiên")],
  ja: [f("Nanami", "Nanami – nữ, rất dễ nghe"), f("Sakura", "Sakura – nữ, ấm áp"), m("Kenji", "Kenji – nam, lịch sự"), m("Sota", "Sota – nam, điềm đạm")],
  ko: [f("Jiwoo", "Jiwoo – nữ, rõ ràng"), f("Mina", "Mina – nữ, nhẹ nhàng"), m("Minjun", "Minjun – nam, trầm ấm"), m("Seojun", "Seojun – nam, rõ ràng")],
  id: [f("Sari", "Sari – nữ, rõ ràng")],
  ms: [f("Nurul", "Nurul – nữ, nhẹ nhàng")],
  tl: [f("Maricel", "Maricel – nữ, tươi sáng")],
  fr: [f("Celine", "Céline – nữ, rõ ràng"), m("Julien", "Julien – nam, ấm áp")],
  de: [f("Annika", "Annika – nữ, điềm tĩnh"), m("Tobias", "Tobias – nam, dễ nghe")],
  es: [f("Lucia", "Lucía – nữ, ấm áp"), m("Rafael", "Rafael – nam, rõ ràng")],
  pt: [f("Juliana", "Juliana – nữ, từ tốn"), m("Thiago", "Thiago – nam, ôn hoà")],
  it: [f("Giulia", "Giulia – nữ, tươi vui"), m("Giulio", "Giulio – nam, ấm áp")],
  ar: [f("Rania", "Rania – nữ, êm"), m("Karim", "Karim – nam, ấm")],
  hi: [f("Nisha", "Nisha – nữ, ấm áp"), m("Manav", "Manav – nam, rõ ràng")],
  ru: [f("Iris", "Iris – nữ, rõ ràng"), m("Andrei", "Andrei – nam, trung tính")],
  default: [f("Iris", "Iris – nữ, rõ ràng")],
};

/** Mọi giọng app dùng (để kiểm tra giọng gửi lên có hợp lệ). */
export const KNOWN_VOICES = new Set([...Object.values(VOICES).flat(), ...MALE_FALLBACK].map((v) => v.id));

/** Các giọng của một thứ tiếng; có lọc theo giới tính thì luôn có ít nhất một giọng. */
export function voicesFor(lang: string, gender?: "male" | "female") {
  const all = VOICES[lang] ?? VOICES.default;
  if (!gender) return all;
  const list = all.filter((v) => v.gender === gender);
  return list.length ? list : gender === "male" ? MALE_FALLBACK : VOICES.default;
}

/** Giọng đọc cho một thứ tiếng theo giới tính người nói (người dùng đã chọn thì theo lựa chọn đó). */
export function voiceFor(lang: string, gender: "male" | "female" | undefined, chosen?: string) {
  const list = voicesFor(lang, gender ?? "female");
  return list.find((v) => v.id === chosen)?.id ?? list[0].id;
}
