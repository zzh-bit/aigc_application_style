import { promises as fs } from "node:fs";
import path from "node:path";
import { dominantInsightEmotion } from "@/lib/insights-classify";

export type ArchivedEmotion = "happy" | "sad" | "anxious" | "calm" | "excited";

export type ArchivedMessage = {
  role: "user" | "assistant";
  name: string;
  content: string;
};

export type CouncilArchiveRecord = {
  id: string;
  date: string;
  summary: string;
  emotions: ArchivedEmotion[];
  keywords: string[];
  messageCount: number;
  messages: ArchivedMessage[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const ARCHIVE_FILE = path.join(DATA_DIR, "council-chat-archives.json");

function safeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitWords(input: string) {
  return input
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function summarizeToMaxWords(input: string, maxWords: number) {
  const words = splitWords(input);
  if (words.length === 0) return "（空）本次对话没有可总结内容。";
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")} ...`;
}

function extractKeywords(input: string, maxCount: number) {
  const stopwords = new Set([
    "的",
    "了",
    "和",
    "是",
    "我",
    "你",
    "他",
    "她",
    "它",
    "我们",
    "你们",
    "他们",
    "然后",
    "这个",
    "那个",
    "以及",
    "但是",
    "因为",
    "所以",
    "如果",
    "with",
    "that",
    "this",
    "have",
    "just",
    "from",
    "your",
    "about",
  ]);

  const tokens = input
    .toLowerCase()
    .match(/[\u4e00-\u9fa5]{2,}|[a-z][a-z0-9-]{2,}/g) ?? [];

  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (stopwords.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([word]) => word);
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(ARCHIVE_FILE);
  } catch {
    await fs.writeFile(ARCHIVE_FILE, "[]", "utf8");
  }
}

export async function readCouncilArchives() {
  await ensureDataFile();
  const raw = await fs.readFile(ARCHIVE_FILE, "utf8");
  try {
    const data = JSON.parse(raw) as CouncilArchiveRecord[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveCouncilArchive(messages: ArchivedMessage[]) {
  const compact = messages
    .map((m) => ({
      role: m.role,
      name: m.name.trim().slice(0, 40),
      content: m.content.trim(),
    }))
    .filter((m) => m.content.length > 0);

  // 主要信息来源优先使用用户输入；若没有用户消息，再回退到全量消息。
  const userMessages = compact.filter((m) => m.role === "user");
  const primaryText = userMessages.length > 0
    ? userMessages.map((m) => `${m.name}: ${m.content}`).join("\n")
    : compact.map((m) => `${m.name}: ${m.content}`).join("\n");

  const summary = summarizeToMaxWords(primaryText, 50);
  const emotions: ArchivedEmotion[] = [dominantInsightEmotion(primaryText)];
  const keywords = extractKeywords(primaryText, 10);

  const record: CouncilArchiveRecord = {
    id: safeId(),
    date: new Date().toISOString(),
    summary,
    emotions,
    keywords,
    messageCount: compact.length,
    messages: compact,
  };

  const list = await readCouncilArchives();
  list.unshift(record);
  await fs.writeFile(ARCHIVE_FILE, JSON.stringify(list, null, 2), "utf8");

  return record;
}
