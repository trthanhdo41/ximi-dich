"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AUTO_PAUSE_KEY,
  AUTO_READ_KEY,
  CONVERSATION_KEY,
  ENGINE_KEY,
  PARTNER_VOICE_KEY,
  PARTNER_VOICE_MALE_KEY,
  READ_MINE_KEY,
  READ_MODE_KEY,
  GLOSSARY_KEY,
  MEETING_CONTEXT_KEY,
  MY_NAMES_KEY,
  PINYIN_KEY,
  readStorage,
  REFINE_KEY,
  TTS_VOICE_KEY,
  TTS_VOICE_MALE_KEY,
  VIEW_KEY,
  writeStorage,
} from "@/lib/browser/storage";
import type { Engine } from "@/lib/meeting/use-live-translator";
import { applyTheme, currentTheme, type Theme } from "@/lib/browser/theme";
import { loadPinyin } from "@/lib/pinyin";
import { CONVERSATIONS, getConversationType, type ConversationType } from "@/lib/conversation";
import { getTtsPlayer } from "@/lib/browser/tts-player";
import { voicesFor } from "@/lib/voices";
import { AUTO, getLangPair, LANGUAGES, langName, POPULAR_CODES, setLangPair, type LangPair } from "@/lib/languages";
import { Credit } from "./brand";
import {
  BellRingIcon,
  ChatsIcon,
  ChevronDownIcon,
  GlobeIcon,
  FileTextIcon,
  LanguagesIcon,
  MoonIcon,
  PauseIcon,
  PinyinIcon,
  SpeakerIcon,
  ScriptIcon,
  SunIcon,
  TargetIcon,
  WaveIcon,
} from "./icons";

/** Tiêu đề mục cài đặt kèm icon. */
function Label({ icon, children, htmlFor }: { icon: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 text-[15px] font-medium">
      <span className="text-fg-3">{icon}</span>
      {children}
    </label>
  );
}

