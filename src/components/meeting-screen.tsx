"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLiveTranslator, type Engine, type LiveState, type Signal } from "@/lib/meeting/use-live-translator";
import { endsSentence, type Segment } from "@/lib/soniox/segments";
import {
  AUTO_PAUSE_KEY,
  AUTO_READ_KEY,
  ENGINE_KEY,
  GLOSSARY_KEY,
  MEETING_CONTEXT_KEY,
  MY_NAMES_KEY,
  PINYIN_KEY,
  readStorage,
  PARTNER_VOICE_KEY,
  PARTNER_VOICE_MALE_KEY,
  READ_MINE_KEY,
  READ_MODE_KEY,
  REFINE_KEY,
  TTS_VOICE_KEY,
  TTS_VOICE_MALE_KEY,
  VIEW_KEY,
  writeStorage,
} from "@/lib/browser/storage";
import { TranscriptItem, type TranscriptView } from "./transcript-item";
import { archiveCurrent, clearCurrent, loadCurrent, newMeetingId, saveCurrent, type SavedMeeting } from "@/lib/meeting/storage";
import { mentions, parseNames } from "@/lib/meeting/highlights";
import { usePinyinReady } from "@/lib/pinyin";
import { downloadMarkdown, shareMeeting } from "@/lib/meeting/export";
import dynamic from "next/dynamic";

// Các bảng phụ chỉ tải khi mở lần đầu → app mở nhanh hơn khi mạng yếu.
const AssistantPanel = dynamic(() => import("./assistant-panel").then((m) => m.AssistantPanel));
const HistoryScreen = dynamic(() => import("./history-screen").then((m) => m.HistoryScreen));
const SettingsPanel = dynamic(() => import("./settings-panel").then((m) => m.SettingsPanel));
import { getTtsPlayer } from "@/lib/browser/tts-player";
import { fixPronouns } from "@/lib/pronouns";
import { getConversationType, pronounStyle } from "@/lib/conversation";
import { voiceFor } from "@/lib/voices";
import type { Gender } from "@/lib/audio/pitch";
import { AUTO, getLangPair, langName } from "@/lib/languages";
import { copyText } from "@/lib/browser/clipboard";
import { isMine } from "./bubble";
import { MicButton } from "./mic-button";
import { LiveWave } from "./live-wave";
import { Seal } from "./brand";
import { Hero } from "./hero";
import { SignalBars, signalLabel } from "./signal-bars";
import { BRAND } from "@/lib/brand";
import { Sheet } from "./sheet";
import { SummaryPanel, useSummary } from "./summary-panel";
import { countSpoken, partnerOf, type SpeakerNames } from "@/lib/meeting/summary";
import { useToast } from "./toast";
import {
  ArrowDownIcon,
  BellRingIcon,
  ClockIcon,
  LightbulbIcon,
  PauseIcon,
  PlusIcon,
  SettingsIcon,
  NotebookIcon,
  SpeakerIcon,
  SpeakerOffIcon,
} from "./icons";

const spring = { type: "spring", stiffness: 320, damping: 30 } as const;

/** Đọc sau mỗi câu: đợi bản AI dịch chuẩn tối đa chừng này (ms) kể từ lúc hết câu, quá thì đọc bản dịch nhanh. */
const REFINE_WAIT_MS = 1500;

/** Tiến độ tự đọc của một câu: đã gửi đọc tới đâu (theo bản dịch nhanh). */
type ReadState = { sent: string; done: boolean; since: number; last?: string; seg?: Segment };

/** Bản dịch dùng để đọc theo lời đang nói: bản dịch nhanh của Soniox (đã được AI dịch lại thì lấy bản nháp cũ). */
function readSource(seg: Segment) {
  return (seg.refined ? (seg.draft ?? "") : seg.translationFinal).trimStart();
}

