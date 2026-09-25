// Kiểu trò chuyện: quyết định giọng văn và cách xưng hô khi dịch sang tiếng Việt.
// App không chỉ cho họp hành: người yêu, bạn bè, đồng nghiệp nói chuyện đủ mọi chủ đề.

import { CONVERSATION_KEY, readStorage } from "./browser/storage";

export type ConversationType = "auto" | "work" | "couple" | "friends";

export const CONVERSATIONS: { id: ConversationType; label: string; desc: string }[] = [
  { id: "auto", label: "Tự hiểu", desc: "AI tự đoán theo nội dung đang nói" },
  { id: "work", label: "Công việc", desc: "Họp, làm ăn, đồng nghiệp" },
  { id: "couple", label: "Người yêu", desc: "Tình cảm, thân mật" },
  { id: "friends", label: "Bạn bè", desc: "Thoải mái, suồng sã" },
];

export function isConversationType(v: unknown): v is ConversationType {
  return v === "auto" || v === "work" || v === "couple" || v === "friends";
}

export function getConversationType(): ConversationType {
  const v = typeof window === "undefined" ? "auto" : readStorage(CONVERSATION_KEY, "auto");
  return isConversationType(v) ? v : "auto";
}

/** Bạn bè xưng "mình – bạn"; còn lại xưng "anh – em" theo giới tính người nói. */
export function pronounStyle(type: ConversationType): "gender" | "friends" {
  return type === "friends" ? "friends" : "gender";
}

/** Mô tả bối cảnh cho AI (tiếng Trung – dùng trong lời dặn dịch Trung → Việt đã tinh chỉnh). */
export const SCENE_ZH: Record<ConversationType, string> = {
  auto: "对话场景：不固定（可能是工作、情侣、朋友、同事、家人聊天），请根据前面的对话自己判断双方关系和语气。",
  work: "对话场景：工作 / 开会 / 谈生意（老板、同事、客户之间）。",
  couple: "对话场景：情侣之间聊天，亲密、随意，可能撒娇、开玩笑、吵架。",
  friends: "对话场景：朋友之间聊天，随意、轻松，可能开玩笑、吐槽、用网络流行语。",
};

/** Mô tả bối cảnh cho AI (tiếng Anh – dùng cho các cặp ngôn ngữ khác). */
export const SCENE_EN: Record<ConversationType, string> = {
  auto: "Conversation type: not fixed (could be work, a couple, friends, colleagues or family) – infer the relationship and tone from the conversation so far.",
  work: "Conversation type: work / meeting / business (managers, colleagues, clients).",
  couple: "Conversation type: a couple chatting – intimate and casual; teasing, sweet talk or arguing.",
  friends: "Conversation type: friends chatting – relaxed and casual; jokes, banter, slang.",
};

/** Mô tả bối cảnh bằng tiếng Việt (tóm tắt, gợi ý trả lời, hỏi đáp). */
export const SCENE_VI: Record<ConversationType, string> = {
  auto: "cuộc trò chuyện (có thể là công việc, người yêu, bạn bè, đồng nghiệp, gia đình – tự đoán theo nội dung)",
  work: "cuộc trò chuyện công việc (họp, làm ăn, đồng nghiệp)",
  couple: "cuộc trò chuyện giữa hai người yêu nhau",
  friends: "cuộc trò chuyện giữa bạn bè",
};
