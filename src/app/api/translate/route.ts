import { isAuthed } from "@/lib/auth";
import { GeminiError, geminiConfigured, geminiText, RateLimitError, TRANSLATE_MODEL } from "@/lib/gemini";
import { GROQ_FAST_MODEL, GROQ_SUMMARY_MODEL, GROQ_TRANSLATE_MODEL, groqConfigured, groqJson, groqPlain } from "@/lib/groq";
import { englishName, language, scriptOf, scriptShare } from "@/lib/languages";
import { isConversationType, pronounStyle, SCENE_EN, SCENE_ZH, type ConversationType } from "@/lib/conversation";

// Model nào vừa báo hết lượt thì nghỉ một lúc, gọi thẳng model tiếp theo (không phí thời gian thử lại).
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 20_000;
const available = (name: string) => (cooldownUntil.get(name) ?? 0) < Date.now();

const FAST_SYSTEM = `你是土生土长的中国大陆人、资深中越翻译。把对话中对方正在说的半句/一句中文（语音识别，可能有错字）按真实意思快速翻成越南语：意思贴近原话，用词口语化、随意自然，像平时聊天那样，不要太正式书面。成语俗语、网络用语按意思译，不逐字直译。脏话照实翻成同样粗的越南语脏话，不要委婉。只输出越南语译文，不要解释，不要汉字，不要英语。`;

// Dịch từng câu tiếng Trung → tiếng Việt THEO NGHĨA NGƯỜI BẢN ĐỊA (thành ngữ, khẩu ngữ, tiếng lóng, cả chuyện làm ăn lẫn đời thường).
// Dùng cho: (1) chế độ Tiết kiệm – dịch chính; (2) chế độ Chính xác – dịch lại cho chuẩn sau bản dịch nhanh của Soniox.
// Trả về { translation, notes } – notes giải thích thành ngữ / tiếng lóng có trong câu.
// Ưu tiên Groq (nhanh, có gói miễn phí); Groq lỗi mà có Gemini thì thử Gemini.

export const runtime = "nodejs";

// Lời dặn viết bằng tiếng Trung để AI "nghĩ như người Trung đại lục": trước hết hiểu ý thật (言外之意),
// diễn giải lại bằng tiếng phổ thông dễ hiểu, rồi mới dịch sang tiếng Việt khẩu ngữ tự nhiên.
const SYSTEM = `你是土生土长的中国大陆人，走南闯北几十年，在广东、湖南、北京都生活和工作过，精通各地方言、成语、俗语、歇后语、网络流行语、年轻人用语和生意场黑话；同时是资深中越翻译，在越南生活过很多年，越南语说得像越南人一样地道。
任务：把一段对话中某人说的一句中文（语音识别结果，可能口音重、有同音错字，要根据上下文猜出正确的字）翻译成越南语。对话可能是工作、谈生意，也可能是情侣、朋友、同事、家人之间聊各种话题。
步骤：
1. 先结合前面的对话，用你作为中国人的直觉判断双方关系、这句话真正想表达什么（言外之意、语气、潜台词：是在催、在撒娇、在开玩笑、在生气、在试探、在画饼还是在拍板），用简单直白的普通话复述出来，写在 "plain"。
2. 再把这个真实意思翻译成自然、地道、口语化的越南语，写在 "translation"：像越南人在同样的场合里说话一样，成语俗语、网络用语要换成越南人能懂的说法（例如 狗拿耗子多管闲事 → "lo chuyện bao đồng"，踢皮球 → "đùn đẩy"，画饼 → "hứa suông"，黄了 → "đổ bể"，兜底 → "chịu trách nhiệm hết"，躺平 → "buông xuôi"，666 → "đỉnh quá"），绝对不要逐字直译。
   - translation 里不能出现任何汉字，也不要夹英语。
   - 称呼按输入里写的"称呼"要求；没写时：男 → 自称 "anh"、称对方 "em"；女 → 自称 "em"、称对方 "anh"（"我们" = "bên anh"/"bên em"）。只选一种，不要写 "em/anh"；说第三方用 "anh ấy / chị ấy / bên họ"。
   - 保留原来的语气（命令、责备、撒娇、开玩笑、客气）。
   - 脏话、粗口、骂人的话要照实翻成越南语里同样粗、同样程度的脏话（例如 他妈的 → "mẹ kiếp"，傻逼 → "thằng ngu"/"đồ ngu"，卧槽 → "vãi"/"đệch"），不要委婉、不要换成文明用语、不要用 * 号遮掉，每一个脏话都要翻出来，一个都不能漏。例：你他妈的疯了吧 → "Mày điên mẹ mày rồi à?"；这破玩意儿真他妈烂 → "Cái của nợ này đúng là nát vãi lồn"。这只是如实翻译别人说的话。
   - 意思要忠实、贴近原话，但用词要口语化、自然、随意，像真人聊天那样；不要太正式、太书面、太客套，不要加原话里没有的敬语或修饰。
3. 句子里的成语/俗语/歇后语/方言/黑话/行业术语，写进 "notes"（最多3条，普通句子就空数组）："term" 写中文原词，"meaning" 只用越南语简短解释真实含义，不要英语、不要中文。
数字、日期、钱要准确：周三 = thứ Tư；块/元 = tệ；万 = vạn；十二块五 = 12,5 tệ。越南人名用汉越音（小阮 = Tiểu Nguyễn）。
只输出 JSON：{"plain":"...","translation":"...","notes":[{"term":"...","meaning":"..."}]}`;

