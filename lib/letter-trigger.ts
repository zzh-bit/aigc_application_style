import { storageGet, storageSet } from "@/lib/storage";

type LetterEmotion = "hopeful" | "anxious" | "determined" | "reflective" | "grateful";
type TriggerType = "date" | "emotion" | "event";
type LetterStatus = "draft" | "scheduled" | "delivered" | "replied";

type LetterRecord = {
  id: string;
  type: "incoming" | "outgoing";
  title: string;
  content: string;
  emotion: LetterEmotion;
  triggerType: TriggerType;
  triggerValue: string;
  createdAt: string;
  deliveryDate: string;
  status: LetterStatus;
  threadId?: string;
  deliveredAt?: string;
  readAt?: string;
  councilNotes?: { role: string; note: string }[];
};

export type TriggerDeliveryResult = {
  deliveredCount: number;
  deliveredLetters: LetterRecord[];
};

const KEY_PRIMARY = "letters.v1";
const KEY_LEGACY = "letters.letters.v1";

const emotionKeywords: Record<string, string[]> = {
  anxious: ["焦虑", "紧张", "担心", "害怕", "panic", "anxious", "压力大"],
  lost: ["迷茫", "不知道怎么办", "没方向", "lost"],
  tired: ["累", "疲惫", "精疲力尽", "burnout"],
  lonely: ["孤独", "一个人", "没人理解", "lonely"],
  down: ["低落", "难过", "沮丧", "down"],
  stressed: ["压力", "压得喘不过气", "stress", "stressed"],
  sad: ["难过", "悲伤", "沮丧", "sad"],
  calm: ["平静", "安心", "放松", "calm", "relaxed"],
  happy: ["开心", "高兴", "快乐", "happy", "glad"],
  excited: ["兴奋", "激动", "振奋", "excited", "thrilled"],
  grateful: ["感恩", "感谢", "珍惜", "grateful"],
  confident: ["自信", "有把握", "笃定", "confident"],
};

const eventKeywords: Record<string, string[]> = {
  decision: ["决策", "选择", "拿不定主意", "决定"],
  interview: ["面试", "hr", "offer"],
  exam: ["考试", "测验", "考核"],
  birthday: ["生日"],
  anniversary: ["纪念日"],
  newYear: ["新年", "元旦"],
  achievement: ["成功", "达成", "完成目标", "里程碑"],
  failure: ["失败", "挫折", "搞砸了"],
};

function normalize(text: string) {
  return text.trim().toLowerCase();
}

function includesAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w.toLowerCase()));
}

async function loadLetters() {
  const primary = await storageGet<LetterRecord[]>(KEY_PRIMARY, []);
  if (primary.length > 0) return primary;
  return await storageGet<LetterRecord[]>(KEY_LEGACY, []);
}

async function persistLetters(letters: LetterRecord[]) {
  await storageSet(KEY_PRIMARY, letters);
  await storageSet(KEY_LEGACY, letters);
}

export async function triggerLettersByChatKeywords(inputText: string): Promise<TriggerDeliveryResult> {
  const text = normalize(inputText);
  if (!text) return { deliveredCount: 0, deliveredLetters: [] };

  const letters = await loadLetters();
  if (letters.length === 0) return { deliveredCount: 0, deliveredLetters: [] };

  const today = new Date().toISOString().slice(0, 10);
  const existingIds = new Set(letters.map((l) => l.id));
  const deliverIds = new Set<string>();

  for (const l of letters) {
    if (l.type !== "outgoing" || l.status === "delivered") continue;
    if (l.triggerType === "emotion") {
      const words = emotionKeywords[l.triggerValue] ?? [];
      if (includesAny(text, words)) deliverIds.add(l.id);
    } else if (l.triggerType === "event") {
      const words = eventKeywords[l.triggerValue] ?? [];
      if (includesAny(text, words)) deliverIds.add(l.id);
    }
  }

  if (deliverIds.size === 0) return { deliveredCount: 0, deliveredLetters: [] };

  const deliveredIncoming: LetterRecord[] = [];
  const next = letters.map((l) => {
    if (!deliverIds.has(l.id)) return l;
    const out = { ...l, status: "delivered" as const, deliveredAt: today };
    const incomingId = `in-${out.id}-${today}`;
    if (!existingIds.has(incomingId)) {
      deliveredIncoming.push({
        id: incomingId,
        type: "incoming",
        title: out.title,
        content: out.content,
        emotion: out.emotion,
        triggerType: out.triggerType,
        triggerValue: out.triggerValue,
        createdAt: out.createdAt,
        deliveryDate: today,
        status: "delivered",
        threadId: out.threadId ?? out.id,
        deliveredAt: today,
        councilNotes: [{ role: "系统", note: "聊天关键词触发：已即时送达。" }],
      });
    }
    return out;
  });

  const merged = [...deliveredIncoming, ...next];
  await persistLetters(merged);
  return { deliveredCount: deliveredIncoming.length, deliveredLetters: deliveredIncoming };
}

