"use client";

import { motion } from "framer-motion";
import { RoleSeat, RoleType } from "./role-seat";
import { MessageBubble } from "./message-bubble";
import { MoodIndicator, MoodType } from "./mood-indicator";
import { InputBar } from "./input-bar";
import { MemoryFragment } from "./memory-fragment";
import { useState, useEffect, useRef } from "react";
import { storageGet, storageSet, storageRemove } from "@/lib/storage";
import { CheckCheck, ClipboardCopy, RefreshCw } from "lucide-react";
import {
  selectRelevantMemories,
  formatHitsForUserEvidence,
  MEMORY_RETRIEVAL_MAX_HITS,
  type MemoryContextHit,
} from "@/lib/memory-context";
import type { MemoryItem } from "@/lib/types/domain";
import { triggerLettersByChatKeywords } from "@/lib/letter-trigger";
import type { AppSettings } from "@/lib/app-settings";
import { fetchJson, userFacingMessage } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";

/** 议会辩论：服务端串行多派系 LLM，45s 极易超时；邀请导师仅 1 次调用可略短 */
const COUNCIL_DEBATE_TIMEOUT_MS = 300_000;
const COUNCIL_DEBATE_MENTOR_INVITE_TIMEOUT_MS = 120_000;
import {
  COUNCIL_MESSAGES_KEY,
  COUNCIL_SESSION_KEY,
  COUNCIL_PROJECTION_SUPPRESS_KEY,
} from "@/lib/council-storage-keys";
import {
  computeChatLexicalMoodTotals,
  CHAT_SAD_LEAN_RE,
  CHAT_JOY_EXCITED_RE,
} from "@/lib/emotion-event-signals";
import { dominantInsightEmotion } from "@/lib/insights-classify";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MouseEvent as ReactMouseEvent } from "react";

interface Message {
  id: string;
  role: RoleType;
  name: string;
  message: string;
  direction: "left" | "right" | "center";
  isHost?: boolean;
  hasMemory?: boolean;
  memorySource?: string;
  memoryContent?: string;
}
type LocalArchiveRecord = {
  id: string;
  date: string;
  summary: string;
  emotions: Array<"happy" | "sad" | "anxious" | "calm" | "excited">;
  keywords: string[];
  messageCount: number;
  messages: Array<{ role: "user" | "assistant"; name: string; content: string }>;
};

type EmotionResult = { label: "happy" | "sad" | "anxious" | "calm" | "excited"; score: number };
type CouncilSession = {
  mood: { type: MoodType; level: number };
  citedMemories: MemoryContextHit[];
  selectedMentorId: string;
  mentorImported: boolean;
  chatRoundId: number;
};

interface CouncilMainProps {
  /** 为 false 时表示底部切到记忆库/洞察等子页，主议会隐藏但组件仍挂载以便继续拉取派系回复 */
  isUiActive?: boolean;
  onAnxiousDetected?: (payload: { source: "council"; score: number; text: string }) => void;
  onLettersTriggered?: (payload: { count: number; titles: string[] }) => void;
  settings?: AppSettings;
  breathingRecoveredAt?: number;
}

/** 供辩论 API 延续多轮语境（截断防超长；主持人/派系空气泡不传） */
function buildDebateConversationContext(msgs: Message[], maxTurns = 14, maxCharsPerLine = 280): string {
  return msgs
    .filter((m) => m.message.trim().length > 0)
    .slice(-maxTurns)
    .map((m) => `${m.name}：${m.message.trim().slice(0, maxCharsPerLine)}`)
    .join("\n")
    .trim();
}

/** 与导师库四类对齐，每类 4 位（id 须与 mentor-library / prompt-library 一致） */
const MENTOR_IMPORT_OPTIONS = [
  { id: "stoic", label: "马可·奥勒留" },
  { id: "socratic", label: "苏格拉底" },
  { id: "existential", label: "萨特" },
  { id: "plato", label: "柏拉图" },
  { id: "cognitive", label: "卡尼曼" },
  { id: "jung", label: "荣格" },
  { id: "nietzsche", label: "尼采" },
  { id: "freud", label: "弗洛伊德" },
  { id: "strategic", label: "孙子" },
  { id: "confucius", label: "孔子" },
  { id: "epicurus", label: "伊壁鸠鲁" },
  { id: "hanfei", label: "韩非子" },
  { id: "eastern", label: "老子" },
  { id: "zhuangzi", label: "庄子" },
  { id: "buddha", label: "释迦牟尼" },
  { id: "wangyangming", label: "王阳明" },
];

const roles: { role: RoleType; name: string; position: "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" }[] = [
  { role: "future", name: "未来派", position: "top-left" },
  { role: "host", name: "主持人", position: "top-right" },
  { role: "mentor", name: "智库导师", position: "top-center" },
  { role: "radical", name: "激进派", position: "bottom-left" },
  { role: "conservative", name: "保守派", position: "bottom-right" },
];
const LOCAL_ARCHIVES_KEY = "council.archives.local.v1";
/** 压力环 >50 时自然回落，每降 1 点间隔（毫秒） */
const MOOD_LEVEL_DECAY_MS = 10_000;
/** 命中消极词汇或 API 判焦虑/难过后的自然回落暂停时长 */
const MOOD_DECAY_PAUSE_AFTER_NEG_MS = 50_000;
/** 议会底部导航在输入栏上方悬浮时，为消息区预留的硬性避让高度 */
const COUNCIL_NAV_CLEARANCE_PX = 96;

type StressBand = "low" | "mid" | "high" | "severe";

function stressBandFromLevel(level: number): StressBand {
  if (level <= 62) return "low";
  if (level <= 74) return "mid";
  if (level <= 86) return "high";
  return "severe";
}

/**
 * 词汇净强度 net（neg−pos）→ 压力环变化量（点）。
 * 与 `computeChatLexicalMoodTotals` 的分值对齐：如仅命中「绝望」一组 neg=16、net=16，在低档约 +16，避免旧式 net*0.55 压成 +9。
 */