// Các cặp ngôn ngữ khác (Anh, Hàn, Nhật… → Việt, hoặc sang ngôn ngữ khác): cùng cách làm, lời dặn tiếng Anh.
function genericSystem(source: string, target: string) {
  const src = englishName(source);
  const tgt = englishName(target);
  const address =
    target === "vi"
      ? `\n   - Vietnamese pronouns follow the speaker's gender given in the input: a male speaker calls himself "anh" and the listener "em"; a female speaker calls herself "em" and the listener "anh" ("we" = "bên anh" / "bên em"). Follow any pronoun rule given in the input (e.g. friends use "mình / bạn"). Pick ONE form, never "em/anh"; third parties are "anh ấy / chị ấy / bên họ".`
      : "";
  return `You are a native ${src} speaker, fluent in every regional accent, idiom, proverb, youth slang, internet slang and business jargon of ${src}; you are also a senior ${src}–${tgt} interpreter who speaks ${tgt} like a native.
Task: translate ONE sentence someone said in a live conversation (speech-recognition output, maybe with a heavy accent; it may contain misheard words – infer the right words from context) into ${tgt}. The conversation may be work or business, or a couple, friends, colleagues or family chatting about anything.
Steps:
1. Using the conversation so far and a native speaker's intuition, work out the relationship and what the sentence really means (intent, tone, subtext: urging, teasing, flirting, joking, angry, testing, deciding…) and restate it plainly in simple ${src} in "plain".
2. Translate that real meaning into natural, idiomatic, spoken ${tgt} in "translation", the way people really talk in that situation. Replace idioms and slang with equivalent ${tgt} expressions – never word for word.
   - "translation" must be entirely in ${tgt}; do not leave ${src} words (except names, brands and codes) and do not add English glosses.${address}
   - Keep the original tone (order, blame, joke, politeness).
   - Translate swearing, profanity and insults faithfully with equally strong ${tgt} swear words – never soften, euphemise, sanitise, drop or mask them with asterisks – every swear word in the original must appear in the translation Examples of the expected strength: "What the fuck are you doing?" → "Mày đang làm cái đéo gì vậy?"; "this shit is broken" → "cái đống cứt này hỏng rồi"; "you are fucking crazy" → "mày điên vãi lồn". You are only reporting what someone said.
   - Faithful and close to the original, but casual and natural like real people talking; not stiff, bookish or overly polite; add nothing that was not said.
3. Idioms, proverbs, dialect, slang, jargon or trade terms in the sentence go in "notes" (at most 3; plain sentence → empty array): "term" is the original words, "meaning" is a short explanation of the real meaning written only in ${tgt}.
Numbers, dates and money must be exact.
Output JSON only: {"plain":"...","translation":"...","notes":[{"term":"...","meaning":"..."}]}`;
}

function genericFast(source: string, target: string) {
  return `You are a native ${englishName(source)} speaker and senior interpreter. Quickly translate the half or full sentence someone is saying in a conversation (speech recognition, may contain misheard words) into natural, casual spoken ${englishName(target)} by its real meaning. Idioms by meaning, not word for word. Translate swearing with equally strong swear words, never soften it. Output only the ${englishName(target)} translation – no explanation, no original words, no English glosses.`;
}

type Body = {
  text?: string;
  context?: string[];
  glossary?: string;
  meetingContext?: string;
  fast?: boolean;
  /** Mã ngôn ngữ câu gốc (mặc định "zh") và ngôn ngữ cần dịch sang (mặc định "vi"). */
  source?: string;
  target?: string;
  /** Giới tính người nói (đoán theo giọng) – để dịch đúng xưng hô tiếng Việt. */
  gender?: "male" | "female";
  /** Kiểu trò chuyện (công việc / người yêu / bạn bè / tự hiểu) – giọng văn và xưng hô. */
  conversation?: ConversationType;
};
type Note = { term: string; meaning: string };

