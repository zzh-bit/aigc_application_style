"use client";

import { motion } from "framer-motion";
import { RoleSeat, RoleType } from "./role-seat";
import { MessageBubble } from "./message-bubble";
import { MoodIndicator, MoodType } from "./mood-indicator";
import { InputBar } from "./input-bar";
import { MemoryFragment } from "./memory-fragment";
import { useState, useEffect, useRef } from "react";
import { storageGet, storageSet, storageRemove } from "@/lib/storage";
import { CheckCheck, RefreshCw } from "lucide-react";
import { selectRelevantMemories, type MemoryContextHit } from "@/lib/memory-context";
import type { MemoryItem } from "@/lib/types/domain";
import { triggerLettersByChatKeywords } from "@/lib/letter-trigger";
import type { AppSettings } from "@/lib/app-settings";
import { fetchJson, userFacingMessage } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

type EmotionResult = { label: "happy" | "sad" | "anxious" | "calm" | "excited"; score: number };

interface CouncilMainProps {
  onAnxiousDetected?: (payload: { source: "council"; score: number; text: string }) => void;
  onLettersTriggered?: (payload: { count: number; titles: string[] }) => void;
  settings?: AppSettings;
}

const MENTOR_IMPORT_OPTIONS = [
  { id: "stoic", label: "马可·奥勒留" },
  { id: "socratic", label: "苏格拉底" },
  { id: "cognitive", label: "卡尼曼" },
  { id: "jung", label: "荣格" },
  { id: "strategic", label: "孙子" },
  { id: "confucius", label: "孔子" },
  { id: "eastern", label: "老子" },
  { id: "zhuangzi", label: "庄子" },
];

const roles: { role: RoleType; name: string; position: "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" }[] = [
  { role: "radical", name: "激进派", position: "top-left" },
  { role: "conservative", name: "保守派", position: "top-right" },
  { role: "mentor", name: "智库导师", position: "top-center" },
  { role: "future", name: "未来派", position: "bottom-left" },
  { role: "host", name: "主持人", position: "bottom-right" },
];

