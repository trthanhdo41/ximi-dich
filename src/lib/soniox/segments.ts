import { DEFAULT_PAIR, detectLanguage, scriptOf, unspaced, type LangPair } from "../languages";

// Gom token Soniox thành từng câu (segment).
// Thứ tự token trong một câu: token gốc → token dịch → "<end>" (endpoint detection).
// Token final chỉ gửi một lần; token non-final được gửi lại toàn bộ ở mỗi message.

export type SonioxToken = {
  text: string;
  start_ms?: number;
  end_ms?: number;
  confidence?: number;
  is_final?: boolean;
  speaker?: string;
  language?: string;
  source_language?: string;
  translation_status?: "original" | "translation" | "none";
};

export type Segment = {
  id: number;
  /** Giờ thật (epoch ms) lúc câu bắt đầu được nói – để hiện giờ:phút:giây. */
  at?: number;
  speaker?: string;
  /** Ngôn ngữ người nói dùng (zh | vi). */
  language?: string;
  originalFinal: string;
  originalPartial: string;
  translationFinal: string;
  translationPartial: string;
  /** Vị trí (ms, tính từ đầu luồng audio) của từ đầu tiên / cuối cùng được nói. */
  speechStartMs?: number;
  speechEndMs?: number;
  /** Giới tính người nói (đoán theo cao độ giọng hoặc do người dùng chọn) – để dịch đúng xưng hô, chọn giọng đọc. */
  gender?: "male" | "female";
  /** Thời điểm (performance.now) nhận token dịch đầu tiên. */
  firstTranslationAt?: number;
  /** Thời điểm nhận token dịch final cuối cùng. */
  translationDoneAt?: number;
  /** Thời điểm nhận "<end>". */
  endedAt?: number;
  /** Giờ thật (epoch ms) lúc câu được chốt – để biết câu sau nói tiếp ngay hay cách xa. */
  closedAt?: number;
  /** Độ tin cậy trung bình của các token gốc final. */
  avgConfidence?: number;
  confidenceSum: number;
  confidenceCount: number;
  closed: boolean;
  /** Chế độ tiết kiệm: câu đã chốt, đang chờ dịch. */
  pendingTranslation?: boolean;
  /** Chế độ tiết kiệm: dịch lỗi (mạng/máy chủ). */
  translationFailed?: boolean;
  /** Người dùng đánh dấu câu quan trọng. */
  starred?: boolean;
  /** Đang được AI dịch lại cho chuẩn (thành ngữ, khẩu ngữ, thương mại). */
  refining?: boolean;
  /** Bản dịch đã được AI dịch lại theo nghĩa bản địa. */
  refined?: boolean;
  /** Bản dịch nhanh ban đầu của Soniox (trước khi AI dịch lại). */
  draft?: string;
  /** Giải thích thành ngữ / tiếng lóng / thuật ngữ trong câu. */
  notes?: { term: string; meaning: string }[];
  /** App tự cắt câu vì người nói nói liền một mạch quá dài (không ghép lại với câu sau). */
  cut?: boolean;
};

function newSegment(id: number): Segment {
  return {
    id,
    originalFinal: "",
    originalPartial: "",
    translationFinal: "",
    translationPartial: "",
    confidenceSum: 0,
    confidenceCount: 0,
    closed: false,
  };
}

function isEmpty(s: Segment) {
  return !s.originalFinal && !s.originalPartial && !s.translationFinal && !s.translationPartial;
}