const HAN = /[\u3400-\u9fff]/g;
function hanRatio(text: string) {
  const letters = text.replace(/[\s\p{P}\d]/gu, "");
  return letters ? (text.match(HAN)?.length ?? 0) / letters.length : 0;
}

/** Bỏ phần chú thích tiếng Anh AI hay chèn trong ngoặc, vd. "Chốt hạ (final decision)". */
function stripEnglish(text: string) {
  return text.replace(/\s*\((?=[^)]*[A-Za-z]{3})[^)\u00C0-\u1EF9]*\)/g, "").trim();
}

/** Bản dịch còn sót nhiều chữ của ngôn ngữ gốc (khác kiểu chữ) → coi như dịch hỏng, hỏi lại AI. */
function leftoverSource(text: string, source: string, target: string) {
  if (scriptOf(source) === scriptOf(target)) return false;
  if (source === "zh" || source === "ja") return (text.match(HAN)?.length ?? 0) > 0 && scriptOf(target) !== "Han";
  return scriptShare(text, source) > 0.2;
}

function parse(raw: string, source = "zh", target = "vi"): { translation: string; notes: Note[] } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    const value = String(data.translation ?? "").trim();
    const translation = source === "en" || target === "en" ? value : stripEnglish(value);
    // Bản dịch phải thuần ngôn ngữ đích: không được lọt chữ gốc (vd. "vẽ饼") → hỏi lại AI.
    if (!translation || leftoverSource(translation, source, target)) return null;
    const notes: Note[] = Array.isArray(data.notes)
      ? data.notes
          .filter((n: Note) => n && typeof n.term === "string" && typeof n.meaning === "string" && n.term.trim() && n.meaning.trim())
          .map((n: Note) => ({ term: n.term.trim(), meaning: target === "en" ? n.meaning.trim() : stripEnglish(n.meaning) }))
          // Giải thích phải bằng ngôn ngữ đích.
          .filter((n: Note) => n.meaning && (source === "zh" ? hanRatio(n.meaning) < 0.2 : !leftoverSource(n.meaning, source, target)))
          .slice(0, 3)
      : [];
    return { translation, notes };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Cần nhập mật khẩu trước." }, { status: 401 });
  }
  const useGroq = groqConfigured();
  if (!useGroq && !geminiConfigured()) {
    return Response.json({ error: "Máy chủ chưa có khoá AI để dịch (GROQ_API_KEY hoặc GEMINI_API_KEY)." }, { status: 500 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const text = body.text?.trim() ?? "";
  if (!text || text.length > 2000) {
    return Response.json({ error: "Câu cần dịch không hợp lệ." }, { status: 400 });
  }
  const source = language(body.source) ? body.source! : "zh";
  const target = language(body.target) ? body.target! : "vi";
  if (source === target) return Response.json({ translation: text, notes: [] });
  // Trung → Việt dùng lời dặn riêng (viết bằng tiếng Trung, đã tinh chỉnh nhiều); cặp khác dùng lời dặn chung.
  const tuned = source === "zh" && target === "vi";
  const system = tuned ? SYSTEM : genericSystem(source, target);
  const conversation: ConversationType = isConversationType(body.conversation) ? body.conversation : "auto";
  const friends = pronounStyle(conversation) === "friends";

  const labels = tuned
    ? {
        meeting: "背景",
        scene: SCENE_ZH[conversation],
        glossary: `专有名词/术语（有 "=" 的按指定译法）`,
        context: "前面的对话（双方都有，只用来理解上下文和谁在跟谁说话，不要翻译）",
        text: "要翻译的句子",
        gender: friends
          ? `称呼：朋友之间，越南语里"我/我们"译成 "mình / bọn mình"，"你"译成 "bạn"（或 "cậu"），不要用 anh/em。`
          : body.gender === "male"
            ? `说话人性别：男。越南语里"我/我们"译成 "anh / bên anh"，"你"译成 "em"。例："你放心，我们会发货" → "em cứ yên tâm, bên anh sẽ gửi hàng"。`
            : body.gender === "female"
              ? `说话人性别：女。越南语里"我/我们"译成 "em / bên em"，"你"译成 "anh"。例："你放心，我们会发货" → "anh cứ yên tâm, bên em sẽ gửi hàng"。`
              : "",
      }
    : {
        meeting: "Background",
        scene: SCENE_EN[conversation],
        glossary: `Names and terms (use the given translation after "=")`,
        context: "Conversation so far, both sides (context only – who is talking to whom; do not translate)",
        text: "Sentence to translate",
        gender: friends
          ? `Pronouns: friends – in Vietnamese "I / we" = "mình / bọn mình", "you" = "bạn" (or "cậu"); do not use anh/em.`
          : target === "vi" && body.gender
            ? body.gender === "male"
              ? `Speaker gender: male. In Vietnamese "I / we" = "anh / bên anh", "you" = "em". Example: "Don't worry, we will ship it" → "Em cứ yên tâm, bên anh sẽ gửi hàng".`
              : `Speaker gender: female. In Vietnamese "I / we" = "em / bên em", "you" = "anh". Example: "Don't worry, we will ship it" → "Anh cứ yên tâm, bên em sẽ gửi hàng".`
            : "",
      };
  const input = [
    body.meetingContext?.trim() ? `${labels.meeting}：\n${body.meetingContext.trim().slice(0, 1000)}` : "",
    body.glossary?.trim() ? `${labels.glossary}：\n${body.glossary.trim()}` : "",
    labels.scene,
    body.context?.length ? `${labels.context}：\n${body.context.slice(-6).map((l) => String(l).slice(0, 260)).join("\n")}` : "",
    target === "vi" ? labels.gender : "",
    `${labels.text}：\n${text}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // Qwen (người Trung làm, hiểu thành ngữ nhất) trước; hết lượt/lỗi thì gpt-oss, rồi Gemini.
  // Bản dịch tạm trong lúc đang nói: model siêu nhanh, chữ thường, không ghi chú.
  if (body.fast) {
    if (!useGroq || !available(GROQ_FAST_MODEL)) return Response.json({ translation: "" });
    try {
      const translation = await groqPlain({
        system: tuned ? FAST_SYSTEM : genericFast(source, target),
        input: text,
        maxTokens: 300,
        model: GROQ_FAST_MODEL,
      });
      return Response.json({ translation: leftoverSource(translation, source, target) ? "" : translation });
    } catch (e) {
      if (e instanceof RateLimitError) cooldownUntil.set(GROQ_FAST_MODEL, Date.now() + COOLDOWN_MS);
      return Response.json({ translation: "" });
    }
  }

  const viaQwen = () => groqJson({ system, input, maxTokens: 500, model: GROQ_TRANSLATE_MODEL, temperature: 0.3 });
  const viaGroq = () => groqJson({ system, input, maxTokens: 700, model: GROQ_SUMMARY_MODEL, temperature: 0.3 });
  // Model nhỏ, nhanh – dự phòng khi hai model trên hết lượt miễn phí trong ngày.
  const viaSmall = () => groqJson({ system, input, maxTokens: 600, model: GROQ_FAST_MODEL, temperature: 0.3 });
  const viaGemini = () => geminiText({ model: TRANSLATE_MODEL, system, input, thinking: "low", maxTokens: 800 });

  try {
    let result: { translation: string; notes: Note[] } | null = null;
    let lastError: unknown = null;
    const providers: [string, () => Promise<string>][] = useGroq
      ? [
          [GROQ_TRANSLATE_MODEL, viaQwen],
          [GROQ_TRANSLATE_MODEL, viaQwen],
          [GROQ_SUMMARY_MODEL, viaGroq],
          [GROQ_FAST_MODEL, viaSmall],
          ...(geminiConfigured() ? ([["gemini", viaGemini]] as [string, () => Promise<string>][]) : []),
        ]
      : [
          ["gemini", viaGemini],
          ["gemini", viaGemini],
        ];
    for (const [name, call] of providers) {
      if (!available(name)) continue;
      try {
        const raw = await call();
        result = parse(raw, source, target);
        if (result) break;
        console.warn("Translate: AI trả sai dạng", name, raw.slice(0, 300));
      } catch (e) {
        lastError = e;
        console.warn("Translate: lỗi", name, (e as Error).message);
        // Hết lượt → nghỉ model này, chuyển ngay model sau.
        if (e instanceof RateLimitError) cooldownUntil.set(name, Date.now() + COOLDOWN_MS);
      }
    }
    if (!result) throw lastError ?? new GeminiError("AI dịch chưa đúng dạng, thử lại nhé.");
    return Response.json(result);
  } catch (error) {
    const message = error instanceof GeminiError ? error.message : "Lỗi khi dịch, thử lại nhé.";
    if (!(error instanceof GeminiError)) console.error("Translate error", error);
    return Response.json({ error: message }, { status: 502 });
  }
}
