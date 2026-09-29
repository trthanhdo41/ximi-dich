// "Gửi cho AI": đóng gói cả cuộc trò chuyện + một lời nhờ viết sẵn để dán vào ChatGPT / Claude của người dùng
// (vd. làm báo giá, hợp đồng sau buổi tư vấn khách). Không tốn tiền AI của app, không phụ thuộc gói Groq miễn phí.

import { AI_PROMPTS_KEY, readStorage, writeStorage } from "../browser/storage";
import { meetingToMarkdown } from "./export";
import type { SavedMeeting } from "./storage";

export type AiTemplate = { id: string; label: string; desc: string; prompt: string };

const COMMON = `Bên dưới là bản ghi tự động (máy nghe, có thể sai vài chữ – hãy suy ra ý đúng theo ngữ cảnh) của một buổi trao đổi. "Người 1/2…" là nhãn máy tự gán. Không bịa thông tin; chỗ nào chưa rõ thì ghi "(cần xác nhận)". Trả lời bằng tiếng Việt, trình bày rõ ràng bằng Markdown.`;

export const AI_TEMPLATES: AiTemplate[] = [
  {
    id: "quote",
    label: "Báo giá",
    desc: "Hạng mục, tính năng, thời gian, ngân sách",
    prompt: `Đây là buổi tư vấn khách hàng về dự án (website / app / phần mềm). Hãy lập BẢN NHÁP BÁO GIÁ:
1. Tóm tắt nhu cầu và mục tiêu của khách (2–4 câu).
2. Bảng hạng mục: Hạng mục | Mô tả / tính năng | Ước lượng công (ngày) | Đơn giá | Thành tiền. Chưa có giá thì để trống cột giá.
3. Tiến độ đề xuất theo giai đoạn (milestone) và mốc khách mong muốn.
4. Ngân sách, deadline, hình thức thanh toán khách đã nhắc tới (nếu có).
5. Giả định và những gì KHÔNG nằm trong phạm vi.
6. Câu hỏi cần hỏi lại khách trước khi chốt giá.

${COMMON}`,
  },
  {
    id: "contract",
    label: "Hợp đồng / Phạm vi",
    desc: "Phạm vi công việc, nghiệm thu, điều khoản",
    prompt: `Dựa vào buổi trao đổi, hãy soạn NHÁP PHỤ LỤC PHẠM VI CÔNG VIỆC (Scope of Work) để đưa vào hợp đồng:
1. Thông tin dự án, các bên (nếu có trong nội dung).
2. Phạm vi công việc chi tiết: từng hạng mục, tính năng, sản phẩm bàn giao.
3. Ngoài phạm vi (không bao gồm).
4. Tiến độ, các mốc bàn giao và điều kiện nghiệm thu.
5. Giá trị, đợt thanh toán, bảo hành / bảo trì, số lần chỉnh sửa (theo những gì đã bàn; chưa bàn thì đề xuất và đánh dấu "(đề xuất)").
6. Trách nhiệm của mỗi bên (tài liệu, nội dung, tài khoản khách cần cung cấp).
7. Điểm còn mơ hồ cần thống nhất trước khi ký.

${COMMON}`,
  },
  {
    id: "minutes",
    label: "Biên bản họp",
    desc: "Ý chính, quyết định, ai làm gì, hạn",
    prompt: `Hãy viết BIÊN BẢN BUỔI TRAO ĐỔI:
- Thời gian, thành phần (theo nội dung).
- Nội dung chính đã trao đổi.
- Các quyết định / điều đã thống nhất.
- Việc cần làm: Ai – việc gì – hạn.
- Vấn đề còn bỏ ngỏ.

${COMMON}`,
  },
  {
    id: "spec",
    label: "Yêu cầu (Spec)",
    desc: "Tính năng, user story, màn hình",
    prompt: `Hãy tổng hợp YÊU CẦU SẢN PHẨM từ buổi trao đổi:
1. Mục tiêu và người dùng chính.
2. Danh sách tính năng, xếp theo ưu tiên (Bắt buộc / Nên có / Để sau), mỗi tính năng viết dạng user story ngắn.
3. Danh sách màn hình / trang chính.
4. Yêu cầu khác: thiết kế, nền tảng, tích hợp (thanh toán, đăng nhập…), hiệu năng, SEO.
5. Câu hỏi cần làm rõ.

${COMMON}`,
  },
  {
    id: "email",
    label: "Email gửi khách",
    desc: "Cảm ơn, tóm tắt, bước tiếp theo",
    prompt: `Hãy viết EMAIL gửi khách sau buổi trao đổi: lời cảm ơn ngắn, tóm tắt những gì đã thống nhất, các bước tiếp theo và thời hạn, những thông tin cần khách gửi thêm. Giọng lịch sự, thân thiện, chuyên nghiệp, ngắn gọn.

${COMMON}`,
  },
  {
    id: "summary",
    label: "Tóm tắt",
    desc: "Ý chính, đã thống nhất, việc cần làm",
    prompt: `Hãy tóm tắt ngắn gọn: ý chính, điều đã thống nhất, việc cần làm / lời hẹn (ai – việc gì – khi nào), con số và ngày giờ quan trọng.

${COMMON}`,
  },
];

function overrides(): Record<string, string> {
  try {
    return JSON.parse(readStorage(AI_PROMPTS_KEY, "{}")) ?? {};
  } catch {
    return {};
  }
}

/** Lời nhờ của một mẫu (bản người dùng đã sửa nếu có). */
export function promptFor(id: string) {
  return overrides()[id] ?? AI_TEMPLATES.find((t) => t.id === id)?.prompt ?? "";
}

export function isCustomized(id: string) {
  return id in overrides();
}

/** Lưu bản sửa của một mẫu; `null` = trả về mẫu gốc. */
export function savePrompt(id: string, prompt: string | null) {
  const o = overrides();
  if (prompt === null || prompt.trim() === AI_TEMPLATES.find((t) => t.id === id)?.prompt.trim()) delete o[id];
  else o[id] = prompt;
  writeStorage(AI_PROMPTS_KEY, JSON.stringify(o));
}

/** Nội dung dán vào ChatGPT / Claude: lời nhờ + toàn bộ cuộc trò chuyện (có tóm tắt nếu đã có). */
export function buildAiText(meeting: SavedMeeting, prompt: string) {
  return `${prompt.trim()}\n\n---\n\n${meetingToMarkdown(meeting)}`;
}

/** Link mở ChatGPT / Claude; nội dung ngắn thì điền sẵn luôn vào ô chat. */
export function aiUrl(target: "chatgpt" | "claude", text: string) {
  const base = target === "chatgpt" ? "https://chatgpt.com/" : "https://claude.ai/new";
  return text.length <= 6000 ? `${base}?q=${encodeURIComponent(text)}` : base;
}