function mapLexicalNetToLevelDelta(net: number, prevLevel: number): number {
  const band = stressBandFromLevel(prevLevel);
  const negBandMult: Record<StressBand, number> = { low: 1.0, mid: 0.92, high: 0.84, severe: 0.75 };
  const posBandMult: Record<StressBand, number> = { low: 0.52, mid: 0.58, high: 0.64, severe: 0.7 };
  if (net > 0) {
    const raw = Math.round(net * 0.88 + 2);
    const capped = Math.min(30, Math.max(3, raw));
    const d = Math.round(capped * negBandMult[band]);
    return Math.min(30, Math.max(3, d));
  }
  if (net < 0) {
    const raw = Math.round(Math.abs(net) * 0.52 + 2);
    const capped = Math.min(22, Math.max(3, raw));
    const pull = Math.round(capped * posBandMult[band]);
    return -Math.min(20, Math.max(3, pull));
  }
  return 0;
}

/** 高档位时自然回落更慢：每 period 次 tick 才降 1 点 */
function decayStridePeriodForLevel(level: number): number {
  if (level >= 83) return 3;
  if (level >= 69) return 2;
  return 1;
}

export function CouncilMain({
  isUiActive = true,
  onAnxiousDetected,
  onLettersTriggered,
  settings,
  breathingRecoveredAt,
}: CouncilMainProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRole, setActiveRole] = useState<RoleType | null>(null);
  const [thinkingRole, setThinkingRole] = useState<RoleType | null>(null);
  const [mood, setMood] = useState<{ type: MoodType; level: number }>({ type: "calm", level: 50 });
  const [showMemory, setShowMemory] = useState(false);
  const [currentMemory, setCurrentMemory] = useState<{ source: string; content: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveHint, setArchiveHint] = useState<string>("");
  const [decisionCompleted, setDecisionCompleted] = useState(false);
  const [chatRoundId, setChatRoundId] = useState(1);
  const [inputResetKey, setInputResetKey] = useState(0);
  const [isResettingRound, setIsResettingRound] = useState(false);
  const [citedMemories, setCitedMemories] = useState<MemoryContextHit[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState("stoic");
  const [isImportingMentor, setIsImportingMentor] = useState(false);
  const [mentorImported, setMentorImported] = useState(false);
  const [councilNetworkError, setCouncilNetworkError] = useState<string | null>(null);
  const [issueFeedbackText, setIssueFeedbackText] = useState("");
  const [issueCopied, setIssueCopied] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [clickRipples, setClickRipples] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  const highAnxietyNotifiedRef = useRef(false);
  const [footerHeight, setFooterHeight] = useState(116);
  const councilAwayTimerRef = useRef<number | null>(null);
  const councilDebateAbortRef = useRef<AbortController | null>(null);
  /** 离开主界面超时：为 true 时中止 fetch 或停止逐条派发 */
  const councilAwayInterruptRef = useRef(false);
  const councilAwayMs = Math.max(15_000, Math.min(600_000, settings?.councilAwayAbortMs ?? 120_000));

  const clearCouncilAwayTimer = () => {
    if (councilAwayTimerRef.current !== null) {
      window.clearTimeout(councilAwayTimerRef.current);
      councilAwayTimerRef.current = null;
    }
  };

  const lastDebatePayloadRef = useRef<{
    topic: string;
    memories: { title: string; summary: string; keywords: string[] }[];
    hits: MemoryContextHit[];
    includeMentor: boolean;
    mentorId: string;
    roundId: number;
    conversationContext: string;
  } | null>(null);
  /** 在此时间戳之前不执行压力环随时间的自动下降 */
  const moodDecaySuppressedUntilRef = useRef(0);
  const moodDecayStrideTickRef = useRef(0);

  const touchMoodDecayPauseAfterNegative = () => {
    moodDecaySuppressedUntilRef.current = Math.max(
      moodDecaySuppressedUntilRef.current,
      Date.now() + MOOD_DECAY_PAUSE_AFTER_NEG_MS,
    );
  };

  useEffect(() => {
    if (isUiActive) {
      clearCouncilAwayTimer();
      return;
    }
    if (!isSending) {
      clearCouncilAwayTimer();
      return;
    }
    clearCouncilAwayTimer();
    councilAwayTimerRef.current = window.setTimeout(() => {
      councilAwayTimerRef.current = null;
      councilAwayInterruptRef.current = true;
      councilDebateAbortRef.current?.abort();
    }, councilAwayMs);
    return () => {
      clearCouncilAwayTimer();
    };
  }, [isUiActive, isSending, councilAwayMs]);

  const CALM_FLOOR = 35;
  /** 与 MoodIndicator anxietyOnly 一致：level < 65 显示平静，否则显示焦虑；积极类情绪应把 level 压在此阈值以下 */
  const STRESS_METER_CALM_MAX = 64;
  /** 与欢迎页「情绪触发阈值」一致，用于呼吸引导 / 高焦虑提示 */
  const anxietyNotifyThreshold = settings?.emotionTriggerThreshold ?? 0.72;
  const anxietyLevelPct = Math.round(anxietyNotifyThreshold * 100);

  const applySettingsToReply = (role: RoleType, text: string) => {
    let next = text.trim();
    if (role === "host") return next;
    const lengthMode = settings?.replyLength ?? "medium";
    if (lengthMode === "short" && next.length > 70) next = `${next.slice(0, 70)}...`;
    if (lengthMode === "medium" && next.length > 150) next = `${next.slice(0, 150)}...`;
    if (lengthMode === "long" && next.length < 120) next = `${next}（补充：可进一步细化执行步骤与复盘指标。）`;
    const tone = settings?.replyTone ?? "balanced";
    if (tone === "gentle") next = `我理解你的感受。${next}`;
    if (tone === "rational") next = `理性拆解：${next}`;
    const strength = role === "radical" ? settings?.factionStrength.radical : role === "conservative" ? settings?.factionStrength.conservative : role === "future" ? settings?.factionStrength.future : 70;
    if (typeof strength === "number" && role !== "mentor") {
      if (strength >= 80) next = `${next}（立场强）`;
      if (strength <= 35) next = `${next}（仅供参考）`;
    }
    return next;
  };

  const toMentorBadgeText = (rawName: string) => {
    const name = rawName.trim();
    if (!name) return "";
    // 外国人：取姓（按“·”或空格分隔取最后段），中文单名/复名保持原样
    if (name.includes("·")) {
      const parts = name.split("·").map((p) => p.trim()).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : name;
    }
    if (name.includes(" ")) {
      const parts = name.split(/\s+/).map((p) => p.trim()).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : name;
    }
    return name;
  };

  const selectedMentorLabel = MENTOR_IMPORT_OPTIONS.find((m) => m.id === selectedMentorId)?.label ?? "智库导师";
  const mentorBadgeText = mentorImported ? toMentorBadgeText(selectedMentorLabel) : "";

  const runThinkingDelay = async (role: RoleType, opts?: { baseMs?: number }) => {
    const base = typeof opts?.baseMs === "number" ? opts.baseMs : 650;
    const jitter = Math.floor(Math.random() * 450); // 0~449ms
    setThinkingRole(role);
    setActiveRole(null);
    await new Promise((r) => window.setTimeout(r, base + jitter));
    setThinkingRole(null);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const savedMessages = await storageGet<Message[]>(COUNCIL_MESSAGES_KEY, []);
      const savedSession = await storageGet<CouncilSession | null>(COUNCIL_SESSION_KEY, null);
      if (cancelled) return;
      if (savedMessages.length > 0) setMessages(savedMessages);
      if (savedSession) {
        setMood(savedSession.mood ?? { type: "calm", level: 50 });
        setCitedMemories(Array.isArray(savedSession.citedMemories) ? savedSession.citedMemories : []);
        setSelectedMentorId(savedSession.selectedMentorId || "stoic");
        setMentorImported(Boolean(savedSession.mentorImported));
        setChatRoundId(typeof savedSession.chatRoundId === "number" ? savedSession.chatRoundId : 1);
      }
      setActiveRole(null);
      setSessionHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;
    const session: CouncilSession = {
      mood,
      citedMemories,
      selectedMentorId,
      mentorImported,
      chatRoundId,
    };
    void storageSet(COUNCIL_SESSION_KEY, session);
  }, [sessionHydrated, mood, citedMemories, selectedMentorId, mentorImported, chatRoundId]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const high = mood.level >= anxietyLevelPct;
    if (high && !highAnxietyNotifiedRef.current) {
      highAnxietyNotifiedRef.current = true;
      onAnxiousDetected?.({ source: "council", score: mood.level / 100, text: "mood-threshold" });
    } else if (!high) {
      highAnxietyNotifiedRef.current = false;
    }
  }, [mood.type, mood.level, anxietyLevelPct, onAnxiousDetected]);

  useEffect(() => {
    if (!breathingRecoveredAt) return;
    // 从呼吸引导返回：固定下降 10 点，最低不低于 50（由焦虑阈值触发的流程）。
    setMood((prev) => ({ type: "calm", level: Math.max(50, prev.level - 10) }));
    highAnxietyNotifiedRef.current = false;
  }, [breathingRecoveredAt]);

  const extractArchiveKeywords = (text: string) => {
    const tokens = text.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z][a-z0-9-]{2,}/g) ?? [];
    const stop = new Set(["我们", "你们", "他们", "这个", "那个", "就是", "然后", "如果", "但是", "因为", "所以"]);
    const counts = new Map<string, number>();
    for (const t of tokens) {
      if (stop.has(t)) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
  };

  const persistLocalArchive = async (src: Message[]) => {
    const compact = src
      .map((m) => ({
        role: m.name === "你" ? ("user" as const) : ("assistant" as const),
        name: m.name.trim().slice(0, 40),
        content: m.message.trim(),
      }))
      .filter((m) => m.content.length > 0);
    const userText = compact.filter((m) => m.role === "user").map((m) => m.content).join(" ");
    if (!userText.trim()) return;
    const record: LocalArchiveRecord = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      date: new Date().toISOString(),
      summary: userText.slice(0, 120),
      emotions: [dominantInsightEmotion(userText)],
      keywords: extractArchiveKeywords(userText),
      messageCount: compact.length,
      messages: compact,
    };
    const prev = await storageGet<LocalArchiveRecord[]>(LOCAL_ARCHIVES_KEY, []);
    await storageSet(LOCAL_ARCHIVES_KEY, [record, ...prev]);
  };

  // 情绪仪表盘自然衰减：>50 时按档位降速；消极输入后会暂停一段时间再继续降。
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() < moodDecaySuppressedUntilRef.current) return;
      moodDecayStrideTickRef.current += 1;
      setMood((prev) => {
        if (prev.level <= 50) return prev;
        const period = decayStridePeriodForLevel(prev.level);
        if (moodDecayStrideTickRef.current % period !== 0) return prev;
        const nextLevel = Math.max(50, prev.level - 1);
        if (nextLevel === 50) return { type: "calm", level: 50 };
        return { ...prev, level: nextLevel };
      });
    }, MOOD_LEVEL_DECAY_MS);
    return () => window.clearInterval(timer);
  }, []);

  const detectEmotionAndSyncMood = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    /** API 不可用时：仅靠词汇表驱动仪表盘（与 computeChatLexicalMoodTotals 一致） */
    const applyRegexMoodFallback = () => {
      const { neg, pos, net } = computeChatLexicalMoodTotals(trimmed);
      if (neg <= 0 && pos <= 0) return;
      if (net > 0) touchMoodDecayPauseAfterNegative();
      setMood((prev) => {
        const delta = mapLexicalNetToLevelDelta(net, prev.level);
        if (delta === 0) return prev;
        const nextLevel = Math.max(50, Math.min(94, prev.level + delta));
        if (nextLevel >= 80) {
          return { type: CHAT_SAD_LEAN_RE.test(trimmed) ? "sad" : "anxious", level: nextLevel };
        }
        if (prev.type === "anxious" && nextLevel <= 68) return { type: "calm", level: Math.max(50, nextLevel) };
        if (pos > neg && nextLevel < prev.level) {
          const joy = /(开心|高兴|愉快|喜悦|幸福|激动|兴奋|太棒|上岸|录取|加薪|通过)/.test(trimmed);
          if (joy) {
            return {
              type: CHAT_JOY_EXCITED_RE.test(trimmed) ? "excited" : "happy",
              level: Math.max(50, Math.min(STRESS_METER_CALM_MAX, nextLevel)),
            };
          }
          return { type: "calm", level: Math.max(50, nextLevel) };
        }
        return { type: prev.type === "anxious" || prev.type === "sad" ? prev.type : "calm", level: nextLevel };
      });
    };

    /**
     * API 已跑完后叠加：避免模型判成 calm/低分时，提到明确消极/积极词时盘面仍不动。
     * 与 catch 里的全量 fallback 互斥（由调用处保证只执行其一）。
     */
    const applyLexicalMoodSupplement = () => {
      const { neg, pos, net } = computeChatLexicalMoodTotals(trimmed);
      if (neg === 0 && pos === 0) return;
      if (net > 0) touchMoodDecayPauseAfterNegative();

      setMood((prev) => {
        const delta = mapLexicalNetToLevelDelta(net, prev.level);
        if (delta === 0) return prev;
        if (net > 0) {
          const level = Math.max(50, Math.min(98, prev.level + delta));
          const type = CHAT_SAD_LEAN_RE.test(trimmed) ? "sad" : "anxious";
          return { type, level: Math.max(prev.level + 2, level) };
        }
        if (net < 0) {
          const pull = -delta;
          const joy = /(开心|高兴|愉快|喜悦|幸福|激动|兴奋|太棒|上岸|录取|加薪|面试通过|考过|好多了)/.test(trimmed);
          if (joy) {
            const type = CHAT_JOY_EXCITED_RE.test(trimmed) ? "excited" : "happy";
            const joyPull = Math.min(18, pull + Math.min(4, Math.round(pos * 0.1)));
            const level = Math.max(50, Math.min(STRESS_METER_CALM_MAX, prev.level - joyPull));
            return { type, level };
          }
          const level = Math.max(50, prev.level - pull);
          const type = prev.type === "anxious" || prev.type === "sad" ? "calm" : prev.type;
          return { type, level };
        }
        return prev;
      });
    };

    try {
      const data = await fetchJson<EmotionResult>("/api/emotion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          inputMode: "text",
        }),
        timeoutMs: 12_000,
      });
      const pct = Math.round(data.score * 100);
      // 略放宽：happy/sad/excited 低分时仍走分支，最终由词汇补充兜底
      const skipWeakAux =
        data.label !== "calm" && data.label !== "anxious" && data.score < 0.48;

      if (!skipWeakAux) {
        if (data.label === "anxious") {
          if (data.score >= 0.42) {
            const rawTarget = Math.min(90, Math.round(pct * 0.88 + 5));
            touchMoodDecayPauseAfterNegative();
            setMood((prev) => {
              const band = stressBandFromLevel(prev.level);
              const blendK: Record<StressBand, number> = { low: 0.86, mid: 0.82, high: 0.78, severe: 0.74 };
              const stepK: Record<StressBand, number> = { low: 1.08, mid: 1.0, high: 0.92, severe: 0.85 };
              const maxStep = Math.max(12, Math.round(22 * stepK[band]));
              const capped = Math.min(rawTarget, prev.level + maxStep);
              const blended = Math.round(prev.level + (capped - prev.level) * blendK[band]);
              const level = Math.max(50, Math.min(94, Math.max(prev.level, blended)));
              return { type: "anxious", level: Math.max(54, Math.max(CALM_FLOOR, level)) };
            });
          }
        } else if (data.label === "sad") {
          if (data.score >= 0.42) {
            const rawTarget = Math.min(90, Math.round(pct * 0.82 + 6));
            touchMoodDecayPauseAfterNegative();
            setMood((prev) => {
              const band = stressBandFromLevel(prev.level);
              const blendK: Record<StressBand, number> = { low: 0.84, mid: 0.8, high: 0.76, severe: 0.72 };
              const stepK: Record<StressBand, number> = { low: 1.06, mid: 1.0, high: 0.9, severe: 0.84 };
              const maxStep = Math.max(11, Math.round(20 * stepK[band]));
              const capped = Math.min(rawTarget, prev.level + maxStep);
              const blended = Math.round(prev.level + (capped - prev.level) * blendK[band]);
              const level = Math.max(50, Math.min(92, Math.max(prev.level, blended)));
              return { type: "sad", level: Math.max(52, level) };
            });
          }
        } else if (data.label === "excited") {
          if (data.score >= 0.45) {
            setMood((prev) => {
              if (prev.type === "anxious") return { type: "calm", level: Math.max(50, prev.level - 12) };
              const drop = Math.min(20, Math.max(6, Math.round(pct * 0.14)));
              const level = Math.max(50, Math.min(STRESS_METER_CALM_MAX, prev.level - drop));
              return { type: "excited", level };
            });
          }
        } else if (data.label === "happy") {
          if (data.score >= 0.45) {
            setMood((prev) => {
              if (prev.type === "anxious") return { type: "calm", level: Math.max(50, prev.level - 14) };
              const drop = Math.min(22, Math.max(7, Math.round(pct * 0.18)));
              const level = Math.max(50, Math.min(STRESS_METER_CALM_MAX, prev.level - drop));
              return { type: "happy", level };
            });
          }
        } else if (data.label === "calm" && data.score >= 0.52) {
          setMood((prev) => {
            const calmLevel = Math.max(50, Math.min(STRESS_METER_CALM_MAX, Math.round(50 + pct * 0.12)));
            if (prev.type === "anxious") return { type: "calm", level: Math.max(50, prev.level - 14) };
            return { type: "calm", level: Math.min(prev.level, calmLevel) };
          });
        }
      }

      if (
        (data.label === "anxious" || data.label === "sad") &&
        data.score >= anxietyNotifyThreshold
      ) {
        onAnxiousDetected?.({ source: "council", score: data.score, text: trimmed });
      }

      applyLexicalMoodSupplement();
    } catch (e) {
      clientLog("warn", "council.emotion", "emotion api skipped", { detail: String(e) });
      applyRegexMoodFallback();
    }
  };

  const withMemoryEvidence = (raw: string, memoryHits: MemoryContextHit[]) => {
    if (memoryHits.length === 0) return raw;
    const block = formatHitsForUserEvidence(memoryHits);
    if (raw.includes("【本轮与用户发言相关的个人记忆】")) return raw;
    if (memoryHits.some((h) => h.title && raw.includes(h.title))) return raw;
    return `${raw}\n\n${block}`;
  };

  const appendCouncilHostNotice = (text: string) => {
    const msg: Message = {
      id: `sys-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      role: "host",
      name: "系统",
      message: text,
      direction: "center",
      isHost: true,
    };
    setMessages((prev) => {
      const next = [...prev, msg];
      void storageSet(COUNCIL_MESSAGES_KEY, next);
      return next;
    });
  };

  const awayInterruptNoticeText = () => {
    const sec = Math.round(councilAwayMs / 1000);
    return sec >= 60
      ? `离开议会主界面超过约 ${Math.round(sec / 60)} 分钟，多派系回复中断（已展示部分仍会保留）。可点击「重试」或重新发送议题。`
      : `离开议会主界面超过 ${sec} 秒，多派系回复中断（已展示部分仍会保留）。可点击「重试」或重新发送议题。`;
  };

  const deliverFactionReplies = async (
    replies: Array<{ role: RoleType; name: string; message: string }>,
    hits: MemoryContextHit[],
    opts?: { firstDelayMs?: number; stepDelayMs?: number },
  ) => {
    const first = opts?.firstDelayMs ?? 720;
    const step = opts?.stepDelayMs ?? 140;
    let interruptPosted = false;
    for (const [index, reply] of replies.entries()) {
      if (councilAwayInterruptRef.current) {
        if (!interruptPosted) {
          appendCouncilHostNotice(awayInterruptNoticeText());
          interruptPosted = true;
        }
        break;
      }
      await runThinkingDelay(reply.role, { baseMs: index === 0 ? first : first + index * step });
      if (councilAwayInterruptRef.current) {
        if (!interruptPosted) {
          appendCouncilHostNotice(awayInterruptNoticeText());
          interruptPosted = true;
        }
        break;
      }
      setActiveRole(reply.role);
      const nextReply: Message = {
        id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
        role: reply.role,
        name: reply.name,
        message: withMemoryEvidence(applySettingsToReply(reply.role, reply.message), hits),
        direction: reply.role === "host" ? "center" : reply.role === "conservative" ? "right" : "left",
        isHost: reply.role === "host",
        hasMemory: hits.length > 0,
        memorySource:
          hits.length === 0 ? undefined : hits.length === 1 ? hits[0].title : `相关记忆 ${hits.length} 条`,
        memoryContent:
          hits.length === 0
            ? undefined
            : hits.length === 1
              ? hits[0].summary
              : hits
                  .slice(0, 3)
                  .map((h) => `「${h.title}」`)
                  .join(" "),
      };
      setMessages((prev) => {
        const next = [...prev, nextReply];
        void storageSet(COUNCIL_MESSAGES_KEY, next);
        return next;
      });
    }
  };

  const retryLastDebate = async () => {
    const p = lastDebatePayloadRef.current;
    if (!p || isSending) return;
    councilAwayInterruptRef.current = false;
    setIsSending(true);
    setCouncilNetworkError(null);
    const debateAc = new AbortController();
    councilDebateAbortRef.current = debateAc;
    try {
      const data = await fetchJson<{
        replies?: Array<{ role: RoleType; name: string; message: string }>;
      }>("/api/council/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: p.topic,
          includeMentor: p.includeMentor,
          mentorId: p.includeMentor ? p.mentorId : undefined,
          memories: p.memories,
          roundId: p.roundId,
          conversationContext: p.conversationContext,
        }),
        timeoutMs: COUNCIL_DEBATE_TIMEOUT_MS,
        externalSignal: debateAc.signal,
      });
      const replies = Array.isArray(data.replies) ? data.replies : [];
      if (replies.length === 0) {
        setCouncilNetworkError("服务器未返回有效回复，请稍后重试。");
        return;
      }
      setMessages((prev) => {
        const sep: Message = {
          id: `retry-sep-${Date.now()}`,
          role: "host",
          name: "系统",
          message: "以下为重试后在线回复：",
          direction: "center",
          isHost: true,
        };
        const next = [...prev, sep];
        void storageSet(COUNCIL_MESSAGES_KEY, next);
        return next;
      });
      await deliverFactionReplies(replies, p.hits, { firstDelayMs: 520, stepDelayMs: 120 });
    } catch (e) {
      if (councilAwayInterruptRef.current) {
        councilAwayInterruptRef.current = false;
        setCouncilNetworkError(null);
        appendCouncilHostNotice(awayInterruptNoticeText());
      } else {
        clientLog("warn", "council.debate.retry", "retry failed", { detail: String(e) });
        setCouncilNetworkError(userFacingMessage(e));
      }
    } finally {
      clearCouncilAwayTimer();
      councilDebateAbortRef.current = null;
      councilAwayInterruptRef.current = false;
      setIsSending(false);
      setThinkingRole(null);
      setActiveRole(null);
    }
  };

  const handleSend = async (message: string) => {
    if (isSending) return;
    councilAwayInterruptRef.current = false;
    void storageRemove(COUNCIL_PROJECTION_SUPPRESS_KEY);
    setCitedMemories([]);
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "host",
      name: "你",
      message,
      direction: "center",
    };

    setIsSending(true);
    setActiveRole("host");

    const nextMessages = await new Promise<Message[]>((resolve) => {
      setMessages((prev) => {
        const next = [...prev, newMessage];
        void storageSet(COUNCIL_MESSAGES_KEY, next);
        resolve(next);
        return next;
      });
    });

    const topicTrim = message.trim();
    void detectEmotionAndSyncMood(topicTrim);
    if (topicTrim) void storageSet("council.lastTopic.v1", topicTrim);
    if (topicTrim) {
      const triggerResult = await triggerLettersByChatKeywords(topicTrim);
      if (triggerResult.deliveredCount > 0) {
        onLettersTriggered?.({
          count: triggerResult.deliveredCount,
          titles: triggerResult.deliveredLetters.map((l) => l.title),
        });
      }
    }

    const memoryRecords = await storageGet<MemoryItem[]>("memory.memories.v1", []);
    const hits = selectRelevantMemories({
      query: message.trim(),
      memories: memoryRecords,
      maxHits: MEMORY_RETRIEVAL_MAX_HITS,
    });
    setCitedMemories(hits);
    const memories = hits.map((m) => ({
      title: m.title,
      summary: m.summary,
      keywords: m.keywords,
    }));

    const conversationContext = buildDebateConversationContext(nextMessages);

    lastDebatePayloadRef.current = {
      topic: topicTrim,
      memories,
      hits,
      includeMentor: mentorImported,
      mentorId: selectedMentorId,
      roundId: chatRoundId,
      conversationContext,
    };

    const debateAc = new AbortController();
    councilDebateAbortRef.current = debateAc;
    try {
      const data = await fetchJson<{
        replies?: Array<{
          role: RoleType;
          name: string;
          message: string;
        }>;
      }>("/api/council/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: topicTrim,
          includeMentor: mentorImported,
          mentorId: mentorImported ? selectedMentorId : undefined,
          memories,
          roundId: chatRoundId,
          conversationContext,
        }),
        timeoutMs: COUNCIL_DEBATE_TIMEOUT_MS,
        externalSignal: debateAc.signal,
      });

      setCouncilNetworkError(null);
      const replies = Array.isArray(data.replies) ? data.replies : [];
      if (replies.length === 0) {
        throw new Error("empty replies");
      }
      await deliverFactionReplies(replies, hits, { firstDelayMs: 720, stepDelayMs: 140 });
    } catch (e) {
      if (councilAwayInterruptRef.current) {
        councilAwayInterruptRef.current = false;
        setCouncilNetworkError(null);
        appendCouncilHostNotice(awayInterruptNoticeText());
      } else {
        clientLog("warn", "council.debate", "debate failed, using offline fallback", { detail: String(e) });
        setCouncilNetworkError(userFacingMessage(e));
        const fallbackReplies: Array<Pick<Message, "role" | "name" | "message" | "isHost">> = [
          {
            role: "radical",
            name: "激进派",
            message: `先上场试一次，围绕「${message.trim()}」做最小行动验证，本周就开始。`,
          },
          {
            role: "conservative",
            name: "保守派",
            message: "先列风险与边界，设置止损，再推进执行，避免冲动决策。",
          },
          {
            role: "future",
            name: "未来派",
            message: "优先选择能在一年后仍有复利价值的方案，别只看当下舒适度。",
          },
          {
            role: "host",
            name: "主持人",
            message: "结论：小步试错 + 风险边界 + 长期导向。先执行一周后复盘。",
            isHost: true,
          },
        ];
        await deliverFactionReplies(
          fallbackReplies.map((r) => ({ role: r.role, name: r.name, message: r.message })),
          hits,
          { firstDelayMs: 700, stepDelayMs: 140 },
        );
      }
    } finally {
      clearCouncilAwayTimer();
      councilDebateAbortRef.current = null;
      councilAwayInterruptRef.current = false;
      setIsSending(false);
      setThinkingRole(null);
      setActiveRole(null);
    }
  };

  const handleArchiveDecision = async () => {
    if (isArchiving || decisionCompleted || messages.length === 0) return;
    setIsArchiving(true);
    setDecisionCompleted(true);
    void storageSet(COUNCIL_PROJECTION_SUPPRESS_KEY, true);
    setArchiveHint("");

    try {
      await persistLocalArchive(messages);
      if (settings && settings.uploadToBackend === false) {
        setArchiveHint("已保存到本地（你已关闭后端上传）");
        await storageRemove(COUNCIL_MESSAGES_KEY);
        setIsResettingRound(true);
        window.setTimeout(() => {
          lastDebatePayloadRef.current = null;
          void storageRemove(COUNCIL_SESSION_KEY);
          void storageRemove(COUNCIL_PROJECTION_SUPPRESS_KEY);
          void storageRemove("council.lastTopic.v1");
          setMood({ type: "calm", level: 50 });
          setMessages([]);
          setActiveRole(null);
          setShowMemory(false);
          setCurrentMemory(null);
          setDecisionCompleted(false);
          setCitedMemories([]);
          setMentorImported(false);
          setChatRoundId((v) => v + 1);
          setInputResetKey((v) => v + 1);
          setArchiveHint("新一轮已开始");
        }, 560);
        window.setTimeout(() => setIsResettingRound(false), 760);
        return;
      }
      const payloadMessages = messages.map((m) => ({
        role: m.name === "你" ? "user" : "assistant",
        name: m.name,
        content: m.message,
      }));

      const data = await fetchJson<{ record?: { summary?: string } }>("/api/council/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
        timeoutMs: 45_000,
      });
      const summary = data.record?.summary ?? "";
      setArchiveHint(summary ? `保存成功：${summary}` : "保存成功，已归档本轮聊天");
      await storageRemove(COUNCIL_MESSAGES_KEY);
      window.setTimeout(() => {
        // 留在 council 页面，仅重置本轮聊天与输入，开启新 round。
        setIsResettingRound(true);
      }, 260);
      window.setTimeout(() => {
        lastDebatePayloadRef.current = null;
        void storageRemove(COUNCIL_SESSION_KEY);
        void storageRemove(COUNCIL_PROJECTION_SUPPRESS_KEY);
        void storageRemove("council.lastTopic.v1");
        setMood({ type: "calm", level: 50 });
        setMessages([]);
        setActiveRole(null);
        setShowMemory(false);
        setCurrentMemory(null);
        setDecisionCompleted(false);
        setCitedMemories([]);
        setMentorImported(false);
        setChatRoundId((v) => v + 1);
        setInputResetKey((v) => v + 1);
        setArchiveHint("新一轮已开始");
      }, 560);
      window.setTimeout(() => {
        setIsResettingRound(false);
      }, 760);
    } catch (e) {
      clientLog("warn", "council.archive", "archive failed", { detail: String(e) });
      setArchiveHint(userFacingMessage(e));
      void storageRemove(COUNCIL_PROJECTION_SUPPRESS_KEY);
      setDecisionCompleted(false);
    } finally {
      setIsArchiving(false);
      window.setTimeout(() => setArchiveHint(""), 4000);
    }
  };

  const handleImportMentor = async () => {
    if (isImportingMentor) return;
    setIsImportingMentor(true);
    try {
      const mentor = MENTOR_IMPORT_OPTIONS.find((m) => m.id === selectedMentorId);
      const latestUserTopic = [...messages].reverse().find((m) => m.name === "你")?.message?.trim();
      const memoryRecords = await storageGet<MemoryItem[]>("memory.memories.v1", []);
      const lastStoredTopic = (await storageGet<string>("council.lastTopic.v1", "")).trim();
      const memoryQuery = (latestUserTopic || lastStoredTopic || "").trim();
      const hits = selectRelevantMemories({
        query: memoryQuery || " ",
        memories: memoryRecords,
        maxHits: MEMORY_RETRIEVAL_MAX_HITS,
      });
      const memories = hits.map((m) => ({
        title: m.title,
        summary: m.summary,
        keywords: m.keywords,
      }));
      const conversationContext = buildDebateConversationContext(messages);
      const inviteTopic =
        latestUserTopic ||
        "【议会开场】用户尚未发言。请你先以导师身份做简短欢迎与引导（2-4句），邀请用户提出具体议题，并说明你将如何协助讨论。";

      const data = await fetchJson<{
        replies?: Array<{ role: RoleType; name: string; message: string }>;
      }>("/api/council/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: inviteTopic,
          mentorInviteOnly: true,
          mentorId: selectedMentorId,
          memories,
          conversationContext,
        }),
        timeoutMs: COUNCIL_DEBATE_MENTOR_INVITE_TIMEOUT_MS,
      });
      const replies = Array.isArray(data.replies) ? data.replies : [];
      const mentorReply = replies.find((r) => r.role === "mentor");
      const mentorText = mentorReply?.message?.trim();
      const onlyMentor =
        mentorReply && mentorText
          ? [{ ...mentorReply, name: `导师·${mentor?.label ?? mentorReply.name}` }]
          : [
              {
                role: "mentor" as RoleType,
                name: `导师·${mentor?.label ?? "智库导师"}`,
                message: "我已加入议会。请先说出你正在纠结的具体议题，我会结合记忆与上下文给出建议。",
              },
            ];
      await deliverFactionReplies(onlyMentor, hits, { firstDelayMs: 520, stepDelayMs: 120 });
      setMentorImported(true);
    } catch (e) {
      clientLog("warn", "council.mentorImport", "import mentor debate failed", { detail: String(e) });
      const fallback: Message = {
        id: `${Date.now()}-mentor-import-fallback`,
        role: "mentor",
        name: "导师·系统",
        message: `导师回合导入失败：${userFacingMessage(e)} 请稍后重试，或先继续三派系讨论。`,
        direction: "left",
        isHost: false,
      };
      setMessages((prev) => {
        const next = [...prev, fallback];
        void storageSet(COUNCIL_MESSAGES_KEY, next);
        return next;
      });
    } finally {
      setThinkingRole(null);
      setActiveRole(null);
      setIsImportingMentor(false);
    }
  };

  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    const update = () => setIsLandscape(window.innerWidth > window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!councilNetworkError) return;
    const stamp = new Date().toLocaleString();
    setIssueFeedbackText((prev) => {
      if (prev.includes(councilNetworkError)) return prev;
      const next = `[${stamp}] ${councilNetworkError}`;
      return prev.trim().length > 0 ? `${next}\n${prev}` : next;
    });
  }, [councilNetworkError]);

  const handleCopyIssueFeedback = async () => {
    const payload = issueFeedbackText.trim();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setIssueCopied(true);
      window.setTimeout(() => setIssueCopied(false), 1500);
    } catch {
      setIssueCopied(false);
    }
  };

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setFooterHeight(h);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const value = isUiActive ? `${Math.max(0, footerHeight)}px` : "0px";
    document.documentElement.style.setProperty("--ps2-council-footer-height", value);
    // DO NOT remove property on unmount/cleanup, 
    // it will cause layout jumping and missing values when navigating.
  }, [footerHeight, isUiActive]);

  const handleBackgroundClick = (e: ReactMouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, textarea, select, a, [role='button']")) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ripple = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setClickRipples((prev) => [...prev, ripple]);
    window.setTimeout(() => {
      setClickRipples((prev) => prev.filter((r) => r.id !== ripple.id));
    }, 620);
  };

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col overflow-hidden">
      {/* 顶部预留层：保留空间与动画层级，不再放主图标 */}
      <header className="relative z-10 h-10 md:h-12" />

      {councilNetworkError && (
        <div className="relative z-20 mx-4 mb-2 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <span className="text-center">{councilNetworkError} 已使用离线建议，可重试连接服务器。</span>
          <button
            type="button"
            onClick={() => void retryLastDebate()}
            disabled={isSending || !lastDebatePayloadRef.current}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 px-2 py-1 text-amber-50 hover:bg-amber-500/20 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </button>
          <button
            type="button"
            onClick={() => setCouncilNetworkError(null)}
            className="rounded-lg px-2 py-1 text-white/70 hover:text-white"
          >
            关闭
          </button>
        </div>
      )}

      <div className="relative z-20 mx-4 mb-2 rounded-xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs text-white/80">问题反馈文本框（复制后可直接发给我排查）</span>
          <button
            type="button"
            onClick={() => void handleCopyIssueFeedback()}
            disabled={!issueFeedbackText.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {issueCopied ? "已复制" : "复制文本"}
          </button>
        </div>
        <Textarea
          value={issueFeedbackText}
          onChange={(e) => setIssueFeedbackText(e.target.value)}
          placeholder="可描述你的现象、复现步骤、报错文案；出现网络错误时会自动写入这里。"
          className="min-h-[92px] resize-y border-white/20 bg-black/25 text-xs text-white placeholder:text-white/45"
        />
      </div>

      {/* 角色席位：放到整页根层，确保 top 定位与顶部栏对齐（横屏导师齐平/略高） */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {roles.map((r) => (
          <div key={`seat-wrap-${r.role}`} className="pointer-events-auto">
            <RoleSeat
              role={r.role}
              name={r.role === "mentor" && mentorImported ? `导师·${selectedMentorLabel}` : r.name}
              position={r.position}
              isActive={activeRole === r.role}
              isThinking={thinkingRole === r.role}
              isEmpty={r.role === "mentor" && !mentorImported}
              badgeText={r.role === "mentor" ? mentorBadgeText : undefined}
              isLandscape={isLandscape}
            />
          </div>
        ))}

      </div>

      {/* 中央区域 */}
      <main
        className="relative flex-1 flex items-center justify-center px-4 overflow-hidden"
        style={{ paddingBottom: `${footerHeight + 12 + COUNCIL_NAV_CLEARANCE_PX}px` }}
        onClick={handleBackgroundClick}
      >
        {clickRipples.map((r) => (
          <motion.span
            key={r.id}
            className="pointer-events-none absolute rounded-full border border-primary/50 bg-primary/10"
            style={{ left: r.x, top: r.y, width: 10, height: 10 }}
            initial={{ opacity: 0.7, scale: 0.2, x: -5, y: -5 }}
            animate={{ opacity: 0, scale: 12 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        ))}

        {/* 中央消息区：加宽的圆角容器，内部上下滑动查看 */}
        <div
          className={`relative z-10 w-full max-w-[min(90vw,60rem)] transition-opacity duration-300 ${
            isResettingRound ? "opacity-0" : "opacity-100"
          }`}
          style={{ marginTop: isLandscape ? 24 : undefined, marginBottom: COUNCIL_NAV_CLEARANCE_PX - 4 }}
        >
          {citedMemories.length > 0 && (
            <div className="absolute left-[-0.25rem] md:left-[-0.5rem] bottom-[-1.8rem] md:bottom-[-2rem] flex max-w-[72vw] flex-wrap justify-start gap-2 pr-2">
              {citedMemories.map((m) => (
                <span
                  key={m.id}
                  className="text-[10px] px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary"
                  title={m.summary}
                >
                  引用记忆：{m.title}
                </span>
              ))}
            </div>
          )}

          {messages.length > 0 ? (
            <div className="mx-auto w-full px-0">
              <div className="flex w-full items-end gap-3">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <div className="pointer-events-none absolute left-2 bottom-1 z-20">
                      <span className="rounded-md bg-black/35 px-2 py-1 text-[10px] text-muted-foreground/75 backdrop-blur-sm">
                        会话记录（上下滑动查看）
                      </span>
                    </div>
                    <div
                      ref={messageListRef as any}
                      className="h-[clamp(14rem,40vh,24rem)] overflow-y-auto flex flex-col gap-2 px-1 pb-6 scrollbar-hide"
                    >
                      {messages.map((msg) => (
                        <div key={`m-${msg.id}`} className="w-full flex justify-center">
                          <MessageBubble
                            role={msg.role}
                            name={msg.name}
                            message={msg.message}
                            direction={msg.direction}
                            isHost={msg.isHost}
                            isSpeaking={activeRole === msg.role}
                          />
                        </div>
                      ))}
                      {/* 增加一点内部留白，避免最后一条气泡太贴底 */}
                      <div className="h-4 shrink-0 w-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full px-0">
              <div className="h-[clamp(14rem,40vh,24rem)] flex items-center justify-center text-sm text-muted-foreground text-center">
                输入一个议题开始讨论
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 底部输入栏 */}
      <footer
        ref={footerRef}
        className="fixed bottom-0 left-0 right-0 z-30 pt-3 bg-background/20"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {archiveHint && <div className="text-center text-xs text-emerald-300 mb-2 px-6">{archiveHint}</div>}

        {/* 底部输入框左侧：PS² + 情绪图标并排，且不拦截输入点击 */}
        <div className="pointer-events-none absolute left-4 md:left-6 bottom-4">
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <span className="text-base md:text-lg font-bold bg-gradient-to-r from-primary to-future bg-clip-text text-transparent select-none">
              PS²
            </span>
            <MoodIndicator mood={mood.type} level={mood.level} anxietyOnly />
          </motion.div>
        </div>

        {/* 右下角操作区：邀请导师 + 决策完成 */}
        <div className="pointer-events-none absolute right-4 bottom-4 flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <Select value={selectedMentorId} onValueChange={(v) => setSelectedMentorId(v)}>
              <SelectTrigger className="h-9 rounded-full px-3 text-xs bg-card/70 border border-border/50 text-foreground backdrop-blur-md">
                <SelectValue placeholder="选择导师…" />
              </SelectTrigger>
              <SelectContent className="border-border/60 bg-[#0E1629]/95 backdrop-blur-xl text-foreground">
                {MENTOR_IMPORT_OPTIONS.map((mentor) => (
                  <SelectItem key={mentor.id} value={mentor.id}>
                    {mentor.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={handleImportMentor}
              disabled={isImportingMentor}
              className="px-4 py-2 rounded-full text-xs bg-future/20 border border-future/30 text-future hover:bg-future/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isImportingMentor ? "邀请中…" : "邀请导师"}
            </button>
          </div>
          <button
            onClick={handleArchiveDecision}
            disabled={isArchiving || decisionCompleted || messages.length === 0}
            className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            {isArchiving ? "保存中…" : decisionCompleted ? "已完成" : "决策完成"}
          </button>
        </div>

        {/* 输入栏始终可见 */}
        <InputBar key={inputResetKey} onSend={handleSend} disabled={isSending} />
      </footer>
    </div>
  );
}