/** Vị trí ngay sau dấu kết thúc vế cuối cùng (phẩy, chấm, hỏi…) trong đoạn chưa đọc; 0 nếu chưa có. */
function lastClauseEnd(text: string) {
  let end = 0;
  for (const m of text.matchAll(/[,.!?;:…](?!\d)["'”’)]*/g)) {
    const at = m.index + m[0].length;
    // Bỏ vế quá ngắn ("Vâng,") để đọc cho liền mạch.
    if (text.slice(0, at).trim().length >= 6) end = at;
  }
  return end;
}

// Mã riêng cho mỗi object câu (câu được sửa → object mới → mã mới). Dùng để biết có cần lưu lại không.
const keys = new WeakMap<object, number>();
let nextKey = 1;
function objectKey(o: object) {
  let k = keys.get(o);
  if (!k) keys.set(o, (k = nextKey++));
  return k;
}

export function MeetingScreen() {
  // Màn hình này chỉ chạy trong trình duyệt (xem app-root.tsx) nên đọc localStorage ngay được.
  const [{ saved, meeting }] = useState(() => {
    const saved = loadCurrent();
    return { saved, meeting: { id: saved?.id ?? newMeetingId(), startedAt: saved?.startedAt ?? Date.now() } };
  });
  const [meetingInfo, setMeetingInfo] = useState(meeting);
  const getGlossary = useCallback(() => readStorage(GLOSSARY_KEY), []);
  const getEngine = useCallback((): Engine => (readStorage(ENGINE_KEY) === "browser" ? "browser" : "soniox"), []);
  const getMeetingContext = useCallback(() => readStorage(MEETING_CONTEXT_KEY), []);
  const getAutoPauseMs = useCallback(() => Number(readStorage(AUTO_PAUSE_KEY, "3")) * 60_000, []);
  const getRefine = useCallback(() => readStorage(REFINE_KEY, "1") !== "0", []);
  // Giới tính người dùng tự chọn cho từng người nói (lưu cùng cuộc họp); không chọn thì app tự đoán theo giọng.
  const [genderOverrides, setGenderOverrides] = useState<Record<string, Gender>>(() => saved?.genders ?? {});
  const genderOverridesRef = useRef(genderOverrides);
  useEffect(() => {
    genderOverridesRef.current = genderOverrides;
  }, [genderOverrides]);
  const getGenderOverride = useCallback((speaker?: string) => (speaker ? genderOverridesRef.current[speaker] : undefined), []);
  const live = useLiveTranslator({
    getGenderOverride,
    getGlossary,
    getEngine,
    getMeetingContext,
    getAutoPauseMs,
    getRefine,
    initialSegments: saved?.segments,
  });
  const { segments, state, setMuted, dropSegment, genders: autoGenders, liveGender } = live;
  /** Giới tính người nói của một câu: người dùng chọn > đo theo giọng của chính câu đó > theo người nói. */
  const genderOf = useCallback(
    (seg: Segment): Gender | undefined =>
      (seg.speaker ? genderOverrides[seg.speaker] : undefined) ??
      seg.gender ??
      liveGender(seg) ??
      (seg.speaker ? autoGenders[seg.speaker] : undefined),
    [genderOverrides, autoGenders, liveGender],
  );
  /** Giọng đọc theo thứ tiếng + giới tính người nói (giọng người dùng đã chọn trong Cài đặt). */
  const pickVoice = useCallback((lang: string, gender?: Gender) => {
    const mineLang = lang === getLangPair().mine;
    const key = gender === "male" ? (mineLang ? TTS_VOICE_MALE_KEY : PARTNER_VOICE_MALE_KEY) : mineLang ? TTS_VOICE_KEY : PARTNER_VOICE_KEY;
    return voiceFor(lang, gender, readStorage(key));
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const { toast, dismiss } = useToast();
  const setToast = useCallback((message: string) => toast({ kind: "warning", message }), [toast]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Tên của người dùng để báo khi sếp nhắc tới (đọc lại mỗi khi đóng Cài đặt).
  const [myNames, setMyNames] = useState(() => parseNames(readStorage(MY_NAMES_KEY)));
  const [view, setView] = useState<TranscriptView>(() => (readStorage(VIEW_KEY) === "bubbles" ? "bubbles" : "lines"));
  const [pinyinOn, setPinyinOn] = useState(() => readStorage(PINYIN_KEY, "1") !== "0");
  // Cặp ngôn ngữ đổi trong Cài đặt → vẽ lại (dòng trạng thái, màn hình chờ…).
  const [, setPair] = useState(getLangPair);
  // Tự đọc to bản dịch khi đối tác nói xong (nút loa trên thanh trên, tắt/bật trong Cài đặt).
  const [autoRead, setAutoRead] = useState(() => readStorage(AUTO_READ_KEY, "1") !== "0");
  const [reading, setReading] = useState(false);
  useEffect(() => {
    const player = getTtsPlayer();
    player.onChange = setReading;
    return () => {
      player.onChange = undefined;
    };
  }, []);
  // Thư viện pinyin chỉ tải khi bật; đến lúc tải xong mới vẽ lại để hiện phiên âm.
  const pinyin = usePinyinReady(pinyinOn);
  // Tên người nói do người dùng đặt ("1" → "Sếp Vương"), lưu cùng cuộc họp.
  const [names, setNames] = useState<SpeakerNames>(() => saved?.speakers ?? {});
  const [renaming, setRenaming] = useState<string | null>(null);
  const summaryApi = useSummary(saved?.summary);
  const { summary } = summaryApi;

  // Giá trị mới nhất cho các hẹn giờ / lưu nền (đọc trong effect, không gây render lại).
  const latestRef = useRef({ segments, names, summaryApi, running: false });
  useEffect(() => {
    latestRef.current = { segments, names, summaryApi, running: state !== "idle" };
  });

  // Chỉ các câu đã chốt mới cần lưu. "Chữ ký" = mã của từng câu đã chốt (câu bị sửa sẽ là object mới
  // → mã mới); chữ ký không đổi thì không ghi lại cả cuộc họp mỗi khi có chữ mới của câu đang nói.
  const closedSig = useMemo(
    () =>
      segments
        .filter((x) => x.closed)
        .map(objectKey)
        .join(","),
    [segments],
  );

  // Tự lưu vào localStorage: gộp thay đổi ~1,5 giây một lần, ghi lúc máy rảnh để không giật.
  const saveFailedRef = useRef(false);
  useEffect(() => {
    if (!closedSig) return;
    const save = () => {
      const ok = saveCurrent({
        ...meetingInfo,
        updatedAt: Date.now(),
        segments: latestRef.current.segments.filter((x) => x.closed),
        speakers: names,
        genders: genderOverrides,
        summary: summary.vi
          ? {
              vi: summary.vi,
              zh: summary.zh,
              zhLang: summary.zhLang,
              at: summary.at,
              count: summary.count,
              inProgress: summary.inProgress,
              coveredId: summary.coveredId,
            }
          : undefined,
      });
      if (!ok && !saveFailedRef.current) {
        saveFailedRef.current = true;
        setToast("Bộ nhớ trình duyệt đầy, không lưu được nội dung");
      }
    };
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(cb, { timeout: 2000 })
        : window.setTimeout(cb, 0);
    const t = setTimeout(() => idle(save), 1500);
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pagehide", save);
    };
  }, [closedSig, summary, names, genderOverrides, setToast, meetingInfo]);

  // Đang nghe → báo cho CSS dừng các hoạt ảnh nền (dành sức cho sóng âm và chữ).
  useEffect(() => {
    const root = document.documentElement;
    if (state === "live" || state === "starting" || state === "reconnecting") root.dataset.live = "1";
    else delete root.dataset.live;
    return () => {
      delete root.dataset.live;
    };
  }, [state]);

  /** Cuộc họp hiện tại dưới dạng đã lưu (cho màn hình Lịch sử và chia sẻ biên bản). */
  const currentMeeting = useMemo<SavedMeeting>(
    () => ({
      ...meetingInfo,
      updatedAt: segments[segments.length - 1]?.at ?? meetingInfo.startedAt,
      segments,
      speakers: names,
      genders: genderOverrides,
      summary: summary.vi
        ? {
            vi: summary.vi,
            zh: summary.zh,
            zhLang: summary.zhLang,
            at: summary.at,
            count: summary.count,
            inProgress: summary.inProgress,
          }
        : undefined,
    }),
    [meetingInfo, segments, names, genderOverrides, summary],
  );

  const shareCurrent = useCallback(async () => {
    const result = await shareMeeting(currentMeeting);
    if (result === "unsupported") {
      downloadMarkdown(currentMeeting);
      toast({ kind: "success", message: "Máy chưa hỗ trợ chia sẻ, đã tải file nội dung về máy" });
    }
  }, [currentMeeting, toast]);

  // ---- Báo khi sếp nhắc tên em (mỗi câu chỉ báo một lần) ----
  // Khoá theo id + độ dài câu: câu được ghép thêm mảnh mới thì kiểm tra lại.
  const checkedRef = useRef<Set<string> | null>(null);
  const checkKey = (x: Segment) => `${x.id}:${x.originalFinal.length}`;
  useEffect(() => {
    // Lần đầu: các câu đã lưu từ trước coi như đã kiểm tra, không báo lại.
    if (!checkedRef.current) {
      checkedRef.current = new Set(segments.filter((x) => x.closed).map(checkKey));
      return;
    }
    for (const seg of segments) {
      if (!seg.closed || seg.pendingTranslation || seg.refining || checkedRef.current.has(checkKey(seg))) continue;
      checkedRef.current.add(checkKey(seg));
      if (isMine(seg) || !mentions(`${seg.originalFinal} ${seg.translationFinal}`, myNames)) continue;
      navigator.vibrate?.([180, 80, 180]);
      toast({
        id: `mention-${seg.id}`,
        kind: "info",
        title: "Có người vừa nhắc tên em",
        icon: <BellRingIcon className="size-[18px]" />,
        message: seg.translationFinal || seg.originalFinal,
        duration: 7000,
        action: {
          label: "Xem",
          onClick: () => document.getElementById(`seg-${seg.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
        },
      });
    }
  }, [segments, myNames, toast]);

  // Tạm ngắt micro trong lúc máy đọc to cho đối tác nghe (nhiều câu chồng nhau thì đếm, hết mới mở lại).
  const muteCountRef = useRef(0);
  const muteWhile = useCallback(() => {
    let on = false;
    return {
      onStart: () => {
        if (on) return;
        on = true;
        if (++muteCountRef.current === 1) setMuted(true);
      },
      onEnd: () => {
        if (!on) return;
        on = false;
        if (--muteCountRef.current === 0) setMuted(false);
      },
    };
  }, [setMuted]);

  // ---- Tự đọc to bản dịch cả hai chiều ----
  // - "accurate" (mặc định): người kia nói HẾT CÂU mới đọc (dễ tập trung); đợi bản AI dịch chuẩn tối đa ~1,5 giây,
  //   quá thì đọc bản dịch nhanh (đã sửa xưng hô).
  // - "live": đọc từng vế ngay khi người kia đang nói → nhanh nhất nhưng dễ phân tâm.
  // - "live" (mặc định): đọc từng vế ngay khi bản dịch vế đó về, như phiên dịch viên nói nối → nhanh nhất.
  // - "accurate": đợi hết câu và bản AI dịch lại (đúng thành ngữ hơn) rồi mới đọc → chậm hơn ~2 giây.
  // - Câu micro nghe lại chính giọng máy đọc (không đeo tai nghe) → bỏ đi, không ghi thành lời thoại.
  const readRef = useRef<Map<number, ReadState> | null>(null);
  const [readTick, setReadTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    if (!readRef.current) {
      readRef.current = new Map(segments.map((x) => [x.id, { sent: readSource(x), done: true, since: 0 }]));
      return;
    }
    const states = readRef.current;
    const player = getTtsPlayer();
    const { mine } = getLangPair();
    const active = autoRead && state !== "idle";
    const liveMode = readStorage(READ_MODE_KEY, "accurate") === "live";
    // Lời đối tác đọc cho em: xưng hô và giọng đọc theo giới tính người nói.
    const say = (text: string, seg: Segment) => {
      const g = genderOf(seg);
      player.enqueue({ text: fixPronouns(text, g, style), lang: mine, voice: pickVoice(mine, g), live: true });
    };
    const readMine = readStorage(READ_MINE_KEY, "1") !== "0";
    const partnerLang = partnerOf(segments);
    const style = pronounStyle(getConversationType());
    let recheck = 0;

    // Mảnh câu vừa bị ghép vào câu trước (không còn trong danh sách) → đọc nốt phần chưa đọc.
    const present = new Set(segments.map((x) => x.id));
    for (const [id, st] of states) {
      if (present.has(id)) continue;
      if (active && liveMode && !st.done && st.last && st.seg) say(st.last.slice(st.sent.length), st.seg);
      states.delete(id);
    }

    for (const seg of segments) {
      let st = states.get(seg.id);
      if (st?.done) continue;
      if (seg.closed && player.isEcho(seg.originalFinal)) {
        states.set(seg.id, { sent: "", done: true, since: 0 });
        dropSegment(seg.id);
        continue;
      }
      if (isMine(seg)) {
        // Lời mình: nói xong câu (Soniox đã dịch sang tiếng đối tác) thì đọc to cho đối tác nghe,
        // tạm ngắt micro trong lúc đọc để máy không nghe lại chính nó.
        if (!seg.closed) continue;
        const text = seg.translationFinal.trim();
        const age = now - (seg.closedAt ?? now);
        if (!text && age < 4000) {
          recheck = Math.max(recheck, 500);
          continue;
        }
        states.set(seg.id, { sent: seg.translationFinal, done: true, since: 0 });
        if (active && readMine && text && age < 20_000)
          player.enqueue({ text, lang: partnerLang, voice: pickVoice(partnerLang, genderOf(seg)), ...muteWhile() });
        continue;
      }
      if (!active) {
        if (seg.closed) states.set(seg.id, { sent: readSource(seg), done: true, since: 0 });
        continue;
      }
      // Tiếng máy vừa đọc lọt vào micro (đang nghe dở) → không đọc lại.
      if (!seg.closed && player.isEcho(seg.originalFinal + seg.originalPartial)) continue;
      if (!st) {
        st = { sent: "", done: false, since: 0 };
        states.set(seg.id, st);
      }
      const age = seg.closed ? now - (seg.closedAt ?? now) : 0;

      if (!liveMode) {
        // Đọc sau mỗi câu: câu chưa hết ý thì đợi thêm chút (có thể được ghép tiếp); đợi bản AI dịch chuẩn tối đa 1,5 giây.
        if (!seg.closed) continue;
        if (!endsSentence(seg.originalFinal) && age < 1200) {
          recheck = Math.max(recheck, 1200 - age);
          continue;
        }
        if ((seg.refining || seg.pendingTranslation) && age < REFINE_WAIT_MS) {
          recheck = Math.max(recheck, REFINE_WAIT_MS - age);
          continue;
        }
        st.done = true;
        if (age < 20_000) say(seg.translationFinal, seg);
        continue;
      }

      // Đọc từng vế theo bản dịch nhanh (không đợi AI dịch lại).
      const source = readSource(seg);
      st.last = source;
      st.seg = seg;
      if (!source.startsWith(st.sent)) st.sent = source.length < st.sent.length ? source : st.sent;
      const fresh = source.slice(st.sent.length);
      if (seg.closed) {
        if (fresh.trim()) say(fresh, seg);
        st.sent = source;
        // Bản dịch của câu vừa tự cắt có thể về trễ một chút → theo dõi thêm vài giây.
        if (age > 4500) st.done = true;
        else recheck = Math.max(recheck, 4600 - age);
        continue;
      }
      const cut = lastClauseEnd(fresh);
      if (cut > 0) {
        say(fresh.slice(0, cut), seg);
        st.sent += fresh.slice(0, cut);
        st.since = 0;
      } else if (fresh.trim().length >= 12) {
        // Vế dài chưa có dấu câu: đợi tối đa 1,5 giây rồi đọc tới chữ trọn vẹn cuối cùng.
        st.since ||= now;
        const waited = now - st.since;
        const space = fresh.lastIndexOf(" ");
        if (waited >= 1500 && space > 0) {
          say(fresh.slice(0, space), seg);
          st.sent += fresh.slice(0, space + 1);
          st.since = 0;
        } else recheck = Math.max(recheck, 1550 - waited);
      }
    }
    if (!recheck) return;
    const t = setTimeout(() => setReadTick((n) => n + 1), recheck + 50);
    return () => clearTimeout(t);
  }, [segments, autoRead, state, dropSegment, readTick, muteWhile, genderOf, pickVoice]);

  // Câu đang nghe dở mà là tiếng máy đọc lọt vào micro → không hiện (sẽ bị bỏ khi chốt).
  const shown = useMemo(
    () => segments.filter((x) => x.closed || !getTtsPlayer().isEcho(x.originalFinal + x.originalPartial)),
    [segments],
  );
  const hasContent = segments.length > 0;
  const running = state !== "idle";
  const showHero = !running && !hasContent;

  // ---- Tự cuộn xuống câu mới, trừ khi người dùng đang cuộn lên đọc lại ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom !== pinnedRef.current) {
      pinnedRef.current = atBottom;
      setPinned(atBottom);
    }
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [segments]);

  // Nội dung còn cao thêm sau khi render (hàng nút hiện ra, chữ xuống dòng…) → vẫn bám đáy nếu đang ở đáy.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const el = scrollRef.current;
    if (!list || !el) return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [showHero]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // ---- Trạng thái kết nối / lỗi → toast ----
  const { error: liveError, dismissError, resume, wake } = live;
  useEffect(() => {
    if (!liveError) return dismiss("live-error");
    toast({ id: "live-error", kind: "error", message: liveError, duration: 9000, onClose: dismissError });
  }, [liveError, toast, dismiss, dismissError]);

  const prevStateRef = useRef(state);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (state === "reconnecting") {
      toast({
        id: "conn",
        kind: "loading",
        title: "Mạng chập chờn, đang tự kết nối lại…",
        message: "Nội dung đã có vẫn được giữ nguyên.",
        duration: null,
      });
    } else {
      dismiss("conn");
      if (prev === "reconnecting" && state === "live") {
        toast({ id: "conn-ok", kind: "success", message: "Đã kết nối lại, đang nghe tiếp", duration: 2200 });
      }
    }
    if (state === "paused") {
      toast({
        id: "pause",
        kind: "info",
        title: "Đã tạm dừng để tiết kiệm",
        icon: <PauseIcon className="size-[18px]" />,
        message: "Phòng im lặng lâu nên app ngừng tính tiền. Có người nói là tự nghe tiếp.",
        action: { label: "Nghe ngay", onClick: wake },
        duration: null,
      });
    } else {
      dismiss("pause");
      if (prev === "paused" && (state === "live" || state === "starting")) {
        toast({ id: "pause-ok", kind: "success", message: "Có tiếng nói, đang nghe tiếp", duration: 2200 });
      }
    }
    if (state === "interrupted") {
      toast({
        id: "mic",
        kind: "warning",
        title: "Micro vừa bị tạm ngắt",
        message: "Có cuộc gọi hoặc ứng dụng khác dùng micro.",
        action: { label: "Nghe tiếp", onClick: () => void resume() },
        duration: null,
      });
    } else {
      dismiss("mic");
    }
  }, [state, toast, dismiss, resume, wake]);

  // ---- Tự cập nhật tóm tắt mỗi 5 phút trong lúc họp (chạy nền, chỉ gửi phần mới) ----
  useEffect(() => {
    const t = setInterval(() => {
      const { segments: segs, names: nm, summaryApi: api, running: isRunning } = latestRef.current;
      const busy = api.summary.status === "loading" || api.summary.status === "streaming";
      if (!isRunning || busy) return;
      if (countSpoken(segs) - api.summary.count >= 8) void api.run(segs, true, nm, { silent: true });
    }, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  // ---- Đọc to khi bấm (tạm không nghe trong lúc máy đọc, tránh dịch lại chính giọng đọc) ----
  const speakingRef = useRef<number | null>(null);
  const speakAloud = useCallback(
    (text: string, lang: string, id: number | null, voice?: string) => {
      const mute = muteWhile();
      const done = () => {
        mute.onEnd();
        if (speakingRef.current !== id) return;
        speakingRef.current = null;
        setSpeakingId(null);
      };
      const player = getTtsPlayer();
      player.unlock();
      speakingRef.current = id;
      setSpeakingId(id);
      player.speakNow({
        text,
        lang,
        voice: voice ?? pickVoice(lang),
        onStart: mute.onStart,
        onEnd: done,
      });
    },
    [muteWhile, pickVoice],
  );

  const handleSpeak = useCallback(
    (seg: Segment) => {
      if (speakingRef.current === seg.id) {
        getTtsPlayer().stop();
        return;
      }
      // Câu của mình: đọc bản dịch bằng tiếng đối tác; câu của đối tác: đọc bản dịch tiếng của mình.
      const lang = isMine(seg) ? partnerOf(latestRef.current.segments) : getLangPair().mine;
      const g = genderOf(seg);
      const text = isMine(seg) ? seg.translationFinal : fixPronouns(seg.translationFinal, g, pronounStyle(getConversationType()));
      speakAloud(text, lang, seg.id, pickVoice(lang, g));
    },
    [speakAloud, genderOf, pickVoice],
  );

  // Đọc to câu gợi ý bằng tiếng của đối tác.
  const speakZh = useCallback(
    (text: string) => speakAloud(text, partnerOf(latestRef.current.segments), null),
    [speakAloud],
  );

  const handleCopy = useCallback(async (seg: Segment) => {
    const ok = await copyText(isMine(seg) ? seg.originalFinal : seg.translationFinal);
    if (!ok) setToast("Không chép được, thử lại nhé");
    return ok;
  }, [setToast]);

  const toggleMic = () => {
    // Lần chạm này mở khoá âm thanh để về sau app tự đọc được (iPhone bắt buộc); tắt tự đọc thì không kết nối dịch vụ đọc.
    getTtsPlayer().unlock(autoRead);
    if (running) live.stop();
    else void live.start();
  };

  const toggleAutoRead = () => {
    const next = !autoRead;
    setAutoRead(next);
    writeStorage(AUTO_READ_KEY, next ? "1" : "0");
    const player = getTtsPlayer();
    if (next) player.unlock();
    else player.stop();
    toast({
      id: "auto-read",
      kind: "info",
      icon: next ? <SpeakerIcon className="size-[18px]" /> : <SpeakerOffIcon className="size-[18px]" />,
      message: next ? "Đã bật tự đọc: app đọc to bản dịch cho cả hai bên" : "Đã tắt tự đọc – không tốn tiền giọng đọc",
      duration: 2600,
    });
  };

  // Mở bảng tóm tắt; nếu có câu mới từ lần trước thì tự tóm tắt lại.
  const openSummary = () => {
    setSummaryOpen(true);
    const { summary, run } = summaryApi;
    const busy = summary.status === "loading" || summary.status === "streaming";
    if (!busy && (summary.status === "idle" || summary.status === "error" || countSpoken(segments) > summary.count)) {
      void run(segments, running, names);
    }
  };

  /** Xoá hẳn cuộc họp hiện tại (không cất vào lịch sử). */
  const deleteCurrentMeeting = () => {
    getTtsPlayer().stop();
    clearCurrent();
    setMeetingInfo({ id: newMeetingId(), startedAt: Date.now() });
    checkedRef.current = new Set();
    readRef.current = new Map();
    live.reset();
    summaryApi.reset();
    setNames({});
    setGenderOverrides({});
  };

  const startNewMeeting = () => {
    getTtsPlayer().stop();
    archiveCurrent();
    setMeetingInfo({ id: newMeetingId(), startedAt: Date.now() });
    checkedRef.current = new Set();
    readRef.current = new Map();
    live.reset();
    summaryApi.reset();
    setNames({});
    setGenderOverrides({});
    setConfirmNew(false);
  };

  return (
    <motion.div
      className="flex h-dvh flex-col"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Thanh trên */}
      <header className="z-20 flex items-center gap-2.5 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:gap-3 sm:px-4">
        <motion.div whileTap={{ rotate: -12, scale: 0.9 }}>
          <Seal size={40} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] leading-tight font-semibold">{BRAND.appName}</div>
          <StatusLine state={state} hasContent={hasContent} signal={live.signal} />
        </div>
        <AnimatePresence>
          {!running && hasContent && (
            <HeaderButton key="new" label="Cuộc trò chuyện mới" onClick={() => setConfirmNew(true)}>
              <PlusIcon className="size-5" />
            </HeaderButton>
          )}
        </AnimatePresence>
        <HeaderButton label={autoRead ? "Tắt tự đọc bản dịch" : "Bật tự đọc bản dịch"} onClick={toggleAutoRead}>
          {autoRead ? (
            <motion.span
              className="grid place-items-center text-accent"
              animate={reading ? { scale: [1, 1.18, 1] } : { scale: 1 }}
              transition={reading ? { duration: 0.9, repeat: Infinity } : undefined}
            >
              <SpeakerIcon className="size-5" />
            </motion.span>
          ) : (
            <SpeakerOffIcon className="size-5 text-fg-3" />
          )}
        </HeaderButton>
        <HeaderButton label="Lịch sử trò chuyện" onClick={() => setHistoryOpen(true)}>
          <ClockIcon className="size-5" />
        </HeaderButton>
        <HeaderButton label="Cài đặt" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon className="size-5" />
        </HeaderButton>
      </header>


      {/* Nội dung */}
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="popLayout">
          {showHero ? (
            <Hero key="hero" state={state} onPress={toggleMic} />
          ) : (
            <motion.div
              key="list"
              ref={scrollRef}
              onScroll={onScroll}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="no-scrollbar absolute inset-0 overflow-y-auto overscroll-contain px-3 pt-2 pb-56"
            >
              <div ref={listRef} className={`mx-auto flex max-w-2xl flex-col ${view === "bubbles" ? "gap-3" : "pt-2"}`}>
                {shown.map((seg, i) => (
                  <TranscriptItem
                    view={view}
                    pinyin={pinyin}
                    latest={i === shown.length - 1}
                    key={seg.id}
                    seg={seg}
                    name={seg.speaker ? names[seg.speaker] : undefined}
                    continued={
                      !!seg.speaker &&
                      shown[i - 1]?.speaker === seg.speaker &&
                      isMine(shown[i - 1]) === isMine(seg)
                    }
                    onRename={setRenaming}
                    domId={`seg-${seg.id}`}
                    mentioned={!isMine(seg) && mentions(`${seg.originalFinal} ${seg.translationFinal}`, myNames)}
                    onToggleStar={live.toggleStar}
                    speaking={speakingId === seg.id}
                    onSpeak={handleSpeak}
                    onCopy={handleCopy}
                  />
                ))}
                {!hasContent && running && <ListeningHint />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nút "xuống câu mới nhất" khi đang cuộn lên đọc lại */}
        <AnimatePresence>
          {!showHero && !pinned && (
            <motion.button
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={spring}
              onClick={scrollToBottom}
              className="absolute bottom-40 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium shadow-[var(--shadow)] ring-1 ring-line"
            >
              <ArrowDownIcon className="size-4" /> Câu mới nhất
            </motion.button>
          )}
        </AnimatePresence>

        {/* Thanh dưới: nút micro */}
        {!showHero && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-gradient-to-t from-bg via-bg/90 to-transparent pt-10 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {/* Sóng âm realtime chạy ngang phía sau nút micro */}
            <div className="absolute inset-x-0 bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+0.5rem)]">
              <LiveWave analyser={live.analyser} level={live.level} active={state === "live"} height={150} />
            </div>
            <div className="pointer-events-auto relative grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center px-6">
              <div className="justify-self-start">
                <AnimatePresence>
                  {hasContent && <SummaryButton key="sum" onClick={openSummary} />}
                </AnimatePresence>
              </div>
              <MicButton state={state} level={live.level} analyser={live.analyser} size="dock" onPress={toggleMic} />
              <div className="justify-self-end">
                <AnimatePresence>
                  {hasContent && (
                    <DockAction key="sug" label="Trợ lý" aria="Trợ lý: gợi ý trả lời và hỏi về cuộc trò chuyện" onClick={() => setSuggestOpen(true)}>
                      <LightbulbIcon className="size-6" />
                    </DockAction>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="relative">
              <DockCaption state={state} startedAt={live.startedAt} />
            </div>
          </div>
        )}
      </div>

      <Sheet open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Tóm tắt" icon={<NotebookIcon className="size-[18px]" />}>
        <SummaryPanel api={summaryApi} segments={segments} running={running} names={names} onShare={shareCurrent} />
      </Sheet>

      <Sheet open={suggestOpen} onClose={() => setSuggestOpen(false)} title="Trợ lý" icon={<LightbulbIcon className="size-[18px]" />}>
        <AssistantPanel segments={segments} names={names} summary={summary.vi} onSpeakZh={speakZh} />
      </Sheet>

      <HistoryScreen
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        current={currentMeeting}
        view={view}
        running={running}
        onDeleteCurrent={deleteCurrentMeeting}
        speakingId={speakingId}
        onSpeak={handleSpeak}
        onCopy={handleCopy}
      />

      <Sheet open={renaming !== null} onClose={() => setRenaming(null)} title="Đặt tên người nói">
        {renaming !== null && (
          <RenameForm
            key={renaming}
            current={names[renaming] ?? ""}
            label={`Người ${renaming}`}
            gender={genderOverrides[renaming]}
            detected={autoGenders[renaming]}
            onSave={(name, gender) => {
              setNames((prev) => ({ ...prev, [renaming]: name.trim() }));
              setGenderOverrides((prev) => {
                const next = { ...prev };
                if (gender) next[renaming] = gender;
                else delete next[renaming];
                return next;
              });
              setRenaming(null);
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setMyNames(parseNames(readStorage(MY_NAMES_KEY)));
          setView(readStorage(VIEW_KEY) === "bubbles" ? "bubbles" : "lines");
          setPinyinOn(readStorage(PINYIN_KEY, "1") !== "0");
          setPair(getLangPair());
          setAutoRead(readStorage(AUTO_READ_KEY, "1") !== "0");
        }}
        title="Cài đặt"
      >
        <SettingsPanel
          running={running}
          onDone={() => {
            setSettingsOpen(false);
            setMyNames(parseNames(readStorage(MY_NAMES_KEY)));
            setView(readStorage(VIEW_KEY) === "bubbles" ? "bubbles" : "lines");
          setPinyinOn(readStorage(PINYIN_KEY, "1") !== "0");
          setPair(getLangPair());
          setAutoRead(readStorage(AUTO_READ_KEY, "1") !== "0");
          }}
        />
      </Sheet>

      <Sheet open={confirmNew} onClose={() => setConfirmNew(false)} title="Bắt đầu cuộc trò chuyện mới?">
        <p className="text-[15px] leading-relaxed text-fg-2">
          Cuộc trò chuyện hiện tại sẽ được cất vào lịch sử trong máy, màn hình sẽ trống để bắt đầu cuộc mới.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={() => setConfirmNew(false)} className="h-12 rounded-2xl bg-surface-2 font-medium">
            Huỷ
          </button>
          <button
            onClick={startNewMeeting}
            className="h-12 rounded-2xl bg-gradient-to-b from-accent to-accent-strong font-semibold text-on-accent"
          >
            Bắt đầu mới
          </button>
        </div>
      </Sheet>
    </motion.div>
  );
}

function RenameForm({
  current,
  label,
  gender: currentGender,
  detected,
  onSave,
}: {
  current: string;
  label: string;
  gender?: Gender;
  detected?: Gender;
  onSave: (name: string, gender?: Gender) => void;
}) {
  const [value, setValue] = useState(current);
  const [gender, setGender] = useState<Gender | undefined>(currentGender);
  const chips = ["Anh", "Chị", "Em", "Bạn", "Người yêu", "Sếp", "Đồng nghiệp"];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value, gender);
      }}
      className="space-y-4 pb-2"
    >
      <p className="text-[14px] text-fg-2">
        Máy tự đánh số <b className="text-fg">{label}</b>. Đặt tên để dễ nhìn hơn, tóm tắt và gợi ý cũng sẽ dùng tên này.
      </p>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Vd: Anh Minh, Chị Lan, Sếp Vương"
        className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px] ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent"
      />
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <motion.button
            key={c}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => setValue((v) => (["Anh", "Chị", "Sếp"].includes(c) && v && !v.startsWith(c) ? `${c} ${v}` : c))}
            className="rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-medium ring-1 ring-line"
          >
            {c}
          </motion.button>
        ))}
      </div>
      <div>
        <p className="text-[13px] font-medium text-fg-2">Giọng nam hay nữ? (để dịch đúng xưng hô anh / em và chọn giọng đọc)</p>
        <div className="mt-2 grid grid-cols-3 rounded-2xl bg-surface-2 p-1 ring-1 ring-line">
          {(
            [
              [undefined, detected ? `Tự nhận (${detected === "male" ? "nam" : "nữ"})` : "Tự nhận"],
              ["male", "Nam"],
              ["female", "Nữ"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={text}
              type="button"
              onClick={() => setGender(value)}
              className={`relative h-10 rounded-xl text-[13.5px] font-medium transition-colors ${gender === value ? "text-fg" : "text-fg-2"}`}
            >
              {gender === value && (
                <motion.span
                  layoutId="gender-pill"
                  className="absolute inset-0 rounded-xl bg-surface shadow-sm ring-1 ring-line"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{text}</span>
            </button>
          ))}
        </div>
      </div>
      <button type="submit" className="btn-primary h-12 w-full rounded-2xl font-semibold text-on-accent">
        Lưu
      </button>
      <p className="text-[12px] text-fg-3">Lưu ý: nếu mất kết nối rồi nối lại, máy có thể đánh số lại người nói.</p>
    </form>
  );
}

function DockAction({
  label,
  aria,
  onClick,
  children,
}: {
  label: string;
  aria: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.5, x: -20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.5 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 380, damping: 20 }}
      className="flex flex-col items-center gap-1"
      aria-label={aria}
    >
      <span className="relative grid size-14 place-items-center overflow-hidden rounded-[22px] bg-surface text-accent shadow-[var(--shadow)] ring-1 ring-accent/30">
        {children}
      </span>
      <span className="text-[12px] font-semibold text-fg-2">{label}</span>
    </motion.button>
  );
}

function SummaryButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.5, x: 20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.5 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 380, damping: 20 }}
      className="flex flex-col items-center gap-1"
      aria-label="Tóm tắt cuộc trò chuyện"
    >
      <span className="relative grid size-14 place-items-center overflow-hidden rounded-[22px] bg-surface text-accent shadow-[var(--shadow)] ring-1 ring-accent/30">
        <NotebookIcon className="size-6" />
      </span>
      <span className="text-[12px] font-semibold text-fg-2">Tóm tắt</span>
    </motion.button>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileTap={{ scale: 0.88 }}
      className="grid size-10 place-items-center rounded-full bg-surface text-fg-2 ring-1 ring-line"
    >
      {children}
    </motion.button>
  );
}

const STATUS_TEXT: Record<LiveState, string> = {
  idle: "",
  starting: "Đang kết nối…",
  live: "Đang nghe",
  reconnecting: "Đang kết nối lại…",
  interrupted: "Tạm ngừng",
  paused: "Tạm dừng · phòng im lặng",
};

/** "Trung → Việt", "Anh → Việt", "Mọi thứ tiếng → Việt"… */
function pairLabel() {
  const { partner, mine } = getLangPair();
  const short = (code: string) => langName(code).replace(/^Tiếng /, "");
  return `${partner === AUTO ? "Mọi thứ tiếng" : short(partner)} → ${short(mine)}`;
}

function StatusLine({
  state,
  hasContent,
  signal,
}: {
  state: LiveState;
  hasContent: boolean;
  signal: Signal;
}) {
  const running = state !== "idle";
  const text =
    state === "idle"
      ? hasContent
        ? "Đã dừng"
        : pairLabel()
      : state === "live"
        ? `Đang nghe · ${signalLabel(signal)}`
        : STATUS_TEXT[state];
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg-2">
      {running && <SignalBars signal={state === "live" ? signal : "offline"} />}
      {state === "live" && (
        <span className="relative flex size-2">
          <motion.span
            className="absolute inset-0 rounded-full bg-accent"
            animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <span className="relative size-2 rounded-full bg-accent" />
        </span>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={text}
          className="truncate"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function ListeningHint() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center py-24 text-center"
    >
      <div className="flex h-8 items-end gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 rounded-full bg-accent"
            animate={{ height: [8, 28, 8] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
          />
        ))}
      </div>
      <p className="mt-5 text-[17px] font-medium">Đang nghe…</p>
      <p className="mt-1 text-[14px] text-fg-2">Cứ nói bình thường, chữ sẽ tự hiện ra ở đây.</p>
    </motion.div>
  );
}

function DockCaption({ state, startedAt }: { state: LiveState; startedAt: number | null }) {
  return (
    <div className="mt-3 flex h-5 items-center gap-2 text-[13px] font-medium text-fg-2">
      {state === "idle" ? (
        <span>Bấm để nghe tiếp</span>
      ) : (
        <>
          <span>
            {state === "live" ? "Bấm để dừng" : state === "paused" ? "Tạm dừng để tiết kiệm · nói là nghe tiếp" : STATUS_TEXT[state]}
          </span>
          {startedAt && <Elapsed since={startedAt} />}
        </>
      )}
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="tabular-nums text-fg-3">· {h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}</span>;
}