/** Một dòng cài đặt bật/tắt: tiêu đề + mô tả bên trái, công tắc bên phải. */
function SwitchRow({
  on,
  onToggle,
  icon,
  title,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 text-left" role="switch" aria-checked={on}>
      <span className="min-w-0 flex-1">
        <Label icon={icon}>{title}</Label>
        <span className="mt-1 block text-[13px] leading-relaxed text-fg-2">{children}</span>
      </span>
      <span className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}>
        <motion.span
          className="absolute top-1 size-5 rounded-full bg-white shadow"
          animate={{ left: on ? 24 : 4 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  );
}

/** Ô chọn ngôn ngữ (danh sách chọn có sẵn của máy – dễ bấm nhất trên điện thoại). */
function LanguageSelect({
  id,
  label,
  value,
  onChange,
  exclude,
  allowAuto,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
  exclude?: string;
  allowAuto?: boolean;
}) {
  const list = LANGUAGES.filter((l) => l.code !== exclude);
  const popular = POPULAR_CODES.map((c) => list.find((l) => l.code === c)).filter((l) => !!l);
  const others = list.filter((l) => !POPULAR_CODES.includes(l.code)).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const option = (l: (typeof LANGUAGES)[number]) => (
    <option key={l.code} value={l.code}>
      {l.name === l.native ? l.name : `${l.name} · ${l.native}`}
    </option>
  );
  return (
    <label htmlFor={id} className="block">
      <span className="text-[13px] font-medium text-fg-2">{label}</span>
      <span className="relative mt-1.5 block">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full appearance-none rounded-2xl bg-surface-2 pr-10 pl-4 text-[16px] font-medium ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
        >
          {allowAuto && <option value={AUTO}>Nhiều thứ tiếng (tự nhận)</option>}
          <optgroup label="Hay dùng">{popular.map(option)}</optgroup>
          <optgroup label="Tất cả">{others.map(option)}</optgroup>
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-fg-3" />
      </span>
    </label>
  );
}

/** Khối gập/mở (phần ít dùng). */
function Disclosure({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-surface-2/60 ring-1 ring-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">{title}</span>
          {hint && !open && <span className="mt-0.5 block text-[12px] leading-snug text-fg-3">{hint}</span>}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-fg-3">
          <ChevronDownIcon className="size-5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pt-1 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Câu đọc thử giọng (thứ tiếng không có câu mẫu thì đọc câu tiếng Anh). */
const SAMPLE_TEXT: Record<string, string> = {
  vi: "Lô hàng này phải gửi đi trước thứ Sáu, giá cả thì vẫn còn bàn thêm được.",
  en: "This shipment has to go out before Friday, and we can still talk about the price.",
  zh: "这批货周五之前一定要发出去，价格方面还可以再谈。",
  ko: "이 물건은 금요일 전에 꼭 보내야 하고, 가격은 더 협의할 수 있습니다.",
  ja: "この荷物は金曜日までに必ず発送します。価格はまだ相談できます。",
  th: "สินค้าล็อตนี้ต้องส่งก่อนวันศุกร์ ส่วนราคายังคุยกันได้อีก",
  id: "Barang ini harus dikirim sebelum hari Jumat, harganya masih bisa dibicarakan.",
  ms: "Barang ini mesti dihantar sebelum hari Jumaat, harga masih boleh dirunding.",
  tl: "Kailangang maipadala ang order na ito bago mag-Biyernes, at puwede pa nating pag-usapan ang presyo.",
  fr: "Cette livraison doit partir avant vendredi, et on peut encore discuter du prix.",
  de: "Diese Lieferung muss vor Freitag raus, über den Preis können wir noch reden.",
  es: "Este envío tiene que salir antes del viernes, y todavía podemos hablar del precio.",
  ru: "Эту партию нужно отправить до пятницы, а о цене ещё можно договориться.",
  hi: "यह माल शुक्रवार से पहले भेजना है, कीमत पर अभी बात हो सकती है।",
  ar: "يجب إرسال هذه الشحنة قبل يوم الجمعة، ويمكننا مناقشة السعر.",
};

/** Chọn giọng đọc cho một thứ tiếng + nút nghe thử. */
function VoicePicker({
  id,
  label,
  lang,
  storageKey,
  gender,
}: {
  id: string;
  label: string;
  lang: string;
  storageKey: string;
  gender: "male" | "female";
}) {
  const voices = voicesFor(lang, gender);
  const [voice, setVoice] = useState(() => readStorage(storageKey));
  const voiceId = voices.some((v) => v.id === voice) ? voice : voices[0].id;
  const [previewing, setPreviewing] = useState(false);
  const preview = () => {
    const player = getTtsPlayer();
    player.unlock();
    if (previewing) return player.stop();
    const sample = SAMPLE_TEXT[lang];
    player.speakNow({
      text: sample ?? SAMPLE_TEXT.en,
      lang: sample ? lang : "en",
      voice: voiceId,
      onStart: () => setPreviewing(true),
      onEnd: () => setPreviewing(false),
    });
    setPreviewing(true);
  };
  return (
    <div>
      <span className="text-[13px] font-medium text-fg-2">
        {label} · {langName(lang)}
      </span>
      <div className="mt-1.5 flex gap-2">
        <label htmlFor={id} className="relative block min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <select
            id={id}
            value={voiceId}
            onChange={(e) => {
              setVoice(e.target.value);
              writeStorage(storageKey, e.target.value);
            }}
            className="h-12 w-full appearance-none rounded-2xl bg-surface-2 pr-10 pl-4 text-[15px] font-medium ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-fg-3" />
        </label>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={preview}
          className={`flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-[14px] font-semibold ring-1 transition-colors ${
            previewing ? "bg-accent-soft text-accent ring-accent/40" : "bg-surface-2 text-fg ring-line"
          }`}
        >
          <SpeakerIcon className="size-4" />
          {previewing ? "Dừng" : "Nghe thử"}
        </motion.button>
      </div>
    </div>
  );
}

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } },
} as const;