export function CouncilMain({ onAnxiousDetected, onLettersTriggered, settings }: CouncilMainProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeRole, setActiveRole] = useState<RoleType | null>(null);
  const [thinkingRole, setThinkingRole] = useState<RoleType | null>(null);
  const [mood, setMood] = useState<{ type: MoodType; level: number }>({ type: "calm", level: 65 });
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
  const lastDebatePayloadRef = useRef<{
    topic: string;
    memories: { title: string; summary: string; keywords: string[] }[];
    hits: MemoryContextHit[];
    includeMentor: boolean;
    mentorId: string;
    roundId: number;
  } | null>(null);
  const CALM_FLOOR = 35;
  const HIGH_ANXIETY_THRESHOLD = 0.9;

  const applySettingsToReply = (role: RoleType, text: string) => {
    let next = text.trim();
    const lengthMode = settings?.replyLength ?? "medium";
    if (lengthMode === "short" && next.length > 70) next = `${next.slice(0, 70)}...`;
    if (lengthMode === "medium" && next.length > 150) next = `${next.slice(0, 150)}...`;
    if (lengthMode === "long" && next.length < 120) next = `${next}（补充：可进一步细化执行步骤与复盘指标。）`;
    const tone = settings?.replyTone ?? "balanced";
    if (tone === "gentle") next = `我理解你的感受。${next}`;
    if (tone === "rational") next = `理性拆解：${next}`;
    const strength = role === "radical" ? settings?.factionStrength.radical : role === "conservative" ? settings?.factionStrength.conservative : role === "future" ? settings?.factionStrength.future : 70;
    if (typeof strength === "number" && role !== "host" && role !== "mentor") {
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
      const saved = await storageGet<Message[]>("council.messages.v1", []);
      if (cancelled) return;
      if (saved.length > 0) {
        setMessages(saved);
        setActiveRole(null);
        return;
      }
      setMessages([]);
      setActiveRole(null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 情绪仪表盘自然衰减：仅对焦虑做缓慢衰减；降到阈值后回归平静并停止下降
  useEffect(() => {
    const timer = window.setInterval(() => {
      setMood((prev) => {
        if (prev.type !== "anxious") {
          return { type: "calm", level: CALM_FLOOR };
        }
        const nextLevel = prev.level - 1;
        if (nextLevel <= CALM_FLOOR) return { type: "calm", level: CALM_FLOOR };
        return { type: "anxious", level: nextLevel };
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [CALM_FLOOR]);

  const detectEmotionAndSyncMood = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
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
      if (data.label === "anxious") {
        const anxiousLevel = Math.max(CALM_FLOOR, Math.round(data.score * 100));
        setMood({ type: "anxious", level: anxiousLevel });
      } else {
        setMood({ type: "calm", level: CALM_FLOOR });
      }
      if (data.label === "anxious" && data.score >= HIGH_ANXIETY_THRESHOLD) {
        onAnxiousDetected?.({ source: "council", score: data.score, text: trimmed });
      }
    } catch (e) {
      clientLog("warn", "council.emotion", "emotion api skipped", { detail: String(e) });
    }
  };

  const withMemoryEvidence = (raw: string, memoryHits: MemoryContextHit[]) => {
    if (memoryHits.length === 0) return raw;
    const top = memoryHits[0];
    const evidence = `基于记忆「${top.title}」：${top.summary}`;
    if (raw.includes("基于记忆") || raw.includes(top.title)) return raw;
    return `${raw}\n${evidence}`;
  };

  const deliverFactionReplies = async (
    replies: Array<{ role: RoleType; name: string; message: string }>,
    hits: MemoryContextHit[],
    opts?: { firstDelayMs?: number; stepDelayMs?: number },
  ) => {
    const first = opts?.firstDelayMs ?? 720;
    const step = opts?.stepDelayMs ?? 140;
    for (const [index, reply] of replies.entries()) {
      await runThinkingDelay(reply.role, { baseMs: index === 0 ? first : first + index * step });
      setActiveRole(reply.role);
      const nextReply: Message = {
        id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
        role: reply.role,
        name: reply.name,
        message: withMemoryEvidence(applySettingsToReply(reply.role, reply.message), hits),
        direction: reply.role === "host" ? "center" : reply.role === "conservative" ? "right" : "left",
        isHost: reply.role === "host",
        hasMemory: hits.length > 0,
        memorySource: hits[0]?.title,
        memoryContent: hits[0]?.summary,
      };
      setMessages((prev) => {
        const next = [...prev, nextReply];
        void storageSet("council.messages.v1", next);
        return next;
      });
      void detectEmotionAndSyncMood(reply.message);
    }
  };

  const retryLastDebate = async () => {
    const p = lastDebatePayloadRef.current;
    if (!p || isSending) return;
    setIsSending(true);
    setCouncilNetworkError(null);
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
      const debateUrl = `${apiBase}/api/council/debate`;
      const data = await fetchJson<{
        replies?: Array<{ role: RoleType; name: string; message: string }>;
      }>(debateUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: p.topic,
          includeMentor: p.includeMentor,
          mentorId: p.includeMentor ? p.mentorId : undefined,
          memories: p.memories,
          roundId: p.roundId,
        }),
        timeoutMs: 45_000,
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
        void storageSet("council.messages.v1", next);
        return next;
      });
      await deliverFactionReplies(replies, p.hits, { firstDelayMs: 520, stepDelayMs: 120 });
    } catch (e) {
      clientLog("warn", "council.debate.retry", "retry failed", { detail: String(e) });
      setCouncilNetworkError(userFacingMessage(e));
    } finally {
      setIsSending(false);
      setThinkingRole(null);
      setActiveRole(null);
    }
  };

  const handleSend = async (message: string) => {
    if (isSending) return;
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
        void storageSet("council.messages.v1", next);
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
      topK: 3,
    });
    setCitedMemories(hits);
    const memories = (hits.length > 0 ? hits : memoryRecords.slice(0, 3)).map((m) => ({
      title: m.title,
      summary: m.summary,
      keywords: m.keywords,
    }));

    lastDebatePayloadRef.current = {
      topic: topicTrim,
      memories,
      hits,
      includeMentor: mentorImported,
      mentorId: selectedMentorId,
      roundId: chatRoundId,
    };

    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
      const debateUrl = `${apiBase}/api/council/debate`;

      const data = await fetchJson<{
        replies?: Array<{
          role: RoleType;
          name: string;
          message: string;
        }>;
      }>(debateUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: topicTrim,
          includeMentor: mentorImported,
          mentorId: mentorImported ? selectedMentorId : undefined,
          memories,
          roundId: chatRoundId,
        }),
        timeoutMs: 45_000,
      });

      setCouncilNetworkError(null);
      const replies = Array.isArray(data.replies) ? data.replies : [];
      if (replies.length === 0) {
        throw new Error("empty replies");
      }
      await deliverFactionReplies(replies, hits, { firstDelayMs: 720, stepDelayMs: 140 });
    } catch (e) {
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
        ...(mentorImported
          ? ([
              {
                role: "mentor",
                name: `导师·${selectedMentorLabel}`,
                message: "导师补充：先把你的优先级与约束写清楚，再用一周做小步实验，用数据复盘决定是否加码。",
              },
            ] satisfies Array<Pick<Message, "role" | "name" | "message" | "isHost">>)
          : []),
        {
          role: "host",
          name: "主持人",
          message: "结论：小步试错 + 风险边界 + 长期导向。先执行一周后复盘。",
          isHost: true,
        },
      ];

      await deliverFactionReplies(
        fallbackReplies.map((r) => ({
          role: r.role,
          name: r.name,
          message: r.message,
        })),
        hits,
        { firstDelayMs: 700, stepDelayMs: 140 },
      );
    } finally {
      setIsSending(false);
      setThinkingRole(null);
      setActiveRole(null);
    }
  };

  const handleArchiveDecision = async () => {
    if (isArchiving || decisionCompleted || messages.length === 0) return;
    setIsArchiving(true);
    setDecisionCompleted(true);
    setArchiveHint("");

    try {
      if (settings && settings.uploadToBackend === false) {
        setArchiveHint("已保存到本地（你已关闭后端上传）");
        await storageRemove("council.messages.v1");
        setIsResettingRound(true);
        window.setTimeout(() => {
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

      const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
      const apiUrl = `${apiBase}/api/council/archive`;

      const data = await fetchJson<{ record?: { summary?: string } }>(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
        timeoutMs: 45_000,
      });
      const summary = data.record?.summary ?? "";
      setArchiveHint(summary ? `保存成功：${summary}` : "保存成功，已归档本轮聊天");
      await storageRemove("council.messages.v1");
      window.setTimeout(() => {
        // 留在 council 页面，仅重置本轮聊天与输入，开启新 round。
        setIsResettingRound(true);
      }, 260);
      window.setTimeout(() => {
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
      const topic = latestUserTopic || "请基于当前议会进展继续推进";
      const memoryRecords = await storageGet<MemoryItem[]>("memory.memories.v1", []);
      const hits = selectRelevantMemories({ query: topic, memories: memoryRecords, topK: 3 });
      const memories = (hits.length > 0 ? hits : memoryRecords.slice(0, 3)).map((m) => ({
        title: m.title,
        summary: m.summary,
        keywords: m.keywords,
      }));

      const data = await fetchJson<{
        replies?: Array<{ role: RoleType; name: string; message: string }>;
      }>("/api/council/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          includeMentor: true,
          mentorId: selectedMentorId,
          memories,
        }),
        timeoutMs: 45_000,
      });
      const replies = Array.isArray(data.replies) ? data.replies : [];
      const mapped = replies.map((reply) => ({
        ...reply,
        name: reply.role === "mentor" ? `导师·${mentor?.label ?? reply.name}` : reply.name,
      }));
      await deliverFactionReplies(mapped, hits, { firstDelayMs: 760, stepDelayMs: 140 });
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
        void storageSet("council.messages.v1", next);
        return next;
      });
    } finally {
      setThinkingRole(null);
      setActiveRole(null);
      setIsImportingMentor(false);
    }
  };

  const latestIdx = messages.length - 1;
  const latest = latestIdx >= 0 ? messages[latestIdx] : null;
  const history = latestIdx > 0 ? messages.slice(0, latestIdx) : [];

  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    const update = () => setIsLandscape(window.innerWidth > window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
      <main className="relative flex-1 flex items-center justify-center px-4 pb-24 md:pb-28 overflow-hidden">
        {/* 中央消息区：最新一条突出显示；历史记录可滚动查看 */}
        <div
          className={`relative z-10 w-full max-w-md lg:max-w-lg transition-opacity duration-300 ${
            isResettingRound ? "opacity-0" : "opacity-100"
          }`}
          style={{ marginTop: isLandscape ? 24 : undefined }}
        >
          {citedMemories.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-2 px-2">
              {citedMemories.map((m) => (
                <span
                  key={m.id}
                  className="text-[10px] px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary"
                  title={m.summary}
                >
                  记忆引用：{m.title}
                </span>
              ))}
            </div>
          )}

          {latest ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-full flex justify-center">
                <MessageBubble
                  role={latest.role}
                  name={latest.name}
                  message={latest.message}
                  direction={latest.direction}
                  isHost={latest.isHost}
                  isSpeaking={activeRole === latest.role}
                />
              </div>

              {/* 固定页面不允许滑动：横屏时不展示可滚动的历史列表 */}
              {!isLandscape && history.length > 0 && (
                <div className="w-full px-2">
                  <div className="text-[10px] text-muted-foreground/70 mb-1">历史发言（可滚动）</div>
                  <div className="max-h-[18vh] md:max-h-[22vh] overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-hide">
                    {history.map((msg) => (
                      <div key={`h-${msg.id}`} className="opacity-85">
                        <MessageBubble
                          role={msg.role}
                          name={msg.name}
                          message={msg.message}
                          direction={msg.direction}
                          isHost={msg.isHost}
                          isSpeaking={false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-10">输入一个议题开始讨论</div>
          )}
        </div>
      </main>

      {/* 底部输入栏 */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 pb-3 pt-3 bg-background/20 border-t border-border/30">
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
            <MoodIndicator mood={mood.type} level={mood.level} />
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