/** Câu đã kết thúc hẳn chưa (có dấu chấm câu cuối câu). */
export function endsSentence(text: string) {
  return /[。！？!?…~～.؟।]["'”’」』）)]*\s*$/.test(text.trim());
}

/** Câu sau nói tiếp trong khoảng này (ms) và câu trước chưa hết câu → coi là một câu, ghép lại. */
const MERGE_GAP_MS = 4000;

// Người nói liền một mạch (không ngừng nghỉ) thì Soniox không chốt câu → câu phình mãi, máy đơ.
// App tự cắt tại dấu câu khi câu đã đủ dài (tính theo chữ Hán; chữ cái Latin… dài gấp ~3,5 lần).
const CUT_AT_STOP = 40; // chỗ có dấu chấm / chấm hỏi / chấm than
const CUT_AT_COMMA = 60; // chỗ có dấu phẩy
const CUT_HARD = 120; // quá dài thì cắt luôn, không cần dấu câu
const CHARS_PER_UNIT: Partial<Record<ReturnType<typeof scriptOf>, number>> = { Han: 1, Japanese: 1, Hangul: 1.5, Thai: 3 };
const lengthOf = (text: string, language?: string) => text.trim().length / (CHARS_PER_UNIT[scriptOf(language)] ?? 3.5);

// Đếm số câu (dấu chấm / hỏi / than) để biết bản dịch của câu vừa cắt đã về đủ chưa.
// Không đếm dấu phẩy: bản dịch hay thêm/bớt dấu phẩy so với câu gốc. Bỏ qua dấu trong số (12.5, 3.000).
const STOPS = /[。！？!?؟।]|\.(?!\d)/g;
const clauses = (text: string, re: RegExp) => text.match(re)?.length ?? 0;
/** Chờ bản dịch về trễ của câu vừa cắt tối đa bao lâu. */
const TAIL_WAIT_MS = 4000;

function shouldCut(seg: Segment) {
  const len = lengthOf(seg.originalFinal, seg.language);
  if (len >= CUT_HARD) return true;
  if (len >= CUT_AT_COMMA && /[，,、；;：:،]\s*$/.test(seg.originalFinal)) return true;
  return len >= CUT_AT_STOP && endsSentence(seg.originalFinal);
}

export class SegmentBuilder {
  /** Cặp ngôn ngữ của cuộc họp: đối tác nói gì, mình nói gì (câu của mình không cần dịch). */
  languages: LangPair = DEFAULT_PAIR;
  /** Tự ghép mảnh câu bị cắt giữa chừng (người nói ngừng giữa câu). */
  mergeFragments = true;
  /** Bản dịch tạm của câu đang nói (chế độ tiết kiệm) – hiện mờ cho tới khi có bản dịch chuẩn. */
  liveDraft = "";
  private segments: Segment[] = [];
  private open: Segment = newSegment(0);
  private nextId = 1;
  /** Gọi khi một câu được chốt ("<end>"). */
  onClose?: (segment: Segment) => void;

  /**
   * Câu vừa bị app tự cắt: Soniox dịch chậm hơn chữ gốc một nhịp, nên phần dịch của câu đó còn về sau khi cắt.
   * Gom phần đó vào đúng câu (tới khi đủ số vế câu), không để dính sang đầu câu mới.
   */
  private tail: { id: number; need: number; have: number; deadline: number } | null = null;

  /** Token dịch thuộc về câu vừa cắt → gắn vào câu đó; trả về false nếu không phải. */
  private routeToTail(t: SonioxToken, now: number) {
    const tail = this.tail;
    const seg = tail && this.get(tail.id);
    if (!tail || !seg || now > tail.deadline || tail.have >= tail.need) {
      if (seg?.translationPartial) this.patch(seg.id, { translationPartial: "" });
      this.tail = null;
      return false;
    }
    // Câu đã được AI dịch lại thì bỏ phần dịch nhanh về trễ (vẫn đếm để biết khi nào hết).
    if (t.is_final) {
      tail.have += clauses(t.text, STOPS);
      if (!seg.refined) this.patch(seg.id, { translationFinal: seg.translationFinal + t.text, translationDoneAt: now });
    } else if (!seg.refined) {
      this.patch(seg.id, { translationPartial: seg.translationPartial + t.text });
    }
    return true;
  }

  ingest(tokens: SonioxToken[], now: number) {
    this.open.originalPartial = "";
    this.open.translationPartial = "";
    const tailSeg = this.tail && this.get(this.tail.id);
    if (tailSeg?.translationPartial) this.patch(tailSeg.id, { translationPartial: "" });

    for (const t of tokens) {
      if (!t.text) continue;
      if (t.text === "<end>") {
        if (t.is_final) this.close(now);
        continue;
      }
      if (t.text === "<fin>") continue;

      const isTranslation = t.translation_status === "translation";
      if (isTranslation && this.tail && this.routeToTail(t, now)) continue;
      const seg = this.open;
      seg.at ??= Date.now();
      if (!isTranslation) {
        if (t.speaker && !seg.speaker) seg.speaker = t.speaker;
        if (t.language && !seg.language) seg.language = t.language;
        if (t.end_ms != null) seg.speechEndMs = Math.max(seg.speechEndMs ?? 0, t.end_ms);
        if (t.start_ms != null) seg.speechStartMs = Math.min(seg.speechStartMs ?? t.start_ms, t.start_ms);
      } else {
        if (t.source_language && !seg.language) seg.language = t.source_language;
        if (t.speaker && !seg.speaker) seg.speaker = t.speaker;
        seg.firstTranslationAt ??= now;
      }

      if (t.is_final) {
        if (isTranslation) {
          seg.translationFinal += t.text;
          seg.translationDoneAt = now;
        } else {
          seg.originalFinal += t.text;
          if (t.confidence != null) {
            seg.confidenceSum += t.confidence;
            seg.confidenceCount++;
          }
          if (shouldCut(seg)) this.cut(now);
        }
      } else if (isTranslation) {
        seg.translationPartial += t.text;
      } else {
        seg.originalPartial += t.text;
      }
    }
  }

  /** Cắt câu đang nói dở vì quá dài: phần đã chốt thành một câu, phần đang nghe chuyển sang câu mới. */
  private cut(now: number) {
    const seg = this.open;
    const originalPartial = seg.originalPartial;
    const translationPartial = seg.translationPartial;
    seg.originalPartial = "";
    seg.translationPartial = "";
    seg.cut = true;
    // Chỉ chờ khi cắt đúng chỗ hết câu; cắt ở dấu phẩy thì không đếm được → AI dịch lại sẽ sửa.
    const need = endsSentence(seg.originalFinal) ? clauses(seg.originalFinal, STOPS) : 0;
    const have = clauses(seg.translationFinal, STOPS);
    this.close(now);
    // Câu có thể vừa được ghép vào câu trước → lấy id câu vừa chốt.
    const id = this.lastClosed()?.id ?? seg.id;
    this.tail = need > have ? { id, need, have, deadline: now + TAIL_WAIT_MS } : null;
    Object.assign(this.open, { originalPartial, translationPartial, speaker: seg.speaker, language: seg.language });
  }

  /** Chốt câu đang mở (khi nhận "<end>" hoặc khi phiên kết thúc). */
  close(now: number) {
    const seg = this.open;
    if (isEmpty(seg)) return;
    // Phần non-final còn sót (khi phiên kết thúc đột ngột) được giữ lại như final.
    seg.originalFinal += seg.originalPartial;
    seg.translationFinal += seg.translationPartial;
    seg.originalPartial = "";
    seg.translationPartial = "";
    seg.endedAt = now;
    seg.closedAt = Date.now();
    seg.closed = true;
    if (seg.confidenceCount) seg.avgConfidence = seg.confidenceSum / seg.confidenceCount;
    seg.language = detectLanguage(seg.originalFinal, seg.language, this.languages);

    // Câu trước bị cắt giữa chừng (chưa có dấu kết câu) và cùng người nói tiếp ngay → ghép thành một câu.
    const prev = this.segments[this.segments.length - 1];
    if (
      this.mergeFragments &&
      prev &&
      prev.speaker === seg.speaker &&
      prev.language === seg.language &&
      !prev.cut &&
      !endsSentence(prev.originalFinal) &&
      lengthOf(prev.originalFinal + seg.originalFinal, seg.language) < CUT_HARD &&
      prev.closedAt &&
      seg.at &&
      seg.at - prev.closedAt < MERGE_GAP_MS
    ) {
      const joinSpaced = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(" ");
      const merged: Segment = {
        ...prev,
        originalFinal: unspaced(prev.language)
          ? prev.originalFinal.trim() + seg.originalFinal.trim()
          : joinSpaced(prev.originalFinal, seg.originalFinal),
        translationFinal: unspaced(prev.language === this.languages.mine ? this.languages.partner : this.languages.mine)
          ? prev.translationFinal.trim() + seg.translationFinal.trim()
          : joinSpaced(prev.translationFinal, seg.translationFinal),
        speechEndMs: seg.speechEndMs ?? prev.speechEndMs,
        translationDoneAt: seg.translationDoneAt ?? prev.translationDoneAt,
        endedAt: now,
        closedAt: seg.closedAt,
        confidenceSum: prev.confidenceSum + seg.confidenceSum,
        confidenceCount: prev.confidenceCount + seg.confidenceCount,
        // Cả câu sẽ được dịch lại từ đầu.
        refined: false,
        refining: false,
        draft: undefined,
        notes: [],
        translationFailed: false,
        pendingTranslation: false,
      };
      if (merged.confidenceCount) merged.avgConfidence = merged.confidenceSum / merged.confidenceCount;
      this.segments[this.segments.length - 1] = merged;
      this.onClose?.(merged);
      this.open = newSegment(this.nextId++);
      return;
    }

    this.segments.push(seg);
    this.onClose?.(seg);
    this.open = newSegment(this.nextId++);
  }

  /** Nạp lại các câu đã lưu (vd. sau khi tải lại trang). Phần chưa chốt coi như đã chốt. */
  load(saved: Segment[]) {
    this.tail = null;
    this.segments = saved.map((s) => ({
      ...s,
      language: detectLanguage(s.originalFinal + s.originalPartial, s.language, this.languages),
      originalFinal: s.originalFinal + s.originalPartial,
      originalPartial: "",
      translationFinal: s.translationFinal + s.translationPartial,
      translationPartial: "",
      pendingTranslation: false,
      refining: false,
      translationFailed: s.translationFailed || (s.pendingTranslation && !s.translationFinal) || undefined,
      closed: true,
    }));
    this.nextId = this.segments.reduce((max, s) => Math.max(max, s.id), -1) + 1;
    this.open = newSegment(this.nextId++);
  }

  /** Câu vừa chốt gần nhất. */
  lastClosed(): Segment | undefined {
    return this.segments[this.segments.length - 1];
  }

  get(id: number): Segment | undefined {
    return this.segments.find((s) => s.id === id);
  }

  /** Bỏ hẳn một câu (vd. tiếng máy đọc lọt vào micro). */
  remove(id: number) {
    this.segments = this.segments.filter((s) => s.id !== id);
  }

  /** Sửa một câu đã chốt (vd. gắn bản dịch về sau). */
  patch(id: number, fields: Partial<Segment>) {
    const i = this.segments.findIndex((s) => s.id === id);
    if (i >= 0) this.segments[i] = { ...this.segments[i], ...fields };
  }

  /** Bản sao để render (câu đang mở nằm cuối, nếu có nội dung). */
  snapshot(): Segment[] {
    // Câu đã chốt không đổi nữa nên dùng lại tham chiếu; chỉ sao chép câu đang mở.
    if (isEmpty(this.open)) return [...this.segments];
    const open = { ...this.open };
    open.language = detectLanguage(open.originalFinal + open.originalPartial, open.language, this.languages);
    if (this.liveDraft && !open.translationFinal && !open.translationPartial) open.translationPartial = this.liveDraft;
    return [...this.segments, open];
  }
}