export function SettingsPanel({ running, onDone }: { running: boolean; onDone: () => void }) {
  const [glossary, setGlossary] = useState(() => readStorage(GLOSSARY_KEY));
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [meetingContext, setMeetingContext] = useState(() => readStorage(MEETING_CONTEXT_KEY));
  const [myNames, setMyNames] = useState(() => readStorage(MY_NAMES_KEY));
  const [autoPause, setAutoPause] = useState(() => readStorage(AUTO_PAUSE_KEY, "3"));
  const [refine, setRefine] = useState(() => readStorage(REFINE_KEY, "1") !== "0");
  const [pinyin, setPinyin] = useState(() => readStorage(PINYIN_KEY, "1") !== "0");
  const [pair, setPair] = useState<LangPair>(getLangPair);
  const [conversation, setConversation] = useState<ConversationType>(getConversationType);
  const [autoRead, setAutoRead] = useState(() => readStorage(AUTO_READ_KEY, "1") !== "0");
  const [readMine, setReadMine] = useState(() => readStorage(READ_MINE_KEY, "1") !== "0");
  const [readMode, setReadMode] = useState(() => (readStorage(READ_MODE_KEY, "accurate") === "live" ? "live" : "accurate"));
  const changePair = (next: LangPair) => {
    setPair(next);
    setLangPair(next);
  };
  const [view, setView] = useState(() => (readStorage(VIEW_KEY) === "bubbles" ? "bubbles" : "lines"));
  const [engine, setEngine] = useState<Engine>(() =>
    readStorage(ENGINE_KEY) === "browser" ? "browser" : "soniox",
  );
  const changeEngine = (e: Engine) => {
    setEngine(e);
    writeStorage(ENGINE_KEY, e);
  };

  const changeTheme = (t: Theme, e: React.MouseEvent) => {
    if (t === theme) return;
    setTheme(t);
    applyTheme(t, { x: e.clientX, y: e.clientY });
  };

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.06 } } }}
    >
      <motion.h3 variants={item} className="pt-2 text-[12px] font-bold tracking-[0.08em] text-fg-3 uppercase">
        Trò chuyện
      </motion.h3>

      <motion.section variants={item}>
        <Label icon={<GlobeIcon className="size-4" />}>Ngôn ngữ</Label>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Chọn đúng thứ tiếng người kia nói để app nghe chính xác nhất. App dịch cả hai chiều: lời người kia sang tiếng của
          em, lời em sang tiếng của người kia.
        </p>
        <div className="mt-3 grid gap-3">
          <LanguageSelect
            id="partner-language"
            label="Người kia nói"
            value={pair.partner}
            exclude={pair.mine}
            allowAuto
            onChange={(partner) => changePair({ ...pair, partner })}
          />
          <LanguageSelect
            id="my-language"
            label="Em nói (tiếng của em)"
            value={pair.mine}
            exclude={pair.partner}
            onChange={(mine) => changePair({ ...pair, mine })}
          />
        </div>
        {pair.partner === AUTO && (
          <p className="mt-2 text-[13px] leading-relaxed text-fg-2">
            Dùng khi nói chuyện với nhiều người, nhiều thứ tiếng. App tự nhận từng câu là tiếng gì, nhưng kém chính xác hơn khi chọn sẵn
            một thứ tiếng.
          </p>
        )}
        {running && <p className="mt-2 text-[13px] text-fg-2">Sẽ áp dụng từ lần bấm nghe tiếp theo.</p>}
      </motion.section>

      <motion.section variants={item}>
        <Label icon={<ChatsIcon className="size-4" />}>Kiểu trò chuyện</Label>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Để AI dịch đúng giọng và xưng hô: công việc, người yêu thì “anh – em” theo giọng nam/nữ; bạn bè thì “mình – bạn”.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CONVERSATIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setConversation(c.id);
                writeStorage(CONVERSATION_KEY, c.id);
              }}
              className={`rounded-2xl p-3 text-left ring-1 transition-colors ${
                conversation === c.id ? "bg-accent-soft ring-accent/50" : "bg-surface-2 ring-line"
              }`}
            >
              <span className="block text-[14px] font-semibold">{c.label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-fg-2">{c.desc}</span>
            </button>
          ))}
        </div>
      </motion.section>

      <motion.h3 variants={item} className="pt-2 text-[12px] font-bold tracking-[0.08em] text-fg-3 uppercase">
        Đọc to
      </motion.h3>

      <motion.section variants={item}>
        <SwitchRow
          on={autoRead}
          onToggle={() => {
            writeStorage(AUTO_READ_KEY, autoRead ? "0" : "1");
            if (autoRead) getTtsPlayer().stop();
            else getTtsPlayer().unlock();
            setAutoRead(!autoRead);
          }}
          icon={<SpeakerIcon className="size-4" />}
          title="Tự đọc to bản dịch"
        >
          Người kia nói tới đâu, app đọc bản dịch cho em nghe tới đó bằng giọng AI tự nhiên. Giọng đọc tính tiền theo thời lượng
          đọc (~18.000đ mỗi giờ giọng được đọc) – không cần thì tắt ở đây hoặc bấm nút loa trên cùng để đỡ tốn tiền.
        </SwitchRow>
        {autoRead && (
        <div className="mt-4 space-y-3">
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            App tự nghe giọng nam hay nữ để xưng hô đúng (nam: “anh… em”, nữ: “em… anh”) và đọc bằng giọng nam/nữ tương
            ứng. Muốn chỉnh tay: chạm vào tên người nói → chọn Nam / Nữ.
          </p>
          <SwitchRow
            on={readMine}
            onToggle={() => {
              writeStorage(READ_MINE_KEY, readMine ? "0" : "1");
              setReadMine(!readMine);
            }}
            icon={<ChatsIcon className="size-4" />}
            title="Đọc cả lời em cho người kia nghe"
          >
            Em nói xong một câu, app dịch sang tiếng của người kia và đọc to ra loa (micro tạm ngắt trong lúc đọc).
          </SwitchRow>
          <Disclosure title="Chọn giọng đọc">
            <div className="space-y-3">
              <VoicePicker id="tts-voice" label="Đọc cho em – người nói nữ" lang={pair.mine} storageKey={TTS_VOICE_KEY} gender="female" />
              <VoicePicker id="tts-voice-m" label="Đọc cho em – người nói nam" lang={pair.mine} storageKey={TTS_VOICE_MALE_KEY} gender="male" />
              {readMine && pair.partner !== AUTO && (
                <>
                  <VoicePicker id="partner-voice" label="Đọc cho người kia – em là nữ" lang={pair.partner} storageKey={PARTNER_VOICE_KEY} gender="female" />
                  <VoicePicker id="partner-voice-m" label="Đọc cho người kia – em là nam" lang={pair.partner} storageKey={PARTNER_VOICE_MALE_KEY} gender="male" />
                </>
              )}
            </div>
          </Disclosure>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["accurate", "Đọc sau mỗi câu", "Người kia nói hết câu mới đọc, dễ tập trung. Bản dịch chuẩn hơn."],
              ["live", "Đọc ngay khi đang nói", "Đọc từng vế lúc người kia còn nói. Nhanh nhất nhưng dễ phân tâm."],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setReadMode(value);
                writeStorage(READ_MODE_KEY, value);
              }}
              className={`rounded-2xl p-3 text-left ring-1 transition-colors ${
                readMode === value ? "bg-accent-soft ring-accent/50" : "bg-surface-2 ring-line"
              }`}
            >
              <span className="block text-[14px] font-semibold">{title}</span>
              <span className="mt-1 block text-[12px] leading-snug text-fg-2">{desc}</span>
            </button>
          ))}
        </div>
        </div>
        )}
      </motion.section>

      <motion.h3 variants={item} className="pt-2 text-[12px] font-bold tracking-[0.08em] text-fg-3 uppercase">
        Hiển thị
      </motion.h3>

      <motion.section variants={item}>
        <Label icon={<ScriptIcon className="size-4" />}>Kiểu hiển thị lời thoại</Label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["lines", "Dòng thoại", "Thoáng, chữ to toàn màn hình, dễ đọc khi nhiều người nói"],
              ["bubbles", "Bong bóng", "Kiểu tin nhắn chat, trái/phải theo người nói"],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              onClick={() => {
                setView(value);
                writeStorage(VIEW_KEY, value);
              }}
              className={`rounded-2xl p-3 text-left ring-1 transition-colors ${
                view === value ? "bg-accent-soft ring-accent/50" : "bg-surface-2 ring-line"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                {value === "lines" ? <ScriptIcon className="size-4 text-accent" /> : <ChatsIcon className="size-4 text-accent" />}
                {title}
              </span>
              <span className="mt-1 block text-[12px] leading-snug text-fg-2">{desc}</span>
            </button>
          ))}
        </div>
      </motion.section>

      <motion.section variants={item}>
        <Label icon={theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}>Giao diện</Label>
        <div className="mt-3 grid grid-cols-2 rounded-2xl bg-surface-2 p-1 ring-1 ring-line">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={(e) => changeTheme(t, e)}
              className={`relative h-11 rounded-xl text-[14px] font-medium transition-colors ${theme === t ? "text-fg" : "text-fg-2"}`}
            >
              {theme === t && (
                <motion.span
                  layoutId="theme-pill"
                  className="absolute inset-0 rounded-xl bg-surface shadow-sm ring-1 ring-line"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                {t === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
                {t === "dark" ? "Mực (tối)" : "Giấy (sáng)"}
              </span>
            </button>
          ))}
        </div>
      </motion.section>

      {pair.partner === "zh" && (
      <motion.section variants={item}>
        <SwitchRow
          on={pinyin}
          onToggle={() => {
            writeStorage(PINYIN_KEY, pinyin ? "0" : "1");
            if (!pinyin) void loadPinyin();
            setPinyin(!pinyin);
          }}
          icon={<PinyinIcon className="size-4" />}
          title="Hiện phiên âm pinyin"
        >
          Hiện cách đọc pinyin ngay dưới câu tiếng Trung, để em đọc theo hoặc tập nói. Chạy ngay trên máy, không tốn tiền.
        </SwitchRow>
      </motion.section>
      )}

      <motion.section variants={item}>
        <Disclosure title="Nâng cao" hint="Tên riêng, bối cảnh, tên của em, dịch lại chuẩn nghĩa, tự tạm dừng, chế độ nghe">
          <div className="space-y-6">
      <section>
        <Label htmlFor="glossary" icon={<LanguagesIcon className="size-4" />}>
          Tên riêng &amp; từ chuyên môn
        </Label>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Gõ tên người, tên công ty, địa danh, từ chuyên môn… mỗi dòng một từ để app nghe và dịch đúng hơn. Muốn luôn dịch một
          từ theo cách của mình thì viết thêm dấu bằng, ví dụ <b className="font-zh">王总 = Sếp Vương</b> hoặc <b>Mike = anh Mike</b>.
        </p>
        <textarea
          id="glossary"
          rows={5}
          value={glossary}
          onChange={(e) => {
            setGlossary(e.target.value);
            writeStorage(GLOSSARY_KEY, e.target.value);
          }}
          placeholder={"王总 = Sếp Vương\nMike = anh Mike\nSeoul"}
          className="mt-3 w-full resize-none rounded-2xl bg-surface-2 p-3.5 text-[16px] leading-relaxed ring-1 ring-line transition-shadow outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent"
        />
        {running && (
          <p className="mt-2 text-[13px] text-fg-2">Sẽ áp dụng từ lần bấm nghe tiếp theo.</p>
        )}
      </section>

      <section>
        <Label htmlFor="meeting-context" icon={<FileTextIcon className="size-4" />}>
          Bối cảnh cuộc trò chuyện
        </Label>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Vài dòng về cuộc trò chuyện hôm nay (không bắt buộc): nói với ai, về chuyện gì. App sẽ nghe đúng từ hơn, tóm tắt và
          gợi ý sát chủ đề hơn.
        </p>
        <textarea
          id="meeting-context"
          rows={3}
          value={meetingContext}
          onChange={(e) => {
            setMeetingContext(e.target.value);
            writeStorage(MEETING_CONTEXT_KEY, e.target.value);
          }}
          placeholder="Vd: Nói chuyện với bạn trai người Hàn về kế hoạch đi du lịch Đà Nẵng."
          className="mt-3 w-full resize-none rounded-2xl bg-surface-2 p-3.5 text-[16px] leading-relaxed ring-1 ring-line transition-shadow outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent"
        />
      </section>

      <section>
        <Label htmlFor="my-names" icon={<BellRingIcon className="size-4" />}>
          Tên của em (báo khi có người gọi)
        </Label>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Cách mọi người hay gọi em, cách nhau bằng dấu phẩy. Khi có người nhắc tới, máy sẽ rung và hiện thông báo.
        </p>
        <input
          id="my-names"
          value={myNames}
          onChange={(e) => {
            setMyNames(e.target.value);
            writeStorage(MY_NAMES_KEY, e.target.value);
          }}
          placeholder="Vd: Lan, 小兰, Lan-ssi"
          className="mt-3 h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px] ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent"
        />
      </section>

      <section>
        <SwitchRow
          on={refine}
          onToggle={() => {
            writeStorage(REFINE_KEY, refine ? "0" : "1");
            setRefine(!refine);
          }}
          icon={<TargetIcon className="size-4" />}
          title="Dịch lại chuẩn nghĩa bản địa"
        >
          Sau bản dịch nhanh, AI dịch lại từng câu theo đúng ý người bản xứ (thành ngữ, tiếng lóng, cách nói đời thường), kèm
          giải thích nghĩa. Dùng gói AI miễn phí, có giới hạn mỗi ngày.
        </SwitchRow>
      </section>

      <section>
        <Label icon={<PauseIcon className="size-4" />}>Tự tạm dừng khi im lặng</Label>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
          Soniox tính tiền cả lúc im lặng. Im lặng quá lâu thì app tạm ngừng để tiết kiệm, có người nói là tự nghe tiếp.
        </p>
        <div className="mt-3 grid grid-cols-4 rounded-2xl bg-surface-2 p-1 ring-1 ring-line">
          {(
            [
              ["0", "Tắt"],
              ["3", "3 phút"],
              ["5", "5 phút"],
              ["10", "10 phút"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setAutoPause(value);
                writeStorage(AUTO_PAUSE_KEY, value);
              }}
              className={`relative h-10 rounded-xl text-[14px] font-medium transition-colors ${autoPause === value ? "text-fg" : "text-fg-2"}`}
            >
              {autoPause === value && (
                <motion.span
                  layoutId="autopause-pill"
                  className="absolute inset-0 rounded-xl bg-surface shadow-sm ring-1 ring-line"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Label icon={<WaveIcon className="size-4" />}>Chế độ nghe</Label>
        <div className="mt-3 space-y-2">
          {(
            [
              ["soniox", "Chính xác", "Thường nghe chính xác hơn, phân biệt từng người nói. Khoảng 3.000đ mỗi giờ nghe."],
              ["browser", "Tiết kiệm (thử nghiệm)", "Dùng nhận giọng có sẵn của điện thoại, gần như miễn phí. Chỉ nghe được một thứ tiếng, không phân biệt người nói, có thể kém chính xác hơn."],
            ] as const
          ).map(([value, title, desc]) => (
            <button
              key={value}
              onClick={() => changeEngine(value)}
              className={`relative w-full rounded-2xl p-3.5 text-left ring-1 transition-colors ${
                engine === value ? "bg-accent-soft ring-accent/50" : "bg-surface-2 ring-line"
              }`}
            >
              <span className="flex items-center gap-2 text-[15px] font-medium">
                <span className={`grid size-4 place-items-center rounded-full ring-2 ${engine === value ? "ring-accent" : "ring-fg-3"}`}>
                  {engine === value && (
                    <motion.span layoutId="engine-dot" className="size-2 rounded-full bg-accent" />
                  )}
                </span>
                {title}
              </span>
              <span className="mt-1 block pl-6 text-[13px] leading-relaxed text-fg-2">{desc}</span>
            </button>
          ))}
        </div>
        {running && <p className="mt-2 text-[13px] text-fg-2">Sẽ áp dụng từ lần bấm nghe tiếp theo.</p>}
      </section>

          </div>
        </Disclosure>
      </motion.section>

      <motion.div variants={item}>
        <motion.button
          onClick={onDone}
          whileTap={{ scale: 0.97 }}
          className="btn-primary h-12 w-full rounded-2xl font-semibold text-on-accent"
        >
          Xong
        </motion.button>
        <Credit className="mt-5" />
      </motion.div>
    </motion.div>
  );
}
