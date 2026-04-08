"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  Send,
  Clock,
  Calendar,
  Heart,
  Sparkles,
  Users,
  Plus,
  Search,
  Stamp,
  Target,
  Zap,
  X,
  ChevronDown,
  Waves,
  Move,
  MailOpen,
  Trash2,
} from "lucide-react";
import { storageGet, storageSet } from "@/lib/storage";
import { EMOTION_TRIGGER_OPTIONS, EMOTION_TRIGGER_LABEL_MAP } from "@/lib/emotion-options";
import { fetchJson, userFacingMessage } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";
import { usePerformanceProfile } from "@/lib/performance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 信件数据类型
interface Letter {
  id: string;
  type: "incoming" | "outgoing";
  title: string;
  content: string;
  emotion: "hopeful" | "anxious" | "determined" | "reflective" | "grateful";
  triggerType: "date" | "emotion" | "event";
  triggerValue: string;
  createdAt: string;
  deliveryDate: string; // YYYY-MM-DD 或 "待触发"
  status: "draft" | "scheduled" | "delivered" | "replied";
  threadId?: string;
  deliveredAt?: string;
  readAt?: string;
  prediction?: string;
  reality?: string;
  councilNotes?: { role: string; note: string }[];
}

// 情绪颜色映射
const emotionColors: Record<string, { bg: string; text: string; glow: string }> = {
  hopeful: { bg: "rgba(74, 222, 128, 0.2)", text: "#4ade80", glow: "0 0 20px rgba(74, 222, 128, 0.3)" },
  anxious: { bg: "rgba(251, 146, 60, 0.2)", text: "#fb923c", glow: "0 0 20px rgba(251, 146, 60, 0.3)" },
  determined: { bg: "rgba(168, 85, 247, 0.2)", text: "#a855f7", glow: "0 0 20px rgba(168, 85, 247, 0.3)" },
  reflective: { bg: "rgba(96, 165, 250, 0.2)", text: "#60a5fa", glow: "0 0 20px rgba(96, 165, 250, 0.3)" },
  grateful: { bg: "rgba(251, 191, 36, 0.2)", text: "#fbbf24", glow: "0 0 20px rgba(251, 191, 36, 0.3)" },
};

const emotionLabels: Record<string, string> = {
  hopeful: "希望",
  anxious: "焦虑",
  determined: "坚定",
  reflective: "沉思",
  grateful: "感恩",
};

// 预设情绪触发选项
const EMOTION_TRIGGERS = EMOTION_TRIGGER_OPTIONS;

// 预设事件触发选项
const EVENT_TRIGGERS = [
  { value: "decision", label: "面临重大决策" },
  { value: "interview", label: "面试前" },
  { value: "exam", label: "考试前后" },
  { value: "birthday", label: "生日当天" },
  { value: "anniversary", label: "纪念日" },
  { value: "newYear", label: "新年第一天" },
  { value: "achievement", label: "达成重要目标" },
  { value: "failure", label: "遭遇挫折时" },
];

// 模拟信件数据
const MOCK_LETTERS: Letter[] = [
  {
    id: "1",
    type: "incoming",
    title: "致三个月后的自己",
    content: `亲爱的未来的我：

当你读到这封信的时候，应该已经是春天了吧。我现在正处于一个艰难的决策期，关于是否要接受那个新的工作机会。

我知道你现在可能已经做出了选择，无论结果如何，我想告诉你：你已经足够勇敢了。

记住，成长从来不是一帆风顺的。无论你现在在哪里，都是最好的安排。

带着希望，
过去的你`,
    emotion: "hopeful",
    triggerType: "date",
    triggerValue: "2024-06-15",
    createdAt: "2024-03-15",
    deliveryDate: "2024-06-15",
    status: "delivered",
    deliveredAt: "2024-06-15",
    readAt: "2024-06-15",
    prediction: "我预测自己会接受新工作，并且会很快适应新环境。",
    reality: "我确实接受了新工作，虽然适应期比预想的长，但现在已经很享受这份工作了。",
    councilNotes: [
      { role: "激进派", note: "去吧！新机会意味着新可能，不要让恐惧束缚你。" },
      { role: "保守派", note: "仔细权衡利弊，确保有备选方案。" },
    ],
  },
  {
    id: "2",
    type: "outgoing",
    title: "当你再次感到迷茫时",
    content: `给迷茫中的自己：

如果你正在读这封信，说明AI检测到你又陷入了迷茫的状态。

请停下来，深呼吸三次。

记住，迷茫是成长的前奏，不是终点。你曾经无数次穿越迷雾，找到方向。这一次也不会例外。

去散个步，看看天空，和朋友聊聊天。答案会在你放松的时候悄然出现。

永远相信你，
此刻清醒的你`,
    emotion: "reflective",
    triggerType: "emotion",
    triggerValue: "lost",
    createdAt: "2024-04-01",
    deliveryDate: "待触发",
    status: "scheduled",
  },
  {
    id: "3",
    type: "incoming",
    title: "生日那天打开",
    content: `生日快乐，未来的我！

又长大了一岁呢。回顾过去的一年，你经历了很多：

- 完成了那个困难的项目
- 学会了如何更好地表达情绪
- 和家人的关系更近了

新的一岁，希望你能：
1. 更多地关爱自己
2. 勇敢追求想要的生活
3. 保持对世界的好奇心

送你一个小目标：每周至少有一天完全属于自己。

爱你的，
去年的你`,
    emotion: "grateful",
    triggerType: "event",
    triggerValue: "birthday",
    createdAt: "2023-08-20",
    deliveryDate: "2024-08-20",
    status: "scheduled",
  },
  {
    id: "4",
    type: "outgoing",
    title: "当你想要放弃时",
    content: `坚持中的自己：

我知道你现在很累，想要放弃。

但请记住，你开始这件事是有原因的。那个原因还在吗？如果在，请再坚持一下。

想想你已经走了多远，不要在接近终点时停下。

你比你想象的更强大。

永不言弃，
曾经的你`,
    emotion: "determined",
    triggerType: "emotion",
    triggerValue: "tired",
    createdAt: "2024-02-10",
    deliveryDate: "待触发",
    status: "scheduled",
  },
  {
    id: "5",
    type: "incoming",
    title: "关于那个重要决定",
    content: `思考中的自己：

当你收到这封信时，应该正在为那个重要决定纠结吧。

我想分享一些当时的想法：

无论你选择什么，都会有遗憾。但选择本身就是一种勇气。相信你的直觉，它通常是对的。

如果实在难以决定，就问问自己：十年后的你会感谢哪个选择？

祝你好运，
一个月前的你`,
    emotion: "anxious",
    triggerType: "event",
    triggerValue: "decision",
    createdAt: "2024-04-15",
    deliveryDate: "2024-05-15",
    status: "delivered",
    deliveredAt: "2024-05-15",
    readAt: "2024-05-15",
    prediction: "我猜你会选择更有挑战性的那个选项。",
    reality: "确实如此，虽然过程艰难，但很有成就感。",
  },
];

// 时间线节点数据（用于时间长河）- 与信件关联
interface TimelineNode {
  id: string;
  year: string;
  quarter?: string;
  letters: { id: string; status: "read" | "waiting"; emotion: string; letterId: string }[];
  type: "past" | "now" | "future";
}

interface FutureLettersProps {
  onBack: () => void;
}

type EmotionApiResponse = {
  label: "calm" | "anxious" | "sad" | "happy" | "excited";
  score: number;
};

const EMOTION_DELIVERY_THRESHOLD = 0.72;
const LETTERS_STORAGE_KEY = "letters.v1";
const LEGACY_LETTERS_STORAGE_KEY = "letters.letters.v1";

export function FutureLetters({ onBack }: FutureLettersProps) {
  const perf = usePerformanceProfile();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [activeMode, setActiveMode] = useState<"inbox" | "outbox">("inbox");
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompose, setShowCompose] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [triggerEmotionDraft, setTriggerEmotionDraft] = useState("");
  const [triggerEventDraft, setTriggerEventDraft] = useState("");
  const [emotionProbeText, setEmotionProbeText] = useState("");
  const [emotionProbeResult, setEmotionProbeResult] = useState<EmotionApiResponse | null>(null);
  const [triggerHint, setTriggerHint] = useState<string>("");
  const persistLetters = (next: Letter[]) => {
    void storageSet(LETTERS_STORAGE_KEY, next);
    void storageSet(LEGACY_LETTERS_STORAGE_KEY, next);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const savedPrimary = await storageGet<Letter[]>(LETTERS_STORAGE_KEY, []);
      const savedLegacy = savedPrimary.length > 0 ? [] : await storageGet<Letter[]>(LEGACY_LETTERS_STORAGE_KEY, []);
      const saved = savedPrimary.length > 0 ? savedPrimary : savedLegacy;
      if (cancelled) return;
      if (saved.length > 0) {
        // 兼容旧数据：isDelivered -> status
        const migrated = saved.map((l) => {
          const anyL = l as unknown as { isDelivered?: boolean; reply?: string };
          if (typeof (l as Letter).status === "string") return l;
          const delivered = Boolean(anyL.isDelivered);
          const next: Letter = {
            ...(l as Omit<Letter, "status">),
            status: delivered ? "delivered" : "scheduled",
          } as Letter;
          if (delivered) next.deliveredAt = next.deliveryDate && next.deliveryDate !== "待触发" ? next.deliveryDate : undefined;
          return next;
        });
        setLetters(migrated);
        const latestDelivered = migrated.find((l) => l.type === "incoming" && l.status === "delivered");
        if (latestDelivered) {
          setActiveMode("inbox");
          setSelectedLetter(latestDelivered);
        }
        persistLetters(migrated);
        return;
      }
      setLetters(MOCK_LETTERS);
      const latestDelivered = MOCK_LETTERS.find((l) => l.type === "incoming" && l.status === "delivered");
      if (latestDelivered) {
        setActiveMode("inbox");
        setSelectedLetter(latestDelivered);
      }
      persistLetters(MOCK_LETTERS);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const buildIncomingFromOutgoing = (outgoing: Letter, deliveredAt: string, meta?: { triggerExplain?: string }) => {
    const nowId = `in-${outgoing.id}-${deliveredAt}`;
    const threadId = outgoing.threadId ?? outgoing.id;
    const incoming: Letter = {
      id: nowId,
      type: "incoming",
      title: outgoing.title,
      content: outgoing.content,
      emotion: outgoing.emotion,
      triggerType: outgoing.triggerType,
      triggerValue: outgoing.triggerValue,
      createdAt: outgoing.createdAt,
      deliveryDate: deliveredAt,
      status: "delivered",
      threadId,
      deliveredAt,
    };
    if (meta?.triggerExplain) {
      incoming.councilNotes = [{ role: "系统", note: meta.triggerExplain }];
    }
    return incoming;
  };

  const deliverOutgoingBatch = (input: { outgoingIds: string[]; deliveredAt: string; explain: string }) => {
    if (input.outgoingIds.length === 0) return;
    setLetters((prev) => {
      const idSet = new Set(input.outgoingIds);
      const existingIds = new Set(prev.map((l) => l.id));
      const incomings: Letter[] = [];
      const updated = prev.map((l) => {
        if (!idSet.has(l.id)) return l;
        if (l.type !== "outgoing" || l.status === "delivered") return l;
        const out = { ...l, status: "delivered" as const, deliveredAt: input.deliveredAt };
        const inc = buildIncomingFromOutgoing(out, input.deliveredAt, { triggerExplain: input.explain });
        if (!existingIds.has(inc.id)) incomings.push(inc);
        return out;
      });
      const next = [...incomings, ...updated];
      persistLetters(next);
      // 自动聚焦到最新送达的一封
      if (incomings.length > 0) {
        setActiveMode("inbox");
        setSelectedLetter(incomings[0]);
      }
      return next;
    });
  };

  const tryDeliverByDate = () => {
    const dueIds = letters
      .filter(
        (l) =>
          l.type === "outgoing" &&
          l.triggerType === "date" &&
          l.status !== "delivered" &&
          l.deliveryDate !== "待触发" &&
          typeof l.deliveryDate === "string" &&
          l.deliveryDate <= todayStr,
      )
      .map((l) => l.id);
    deliverOutgoingBatch({ outgoingIds: dueIds, deliveredAt: todayStr, explain: "日期触发：到期自动送达。" });
  };

  useEffect(() => {
    if (letters.length === 0) return;
    // Day11：日期触发自动送达
    tryDeliverByDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letters.length]);

  // 筛选信件
  const filteredLetters = letters.filter((letter) => {
    if (activeMode === "inbox" && letter.type !== "incoming") return false;
    if (activeMode === "outbox" && letter.type !== "outgoing") return false;
    if (searchQuery && !letter.title.includes(searchQuery) && !letter.content.includes(searchQuery)) return false;
    return true;
  });

  const selectedThreadLetters = useMemo(() => {
    if (!selectedLetter) return [];
    const threadId = selectedLetter.threadId ?? selectedLetter.id;
    return letters
      .filter((l) => (l.threadId ?? l.id) === threadId)
      .sort((a, b) => `${a.createdAt}-${a.id}`.localeCompare(`${b.createdAt}-${b.id}`));
  }, [letters, selectedLetter]);

  const openLetter = (letter: Letter) => {
    setSelectedLetter(letter);
    // 打开收件箱已送达信件时，标记已读并同步时间长河状态
    if (letter.type === "incoming" && letter.status === "delivered" && !letter.readAt) {
      const readAt = todayStr;
      setLetters((prev) => {
        const next = prev.map((l) => (l.id === letter.id ? { ...l, readAt } : l));
        persistLetters(next);
        return next;
      });
      setSelectedLetter((prev) => (prev && prev.id === letter.id ? { ...prev, readAt } : prev));
    }
  };

  const handleDeleteLetter = (letter: Letter) => {
    const ok = window.confirm("确认删除这封信吗？此操作不可撤销。");
    if (!ok) return;
    setLetters((prev) => {
      const next = prev.filter((l) => l.id !== letter.id);
      persistLetters(next);
      return next;
    });
    setSelectedLetter((prev) => (prev?.id === letter.id ? null : prev));
  };

  const handleCreateLetter = (letter: Letter) => {
    setLetters((prev) => {
      const next = [letter, ...prev];
      persistLetters(next);
      return next;
    });
    setActiveMode(letter.type === "incoming" ? "inbox" : "outbox");
    setSelectedLetter(letter);
  };

  const handleSaveReply = (letterId: string, reply: string, replyEmotion: Letter["emotion"]) => {
    const base = letters.find((l) => l.id === letterId);
    if (!base) return;
    const threadId = base.threadId ?? base.id;
    const now = new Date();
    const createdAt = now.toISOString().slice(0, 10);
    const replyLetter: Letter = {
      id: `${now.getTime()}-reply`,
      type: "outgoing",
      title: `回信：${base.title}`,
      content: reply.trim(),
      emotion: replyEmotion,
      triggerType: "event",
      triggerValue: "delivery",
      createdAt,
      deliveryDate: "待触发",
      status: "scheduled",
      threadId,
    };

    setLetters((prev) => {
      const next = [replyLetter, ...prev].map((l) => (l.id === letterId ? { ...l, status: "replied" } : l));
      persistLetters(next);
      return next;
    });
    setSelectedLetter((prev) => (prev && prev.id === letterId ? { ...prev, status: "replied" } : prev));
  };

  // 计算倒计时
  const getCountdown = (deliveryDate: string) => {
    if (deliveryDate === "待触发") return "智能触发";
    const now = new Date();
    const delivery = new Date(deliveryDate);
    const diff = delivery.getTime() - now.getTime();
    if (diff <= 0) return "已送达";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 30) return `${Math.floor(days / 30)}个月后`;
    return `${days}天后`;
  };

  // 背景粒子
  const particles = Array.from({ length: perf.lowPerformanceMode ? 10 : 30 }).map((_, i) => ({
    x: ((i * 37 + 13) % 100),
    y: ((i * 41 + 17) % 100),
    size: ((i * 7 + 3) % 3) + 1,
    duration: 15 + ((i * 11) % 20),
    delay: ((i * 19) % 10),
  }));

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* 深空背景 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0A0F1A] via-[#0D1420] to-[#0F1A2F]" />

      {/* 背景粒子 */}
      {particles.map((particle, i) =>
        perf.lowPerformanceMode ? (
          <div
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={{
              width: particle.size,
              height: particle.size,
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              backgroundColor: i % 3 === 0 ? "rgba(251, 191, 36, 0.35)" : "rgba(168, 85, 247, 0.25)",
              opacity: 0.18,
            }}
          />
        ) : (
          <motion.div
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={{
              width: particle.size,
              height: particle.size,
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              backgroundColor: i % 3 === 0 ? "rgba(251, 191, 36, 0.4)" : "rgba(168, 85, 247, 0.3)",
              opacity: 0.2,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              delay: particle.delay,
              ease: "easeInOut",
            }}
          />
        ),
      )}

      {/* 主内容区 */}
      <div className="relative z-10 h-full flex flex-col">
        {/* 顶部导航栏 */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <motion.button
              onClick={onBack}
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
              whileHover={perf.lowPerformanceMode ? undefined : { x: -2 }}
            >
              <ArrowLeft className="w-5 h-5" />
              <span>返回</span>
            </motion.button>
            <div className="w-px h-6 bg-white/20" />
            <h1 className="text-xl font-light text-white">未来信件</h1>
          </div>

          {/* 模式切换和时间线入口 */}
          <div className="flex items-center gap-4">
            {/* 触发模拟（Day11：情绪/事件触发可演示） */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-full border border-white/20"
                 style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <span className="text-xs text-white/50">触发模拟</span>
              <Select value={triggerEmotionDraft} onValueChange={(v) => setTriggerEmotionDraft(v)}>
                <SelectTrigger className="h-7 px-2 rounded-lg bg-black/30 border border-white/10 text-xs text-white">
                  <SelectValue placeholder="情绪…" />
                </SelectTrigger>
                <SelectContent className="border-white/15 bg-[#0E1629]/95 backdrop-blur-xl text-white">
                  {EMOTION_TRIGGERS.map((t) => (
                    <SelectItem key={`emo-${t.value}`} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => {
                  const emo = triggerEmotionDraft.trim();
                  if (!emo) return;
                  const candidates = letters.filter(
                    (l) => l.type === "outgoing" && l.triggerType === "emotion" && l.status !== "delivered" && l.triggerValue === emo,
                  );
                  if (candidates.length === 0) {
                    setTriggerHint("没有匹配该情绪的待送达信件");
                    window.setTimeout(() => setTriggerHint(""), 1800);
                    return;
                  }
                  deliverOutgoingBatch({
                    outgoingIds: candidates.map((c) => c.id),
                    deliveredAt: todayStr,
                    explain: `情绪触发：检测到「${emo}」后送达。`,
                  });
                  setTriggerHint(`已送达 ${candidates.length} 封（情绪触发）`);
                  window.setTimeout(() => setTriggerHint(""), 1800);
                }}
                className="px-2 py-1 rounded-lg text-xs text-white/70 hover:text-white border border-white/10 hover:border-white/20"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                触发
              </button>

              <Select value={triggerEventDraft} onValueChange={(v) => setTriggerEventDraft(v)}>
                <SelectTrigger className="h-7 px-2 rounded-lg bg-black/30 border border-white/10 text-xs text-white">
                  <SelectValue placeholder="事件…" />
                </SelectTrigger>
                <SelectContent className="border-white/15 bg-[#0E1629]/95 backdrop-blur-xl text-white">
                  {EVENT_TRIGGERS.map((t) => (
                    <SelectItem key={`evt-${t.value}`} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => {
                  const evt = triggerEventDraft.trim();
                  if (!evt) return;
                  const candidates = letters.filter(
                    (l) => l.type === "outgoing" && l.triggerType === "event" && l.status !== "delivered" && l.triggerValue === evt,
                  );
                  if (candidates.length === 0) {
                    setTriggerHint("没有匹配该事件的待送达信件");
                    window.setTimeout(() => setTriggerHint(""), 1800);
                    return;
                  }
                  deliverOutgoingBatch({
                    outgoingIds: candidates.map((c) => c.id),
                    deliveredAt: todayStr,
                    explain: `事件触发：发生「${evt}」后送达。`,
                  });
                  setTriggerHint(`已送达 ${candidates.length} 封（事件触发）`);
                  window.setTimeout(() => setTriggerHint(""), 1800);
                }}
                className="px-2 py-1 rounded-lg text-xs text-white/70 hover:text-white border border-white/10 hover:border-white/20"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                触发
              </button>

              <input
                type="text"
                value={emotionProbeText}
                onChange={(e) => setEmotionProbeText(e.target.value)}
                placeholder="输入当前感受…"
                className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-xs text-white placeholder:text-white/40 min-w-[160px]"
              />
              <button
                type="button"
                onClick={async () => {
                  const text = emotionProbeText.trim();
                  if (!text) return;
                  try {
                    const data = await fetchJson<EmotionApiResponse>("/api/emotion", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text, inputMode: "text" }),
                      timeoutMs: 15_000,
                    });
                    setEmotionProbeResult(data);
                    const candidates = letters.filter(
                      (l) =>
                        l.type === "outgoing" &&
                        l.triggerType === "emotion" &&
                        l.status !== "delivered" &&
                        l.triggerValue === data.label,
                    );
                    if (data.score >= EMOTION_DELIVERY_THRESHOLD && candidates.length > 0) {
                      deliverOutgoingBatch({
                        outgoingIds: candidates.map((c) => c.id),
                        deliveredAt: todayStr,
                        explain: `情绪触发：检测到「${data.label}」且分数 ${(data.score * 100).toFixed(0)}%。`,
                      });
                      setTriggerHint(`检测到 ${data.label}(${(data.score * 100).toFixed(0)}%)，已送达 ${candidates.length} 封`);
                    } else if (candidates.length === 0) {
                      setTriggerHint(`检测到 ${data.label}(${(data.score * 100).toFixed(0)}%)，暂无匹配信件`);
                    } else {
                      setTriggerHint(`检测到 ${data.label}(${(data.score * 100).toFixed(0)}%)，未达到阈值 ${(EMOTION_DELIVERY_THRESHOLD * 100).toFixed(0)}%`);
                    }
                    window.setTimeout(() => setTriggerHint(""), 2200);
                  } catch (e) {
                    clientLog("warn", "letters.emotionProbe", "failed", { detail: String(e) });
                    setEmotionProbeResult(null);
                    setTriggerHint(userFacingMessage(e));
                    window.setTimeout(() => setTriggerHint(""), 2200);
                  }
                }}
                className="px-2 py-1 rounded-lg text-xs text-white/70 hover:text-white border border-white/10 hover:border-white/20"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                检测并触发
              </button>
              {emotionProbeResult && (
                <span className="text-xs text-white/60">
                  {emotionProbeResult.label} {(emotionProbeResult.score * 100).toFixed(0)}%
                </span>
              )}
            </div>

            {/* 时间长河入口 */}
            <motion.button
              onClick={() => setShowTimeline(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-white/60 hover:text-[#60a5fa] transition-colors"
              style={{ backgroundColor: "rgba(96, 165, 250, 0.1)", border: "1px solid rgba(96, 165, 250, 0.2)" }}
              whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.05, boxShadow: "0 0 20px rgba(96, 165, 250, 0.3)" }}
              whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.98 }}
            >
              <Waves className="w-4 h-4" />
              <span>时间长河</span>
            </motion.button>

            {/* 收发件切换 */}
            <div className="flex items-center gap-1 p-1 rounded-full border border-white/20"
                 style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              {[
                { id: "inbox", label: "收件箱", icon: Mail },
                { id: "outbox", label: "发件箱", icon: Send },
              ].map((mode) => (
                <motion.button
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id as typeof activeMode)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all ${
                    activeMode === mode.id
                      ? "text-[#fbbf24]"
                      : "text-white/60 hover:text-white"
                  }`}
                  style={{
                    backgroundColor: activeMode === mode.id ? "rgba(251, 191, 36, 0.15)" : "transparent",
                  }}
                  whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.02 }}
                  whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.98 }}
                >
                  <mode.icon className="w-4 h-4" />
                  <span>{mode.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* 新建信件按钮 */}
          <motion.button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm"
            style={{
              backgroundColor: "rgba(251, 191, 36, 0.2)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              color: "#fbbf24",
            }}
            whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.05, boxShadow: "0 0 20px rgba(251, 191, 36, 0.3)" }}
            whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.98 }}
          >
            <Plus className="w-4 h-4" />
            <span>写信给未来</span>
          </motion.button>
        </header>

        {triggerHint && (
          <div className="px-6 py-2 text-xs text-amber-300 border-b border-white/10" style={{ backgroundColor: "rgba(251, 191, 36, 0.06)" }}>
            {triggerHint}
          </div>
        )}

        {/* 两栏布局 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：信件列表 */}
          <div className="w-[320px] border-r border-white/10 flex flex-col"
               style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
            {/* 搜索栏 */}
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="搜索信件..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg text-sm text-white placeholder:text-white/40 border border-white/10 focus:border-[#fbbf24]/50 focus:outline-none transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                />
              </div>
            </div>

            {/* 信件列表 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredLetters.map((letter) => (
                <motion.div
                  key={letter.id}
                  onClick={() => openLetter(letter)}
                  className={`relative p-4 rounded-xl cursor-pointer transition-all ${
                    selectedLetter?.id === letter.id ? "ring-1 ring-[#fbbf24]/50" : ""
                  }`}
                  style={{
                    backgroundColor: selectedLetter?.id === letter.id 
                      ? "rgba(251, 191, 36, 0.1)" 
                      : "rgba(255,255,255,0.03)",
                    backdropFilter: perf.lowPerformanceMode ? undefined : "blur(10px)",
                  }}
                  whileHover={
                    perf.lowPerformanceMode
                      ? undefined
                      : { scale: 1.02, backgroundColor: "rgba(251, 191, 36, 0.08)" }
                  }
                >
                  {/* 火漆印章图标 */}
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
                       style={{ 
                         backgroundColor: "rgba(251, 191, 36, 0.9)",
                         boxShadow: "0 2px 8px rgba(251, 191, 36, 0.4)",
                       }}>
                    <Stamp className="w-4 h-4 text-[#0A0F1A]" />
                  </div>

                  {/* 信件信息 */}
                  <div className="pr-6">
                    <h3 className="text-sm font-medium text-white truncate">{letter.title}</h3>
                    <p className="text-xs text-white/50 mt-1 line-clamp-2">{letter.content.slice(0, 50)}...</p>
                  </div>

                  {/* 底部信息 */}
                  <div className="flex items-center justify-between mt-3">
                    {/* 情绪标签 */}
                    <span 
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{
                        backgroundColor: emotionColors[letter.emotion].bg,
                        color: emotionColors[letter.emotion].text,
                      }}
                    >
                      {emotionLabels[letter.emotion]}
                    </span>

                    {/* 倒计时 */}
                    <span className="text-xs text-white/40 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getCountdown(letter.deliveryDate)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 右侧：信件阅读区 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              {selectedLetter ? (
                <motion.div
                  key={selectedLetter.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex-1 overflow-y-auto p-8"
                >
                  {/* 羊皮纸信件容器 */}
                  <div 
                    className="max-w-2xl mx-auto rounded-2xl p-8 relative"
                    style={{
                      background: "linear-gradient(135deg, rgba(251, 235, 215, 0.08) 0%, rgba(245, 222, 179, 0.05) 100%)",
                      border: "2px solid rgba(251, 191, 36, 0.3)",
                      boxShadow: "0 0 40px rgba(251, 191, 36, 0.1), inset 0 0 60px rgba(251, 191, 36, 0.05)",
                    }}
                  >
                    {/* 烫金边框装饰 */}
                    <div className="absolute inset-4 border border-[#fbbf24]/20 rounded-xl pointer-events-none" />

                    {/* 信件头部 */}
                    <div className="mb-6 pb-4 border-b border-[#fbbf24]/20">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-2xl font-light text-white">{selectedLetter.title}</h2>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteLetter(selectedLetter)}
                            className="p-2 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors"
                            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                            title="删除信件"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <span 
                            className="px-3 py-1 rounded-full text-sm"
                            style={{
                              backgroundColor: emotionColors[selectedLetter.emotion].bg,
                              color: emotionColors[selectedLetter.emotion].text,
                              boxShadow: emotionColors[selectedLetter.emotion].glow,
                            }}
                          >
                            {emotionLabels[selectedLetter.emotion]}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-white/50">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          写于 {selectedLetter.createdAt}
                        </span>
                        <span className="flex items-center gap-1">
                          {selectedLetter.triggerType === "date" && <Clock className="w-4 h-4" />}
                          {selectedLetter.triggerType === "emotion" && <Heart className="w-4 h-4" />}
                          {selectedLetter.triggerType === "event" && <Zap className="w-4 h-4" />}
                          {selectedLetter.triggerType === "date" && `送达于 ${selectedLetter.deliveryDate}`}
                          {selectedLetter.triggerType === "emotion" && `触发条件：${EMOTION_TRIGGER_LABEL_MAP[selectedLetter.triggerValue] || selectedLetter.triggerValue}`}
                          {selectedLetter.triggerType === "event" && `触发事件：${EVENT_TRIGGERS.find(e => e.value === selectedLetter.triggerValue)?.label || selectedLetter.triggerValue}`}
                        </span>
                      </div>
                    </div>

                    {/* 信件内容 */}
                    <div 
                      className="text-white/80 leading-relaxed whitespace-pre-line mb-6"
                      style={{ fontFamily: "'Georgia', serif" }}
                    >
                      {selectedLetter.content}
                    </div>

                    {/* 议会注释 */}
                    {selectedLetter.councilNotes && selectedLetter.councilNotes.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-[#fbbf24]/20">
                        <h4 className="text-sm font-medium text-[#fbbf24] mb-3 flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          议会建议
                        </h4>
                        <div className="space-y-2">
                          {selectedLetter.councilNotes.map((note, i) => (
                            <div key={i} className="flex gap-3 text-sm">
                              <span className="text-[#a855f7] font-medium">{note.role}：</span>
                              <span className="text-white/60">{note.note}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* 预测与现实对比 */}
                    {selectedLetter.status === "delivered" && selectedLetter.prediction && (
                      <div className="mt-6 pt-4 border-t border-[#fbbf24]/20">
                        <h4 className="text-sm font-medium text-[#fbbf24] mb-3 flex items-center gap-2">
                          <Target className="w-4 h-4" />
                          预测与现实
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(168, 85, 247, 0.1)" }}>
                            <div className="text-xs text-[#a855f7] mb-1">当时的预测</div>
                            <div className="text-sm text-white/70">{selectedLetter.prediction}</div>
                          </div>
                          <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(74, 222, 128, 0.1)" }}>
                            <div className="text-xs text-[#4ade80] mb-1">实际情况</div>
                            <div className="text-sm text-white/70">{selectedLetter.reality}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 回信按钮 */}
                    {selectedLetter.status === "delivered" && (
                      <div className="mt-6 pt-4 border-t border-[#fbbf24]/20">
                        <motion.button
                          onClick={() => setShowReply(true)}
                          className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                          style={{
                            backgroundColor: "rgba(168, 85, 247, 0.2)",
                            border: "1px solid rgba(168, 85, 247, 0.3)",
                            color: "#a855f7",
                          }}
                          whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(168, 85, 247, 0.3)" }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Send className="w-4 h-4" />
                          回信给过去的自己
                        </motion.button>
                      </div>
                    )}

                    {selectedThreadLetters.length > 1 && (
                      <div className="mt-6 pt-4 border-t border-[#fbbf24]/20">
                        <h4 className="text-sm font-medium text-[#fbbf24] mb-3">时空线程</h4>
                        <div className="space-y-2">
                          {selectedThreadLetters.map((l) => (
                            <button
                              type="button"
                              key={`thread-${l.id}`}
                              onClick={() => openLetter(l)}
                              className="w-full text-left p-3 rounded-xl border border-white/10 hover:border-[#fbbf24]/30"
                              style={{ backgroundColor: selectedLetter.id === l.id ? "rgba(251, 191, 36, 0.1)" : "rgba(255,255,255,0.03)" }}
                            >
                              <div className="text-sm text-white">{l.title}</div>
                              <div className="text-xs text-white/50 mt-1">
                                {l.type === "incoming" ? "收信" : "回信"} · {l.createdAt}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex items-center justify-center"
                >
                  <div className="text-center text-white/40">
                    <Mail className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>选择一封信件阅读</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 写信弹窗 */}
      <AnimatePresence>
        {showCompose && (
          <ComposeModal
            onClose={() => setShowCompose(false)}
            onCreate={(letter) => {
              handleCreateLetter(letter);
              setShowCompose(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* 回信弹窗 */}
      <AnimatePresence>
        {showReply && selectedLetter && (
          <ReplyModal 
            letter={selectedLetter} 
            onClose={() => setShowReply(false)}
            onSave={(reply) => {
              handleSaveReply(selectedLetter.id, reply.content, reply.emotion);
              setShowReply(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* 时间长河弹窗 */}
      <AnimatePresence>
        {showTimeline && (
          <TimelineRiver 
            onClose={() => setShowTimeline(false)}
            letters={letters}
            onSelectLetter={(letter) => {
              openLetter(letter);
              setShowTimeline(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// 写信弹窗组件
function ComposeModal({ onClose, onCreate }: { onClose: () => void; onCreate: (letter: Letter) => void }) {
  const [triggerType, setTriggerType] = useState<"date" | "emotion" | "event">("date");
  const [selectedEmotion, setSelectedEmotion] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [letterEmotion, setLetterEmotion] = useState<Letter["emotion"]>("hopeful");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleSubmit = () => {
    const t = title.trim();
    const c = content.trim();
    if (!t || !c) {
      onClose();
      return;
    }

    const now = new Date();
    const createdAt = now.toISOString().slice(0, 10);
    const triggerValue =
      triggerType === "date" ? deliveryDate : triggerType === "emotion" ? selectedEmotion : selectedEvent;
    const isValid =
      triggerType === "date"
        ? Boolean(deliveryDate)
        : triggerType === "emotion"
          ? Boolean(selectedEmotion)
          : Boolean(selectedEvent);

    if (!isValid) {
      onClose();
      return;
    }

    const letter: Letter = {
      id: now.getTime().toString(),
      type: "outgoing",
      title: t,
      content: c,
      emotion: letterEmotion,
      triggerType,
      triggerValue,
      createdAt,
      deliveryDate: triggerType === "date" ? deliveryDate : "待触发",
      status: "scheduled",
      threadId: undefined,
    };

    onCreate(letter);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{
          background: "linear-gradient(135deg, rgba(15, 26, 47, 0.98) 0%, rgba(10, 15, 26, 0.98) 100%)",
          border: "1px solid rgba(251, 191, 36, 0.3)",
          boxShadow: "0 0 60px rgba(251, 191, 36, 0.1)",
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-light text-white">写给未来的信</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 触发类型选择 */}
        <div className="mb-6">
          <label className="text-sm text-white/60 mb-2 block">送达方式</label>
          <div className="flex gap-2">
            {[
              { id: "date", label: "指定日期", icon: Calendar },
              { id: "emotion", label: "情绪触发", icon: Heart },
              { id: "event", label: "事件触发", icon: Zap },
            ].map((type) => (
              <motion.button
                key={type.id}
                onClick={() => setTriggerType(type.id as typeof triggerType)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-all ${
                  triggerType === type.id ? "text-[#fbbf24]" : "text-white/60"
                }`}
                style={{
                  backgroundColor: triggerType === type.id ? "rgba(251, 191, 36, 0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${triggerType === type.id ? "rgba(251, 191, 36, 0.3)" : "rgba(255,255,255,0.1)"}`,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <type.icon className="w-4 h-4" />
                {type.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 触发条件 */}
        <div className="mb-6">
          {triggerType === "date" && (
            <div>
              <label className="text-sm text-white/60 mb-2 block">选择送达日期</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white border border-white/10 focus:border-[#fbbf24]/50 focus:outline-none transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              />
            </div>
          )}
          {triggerType === "emotion" && (
            <div>
              <label className="text-sm text-white/60 mb-2 block">选择触发情绪</label>
              <div className="mt-1">
                <Select value={selectedEmotion} onValueChange={(v) => setSelectedEmotion(v)}>
                  <SelectTrigger className="w-full h-11 px-4 rounded-xl text-white border border-white/10 bg-white/5">
                    <SelectValue placeholder="请选择触发情绪" />
                  </SelectTrigger>
                  <SelectContent className="border-white/15 bg-[#0E1629]/95 backdrop-blur-xl text-white">
                    {EMOTION_TRIGGERS.map((trigger) => (
                      <SelectItem key={trigger.value} value={trigger.value}>
                        {trigger.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {triggerType === "event" && (
            <div>
              <label className="text-sm text-white/60 mb-2 block">选择触发事件</label>
              <div className="mt-1">
                <Select value={selectedEvent} onValueChange={(v) => setSelectedEvent(v)}>
                  <SelectTrigger className="w-full h-11 px-4 rounded-xl text-white border border-white/10 bg-white/5">
                    <SelectValue placeholder="请选择触发事件" />
                  </SelectTrigger>
                  <SelectContent className="border-white/15 bg-[#0E1629]/95 backdrop-blur-xl text-white">
                    {EVENT_TRIGGERS.map((trigger) => (
                      <SelectItem key={trigger.value} value={trigger.value}>
                        {trigger.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* 信件情绪 */}
        <div className="mb-6">
          <label className="text-sm text-white/60 mb-2 block">信件情绪</label>
          <div className="flex gap-2">
            {Object.entries(emotionLabels).map(([key, label]) => (
              <motion.button
                key={key}
                onClick={() => setLetterEmotion(key as Letter["emotion"])}
                className={`px-4 py-2 rounded-full text-sm transition-all`}
                style={{
                  backgroundColor: letterEmotion === key ? emotionColors[key].bg : "rgba(255,255,255,0.05)",
                  color: letterEmotion === key ? emotionColors[key].text : "rgba(255,255,255,0.6)",
                  border: `1px solid ${letterEmotion === key ? emotionColors[key].text : "rgba(255,255,255,0.1)"}`,
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 标题 */}
        <div className="mb-4">
          <label className="text-sm text-white/60 mb-2 block">信件标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给这封信取个名字..."
            className="w-full px-4 py-3 rounded-xl text-white placeholder:text-white/30 border border-white/10 focus:border-[#fbbf24]/50 focus:outline-none transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          />
        </div>

        {/* 内容 */}
        <div className="mb-6">
          <label className="text-sm text-white/60 mb-2 block">信件内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="亲爱的未来的我..."
            rows={8}
            className="w-full px-4 py-3 rounded-xl text-white placeholder:text-white/30 border border-white/10 focus:border-[#fbbf24]/50 focus:outline-none transition-colors resize-none"
            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          />
        </div>

        {/* 底部��钮 */}
        <div className="flex gap-3">
          <motion.button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm text-white/60 hover:text-white transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            取消
          </motion.button>
          <motion.button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            style={{
              backgroundColor: "rgba(251, 191, 36, 0.2)",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              color: "#fbbf24",
            }}
            whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(251, 191, 36, 0.3)" }}
            whileTap={{ scale: 0.98 }}
          >
            <Send className="w-4 h-4" />
            封存并寄出
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 回信弹窗组件
function ReplyModal({
  letter,
  onClose,
  onSave,
}: {
  letter: Letter;
  onClose: () => void;
  onSave: (payload: { content: string; emotion: Letter["emotion"] }) => void;
}) {
  const [replyEmotion, setReplyEmotion] = useState<Letter["emotion"]>("grateful");
  const [replyContent, setReplyContent] = useState("");

  const guidingQuestions = [
    "你当时的担心实现了吗？",
    "有什么是你现在明白但当时不懂的？",
    "你想对过去的自己说什么安慰的话？",
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{
          background: "linear-gradient(135deg, rgba(15, 26, 47, 0.98) 0%, rgba(10, 15, 26, 0.98) 100%)",
          border: "1px solid rgba(168, 85, 247, 0.3)",
          boxShadow: "0 0 60px rgba(168, 85, 247, 0.1)",
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-light text-white">回信给过去的自己</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 原信预览 */}
        <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="text-xs text-white/40 mb-2">原信摘要</div>
          <div className="text-sm text-white/70">{letter.content.slice(0, 150)}...</div>
        </div>

        {/* 引导问题 */}
        <div className="mb-6">
          <div className="text-sm text-white/60 mb-3">一些引导问题帮助你回顾：</div>
          <div className="space-y-2">
            {guidingQuestions.map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-white/50">
                <Sparkles className="w-4 h-4 text-[#a855f7] mt-0.5 flex-shrink-0" />
                <span>{q}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 当前情绪 */}
        <div className="mb-6">
          <label className="text-sm text-white/60 mb-2 block">你现在的心情</label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(emotionLabels).map(([key, label]) => (
              <motion.button
                key={key}
                onClick={() => setReplyEmotion(key as Letter["emotion"])}
                className={`px-4 py-2 rounded-full text-sm transition-all`}
                style={{
                  backgroundColor: replyEmotion === key ? emotionColors[key].bg : "rgba(255,255,255,0.05)",
                  color: replyEmotion === key ? emotionColors[key].text : "rgba(255,255,255,0.6)",
                  border: `1px solid ${replyEmotion === key ? emotionColors[key].text : "rgba(255,255,255,0.1)"}`,
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 回信内容 */}
        <div className="mb-6">
          <label className="text-sm text-white/60 mb-2 block">写给过去的自己</label>
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="亲爱的过去的我..."
            rows={8}
            className="w-full px-4 py-3 rounded-xl text-white placeholder:text-white/30 border border-white/10 focus:border-[#a855f7]/50 focus:outline-none transition-colors resize-none"
            style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          />
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3">
          <motion.button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm text-white/60 hover:text-white transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            取消
          </motion.button>
          <motion.button
            onClick={() => {
              const reply = replyContent.trim();
              if (!reply) {
                onClose();
                return;
              }
              onSave({ content: reply, emotion: replyEmotion });
            }}
            className="flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            style={{
              backgroundColor: "rgba(168, 85, 247, 0.2)",
              border: "1px solid rgba(168, 85, 247, 0.3)",
              color: "#a855f7",
            }}
            whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(168, 85, 247, 0.3)" }}
            whileTap={{ scale: 0.98 }}
          >
            <Send className="w-4 h-4" />
            保存回信
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// 时间长河组件
function TimelineRiver({ 
  onClose, 
  onSelectLetter,
  letters,
}: { 
  onClose: () => void;
  onSelectLetter: (letter: Letter) => void;
  letters: Letter[];
}) {
  const [selectedNodeLetters, setSelectedNodeLetters] = useState<TimelineNode["letters"] | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [showYearMail, setShowYearMail] = useState(false);
  const currentYear = new Date().getFullYear();
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(960);
  // 单一偏移量：所有元素共享这个位移，实现“整层画布”1:1 拖动
  const [offsetPx, setOffsetPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [futureBoundaryHint, setFutureBoundaryHint] = useState(false);
  const [dragSpeed, setDragSpeed] = useState(0);
  const ITEM_GAP_PX = 180;
  const OVERSCAN_ITEMS = 8; // 提前生成新内容，避免边缘突变

  const dragStartXRef = useRef<number | null>(null);
  const dragStartOffsetRef = useRef(0);
  const lastDragXRef = useRef<number | null>(null);
  const lastDragTimeRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const inertiaRafRef = useRef<number | null>(null);

  // 背景星光粒子
  const starParticles = Array.from({ length: 80 }).map((_, i) => ({
    id: i,
    x: ((i * 37 + 13) % 100),
    y: ((i * 41 + 17) % 100),
    size: ((i * 3 + 1) % 3) + 1,
    duration: 3 + ((i * 7) % 5),
    delay: ((i * 11) % 8),
  }));

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const update = () => setViewportWidth(el.clientWidth || 960);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (inertiaRafRef.current !== null) {
        window.cancelAnimationFrame(inertiaRafRef.current);
      }
    };
  }, []);

  // 点击节点显示信件列表
  const handleNodeClick = (node: TimelineNode) => {
    setSelectedYear(node.year);
    setSelectedNodeLetters(node.letters);
  };

  // 点击信件打开阅读
  const handleLetterClick = (letterId: string) => {
    const letter = letters.find(l => l.id === letterId);
    if (letter) {
      onSelectLetter(letter);
    }
  };

  const lettersByYear = useMemo(() => {
    const parseDate = (s: string) => {
      if (!s || s === "待触发") return null;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const out = new Map<number, TimelineNode["letters"]>();
    for (const l of letters) {
      if (l.type !== "outgoing") continue;
      const t = parseDate(l.deliveryDate) ?? parseDate(l.createdAt);
      if (!t) continue;
      const y = t.getFullYear();
      const arr = out.get(y) ?? [];
      arr.push({
        id: `${y}-${l.id}`,
        status: l.status === "delivered" ? "read" : "waiting",
        emotion: l.emotion,
        letterId: l.id,
      });
      out.set(y, arr);
    }
    return out;
  }, [letters]);

  const yearOptions = useMemo(() => {
    const halfCount = Math.ceil(viewportWidth / ITEM_GAP_PX / 2) + OVERSCAN_ITEMS;
    const riverYears = Array.from({ length: halfCount * 2 + 1 }).map((_, i) => currentYear - i);
    const yearsFromLetters = Array.from(lettersByYear.keys());
    const allYears = Array.from(new Set([...riverYears, ...yearsFromLetters])).sort((a, b) => b - a);
    return allYears.map(String);
  }, [viewportWidth, ITEM_GAP_PX, OVERSCAN_ITEMS, currentYear, lettersByYear]);

  const selectedYearNode = selectedYear ? { year: selectedYear, letters: lettersByYear.get(Number(selectedYear)) ?? [] } : null;

  const windowYears = useMemo(() => {
    const halfCount = Math.ceil(viewportWidth / ITEM_GAP_PX / 2) + OVERSCAN_ITEMS;
    // 只展示“当前年份往前”（不生成未来年份）
    // 初次打开：当前年份在最右端（baseX 接近视口右侧）
    const baseX = Math.max(140, viewportWidth - 160);
    const out: Array<{ year: number; letters: TimelineNode["letters"]; type: TimelineNode["type"]; x: number }> = [];
    for (let i = 0; i <= halfCount * 2; i++) {
      const y = currentYear - i;
      const x = baseX + offsetPx - i * ITEM_GAP_PX;
      const type: TimelineNode["type"] = y === currentYear ? "now" : "past";
      out.push({ year: y, letters: lettersByYear.get(y) ?? [], type, x });
    }
    return out;
  }, [viewportWidth, ITEM_GAP_PX, OVERSCAN_ITEMS, offsetPx, currentYear, lettersByYear]);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest?.("[data-clickable]")) return;
    if (inertiaRafRef.current !== null) {
      window.cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = offsetPx;
    lastDragXRef.current = e.clientX;
    lastDragTimeRef.current = performance.now();
    velocityRef.current = 0;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || dragStartXRef.current === null) return;
    const dx = e.clientX - dragStartXRef.current;
    // 1:1 实时跟手，不做惯性/吸附/回弹
    const rawNext = dragStartOffsetRef.current + dx;
    // 时间边界：最多只能到“当前年份”这个右端边界，不允许往未来方向拖（offset < 0）
    const next = Math.max(0, rawNext);
    const now = performance.now();
    if (lastDragXRef.current !== null && lastDragTimeRef.current !== null) {
      const dt = Math.max(8, now - lastDragTimeRef.current);
      const instV = (e.clientX - lastDragXRef.current) / dt;
      velocityRef.current = instV;
      setDragSpeed(Math.min(1, Math.abs(instV) * 0.55));
    }
    lastDragXRef.current = e.clientX;
    lastDragTimeRef.current = now;
    if (rawNext < 0) {
      setFutureBoundaryHint(true);
      window.setTimeout(() => setFutureBoundaryHint(false), 700);
    }
    setOffsetPx(next);
    e.preventDefault();
  };

  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    dragStartXRef.current = null;
    setIsDragging(false);
    const minOffset = 0;
    const maxOffset = 24000;
    let v = velocityRef.current * 24;
    const step = () => {
      setOffsetPx((prev) => {
        let next = prev + v;
        v *= 0.93;
        if (next < minOffset) {
          next = minOffset + (next - minOffset) * -0.35;
          v *= -0.38;
          setFutureBoundaryHint(true);
          window.setTimeout(() => setFutureBoundaryHint(false), 450);
        } else if (next > maxOffset) {
          next = maxOffset + (next - maxOffset) * -0.32;
          v *= -0.34;
        }
        if (Math.abs(v) < 0.02) {
          v = 0;
        }
        setDragSpeed((s) => Math.max(0, s * 0.9));
        return next;
      });
      if (Math.abs(v) >= 0.02) {
        inertiaRafRef.current = window.requestAnimationFrame(step);
      } else {
        inertiaRafRef.current = null;
      }
    };
    if (Math.abs(v) > 0.2) {
      inertiaRafRef.current = window.requestAnimationFrame(step);
    } else {
      setDragSpeed(0);
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-hidden select-none"
      style={{ 
        background: "linear-gradient(135deg, #050810 0%, #0A0F1A 50%, #0F1525 100%)",
      }}
    >
      {/* 深空背景星光粒子 */}
      {starParticles.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: star.size,
            height: star.size,
            left: `${star.x}%`,
            top: `${star.y}%`,
            backgroundColor: star.id % 4 === 0 
              ? "rgba(251, 191, 36, 0.6)" 
              : star.id % 3 === 0 
                ? "rgba(139, 92, 246, 0.5)"
                : "rgba(255, 255, 255, 0.4)",
            opacity: 0.2,
          }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            delay: star.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* 顶部操作栏 */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-20">
        <motion.button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-white/60 hover:text-white transition-colors"
          style={{ backgroundColor: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          data-clickable
        >
          <X className="w-4 h-4" />
          <span>关闭</span>
        </motion.button>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full"
             style={{ backgroundColor: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
          <Move className="w-4 h-4 text-white/40" />
          <span className="text-sm text-white/60">拖动探索时间长河</span>
        </div>
      </div>

      {/* 邮件模式按钮（固定在右侧边缘，不随拖动移动） */}
      <div className="absolute top-24 right-6 z-30 flex flex-col items-end gap-2" data-clickable>
        <motion.button
          type="button"
          onClick={() => setShowYearMail((v) => !v)}
          className="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/15 text-white/70 hover:text-white hover:border-white/25"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="邮件模式：按年份查看已发送信件"
        >
          <Mail className="w-5 h-5" />
        </motion.button>
        <AnimatePresence>
          {showYearMail && (
            <motion.div
              initial={{ opacity: 0, x: 10, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 10, scale: 0.98 }}
              className="w-[220px] rounded-2xl p-3 border border-white/15"
              style={{ backgroundColor: "rgba(6, 10, 18, 0.96)", backdropFilter: "blur(16px)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-white/50">按年份查看（已发送）</div>
                <button
                  type="button"
                  onClick={() => setShowYearMail(false)}
                  className="p-2 -m-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="取消邮件模式"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Select
                value={selectedYear ?? ""}
                onValueChange={(y) => {
                  setSelectedYear(y || null);
                  setSelectedNodeLetters(lettersByYear.get(Number(y)) ?? []);
                  if (y) {
                    const yr = Number(y);
                    const i = Math.max(0, currentYear - yr);
                    const baseX = Math.max(140, viewportWidth - 160);
                    const targetX = viewportWidth * 0.52;
                    const raw = targetX - baseX + i * ITEM_GAP_PX;
                    const clamped = Math.max(0, Math.min(24000, raw));
                    setOffsetPx(clamped);
                  }
                }}
              >
                <SelectTrigger className="w-full rounded-xl bg-black/30 border border-white/10 text-sm text-white">
                  <SelectValue placeholder="选择年份…" />
                </SelectTrigger>
                <SelectContent className="border-white/15 bg-[#0E1629]/95 backdrop-blur-xl text-white">
                  {yearOptions.map((y) => (
                    <SelectItem key={`yopt-${y}`} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedYearNode && (
                <div className="mt-2 text-[11px] text-white/50">
                  {selectedYearNode.letters.length} 封信件
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 时间河：容器中心显示，星空背景固定；仅光带可拖动（横向），节点整体随光带移动 */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div
          ref={timelineRef}
          className="relative pointer-events-auto"
          style={{ width: "min(1100px, 92vw)", height: 180, touchAction: "none", overflow: "visible" }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onPointerLeave={onDragEnd}
        >
          {/* 未来边界视觉提示（到达今年上限） */}
          <AnimatePresence>
            {futureBoundaryHint && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs border border-amber-300/40 text-amber-200"
                style={{ backgroundColor: "rgba(251, 191, 36, 0.12)" }}
                data-clickable
              >
                已到当前年份边界（{currentYear}）
              </motion.div>
            )}
          </AnimatePresence>

          {/* 拖拽动效：边缘/河道响应（不影响 1:1 跟手） */}
          <div
            className="absolute inset-0 rounded-[28px] pointer-events-none"
            style={{
              boxShadow:
                offsetPx === 0
                  ? "inset 0 0 0 1px rgba(251,191,36,0.10), 0 0 28px rgba(251,191,36,0.10)"
                  : isDragging
                    ? "inset 0 0 0 1px rgba(168,85,247,0.18), 0 0 44px rgba(168,85,247,0.16)"
                    : "inset 0 0 0 1px rgba(168,85,247,0.12), 0 0 30px rgba(168,85,247,0.10)",
              opacity: 1,
            }}
          />

          {/* 曲线河道（正弦波）+ 多层材质 */}
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" viewBox={`0 0 ${viewportWidth} 180`} preserveAspectRatio="none">
            {(() => {
              const baseY = 90;
              const amp = 14 + dragSpeed * 18;
              const wavelength = 260;
              const phase = offsetPx * 0.03;
              let d = "";
              for (let x = -80; x <= viewportWidth + 80; x += 22) {
                const y = baseY + Math.sin((x + phase) / wavelength * Math.PI * 2) * amp;
                d += d ? ` L ${x} ${y}` : `M ${x} ${y}`;
              }
              return (
                <>
                  <path d={d} stroke="rgba(37, 99, 235, 0.26)" strokeWidth={58} fill="none" strokeLinecap="round" />
                  <path d={d} stroke="rgba(148, 163, 184, 0.18)" strokeWidth={40} fill="none" strokeLinecap="round" strokeDasharray="2 12" />
                  <motion.path
                    d={d}
                    stroke="rgba(125, 211, 252, 0.34)"
                    strokeWidth={24}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="30 34"
                    animate={{ strokeDashoffset: [0, -220] }}
                    transition={{ duration: Math.max(1.2, 2.8 - dragSpeed), repeat: Infinity, ease: "linear" }}
                  />
                  <path d={d} stroke="rgba(196, 181, 253, 0.30)" strokeWidth={10} fill="none" strokeLinecap="round" />
                </>
              );
            })()}
          </svg>

          {/* 整体画布层：所有元素同步移动（只含过去，当前年在最右端） */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            {/* 连续节点（自动增删） */}
            {windowYears.map((n) => {
              const mailCount = n.letters.length;
              const hasMail = mailCount > 0;
              const node: TimelineNode = { id: String(n.year), year: String(n.year), letters: n.letters, type: n.type };
              const centerX = viewportWidth * 0.52;
              const distNorm = Math.min(1, Math.abs(n.x - centerX) / (viewportWidth * 0.58));
              const scale = 1.2 - 0.4 * distNorm;
              const alpha = 1 - 0.6 * distNorm;
              const baseY = Math.sin((n.x + offsetPx * 0.03) / 260 * Math.PI * 2) * (14 + dragSpeed * 18);
              return (
                <motion.div
                  key={`yearwin-${n.year}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: alpha }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: n.x, transform: `translateY(${baseY}px) scale(${scale})`, filter: dragSpeed > 0.65 ? "blur(0.6px)" : "none" }}
                >
                  {/* 黄色竖线 */}
                  <div className="absolute left-1/2 -translate-x-1/2 -top-10 w-px h-20 bg-amber-300/55" />
                  {/* 旋转粒子环 */}
                  <motion.div
                    className="absolute left-1/2 -translate-x-1/2 -top-4 w-8 h-8 rounded-full border border-cyan-200/30"
                    animate={{ rotate: 360 }}
                    transition={{ duration: Math.max(2.2, 5 - dragSpeed * 3), repeat: Infinity, ease: "linear" }}
                  />
                  <div className="absolute left-1/2 -translate-x-1/2 -top-2 w-4 h-4 rounded-full bg-white/10 border border-white/25" />

                  <button
                    type="button"
                    onClick={() => handleNodeClick(node)}
                    className="relative px-4 py-2 rounded-full text-sm font-medium border border-white/15 text-white/80 hover:text-white hover:border-white/25 transition-colors"
                    style={{ backgroundColor: "rgba(15,26,47,0.55)", backdropFilter: "blur(10px)", boxShadow: "0 0 16px rgba(96,165,250,0.22)" }}
                    data-clickable
                  >
                    {n.year}
                    {hasMail && (
                      <span
                        className="absolute -top-3 -right-3 px-2 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1"
                        style={{ backgroundColor: "rgba(168,85,247,0.22)", border: "1px solid rgba(168,85,247,0.35)", color: "#E9D5FF" }}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {mailCount}
                      </span>
                    )}
                  </button>
                </motion.div>
              );
            })}

            {/* 曲线流动粒子（速度越快越密） */}
            {Array.from({ length: 12 + Math.round(dragSpeed * 20) }).map((_, i) => {
              const progress = (i * 83 + Math.floor(offsetPx * 0.45)) % (viewportWidth + 260);
              const x = progress - 120;
              const y = Math.sin((x + offsetPx * 0.03) / 260 * Math.PI * 2) * (14 + dragSpeed * 18);
              return (
                <motion.div
                  key={`flow-p-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: x,
                    top: y - 2,
                    width: 3 + (i % 3),
                    height: 3 + (i % 3),
                    backgroundColor: i % 2 === 0 ? "rgba(125, 211, 252, 0.85)" : "rgba(196, 181, 253, 0.8)",
                    boxShadow: "0 0 10px rgba(125,211,252,0.6)",
                  }}
                  animate={{ opacity: [0.25, 0.9, 0.25] }}
                  transition={{ duration: 1.4 + (i % 4) * 0.4, repeat: Infinity, ease: "easeInOut" }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* 信件列表弹窗 */}
      <AnimatePresence>
        {selectedYear && selectedNodeLetters && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 pointer-events-auto p-4 pt-6 rounded-2xl min-w-[280px]"
            style={{
              backgroundColor: "rgba(6, 10, 18, 0.96)",
              border: "1px solid rgba(251, 191, 36, 0.36)",
              boxShadow: "0 0 44px rgba(251, 191, 36, 0.22)",
              backdropFilter: "blur(15px)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-clickable
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-white font-medium">
                {selectedYear} 年的信件
              </div>
            </div>
            {selectedNodeLetters.length === 0 ? (
              <div className="text-xs text-white/50">该年份暂无已发送的信件。</div>
            ) : (
              <div className="space-y-2">
                {selectedNodeLetters.map((letterRef) => {
                  const letter = letters.find(l => l.id === letterRef.letterId);
                  if (!letter) return null;
                  
                  return (
                    <motion.button
                      key={letterRef.id}
                      onClick={() => handleLetterClick(letterRef.letterId)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                      style={{ 
                        backgroundColor: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                      whileHover={{ 
                        scale: 1.02,
                        backgroundColor: "rgba(251, 191, 36, 0.1)",
                        borderColor: "rgba(251, 191, 36, 0.3)",
                      }}
                      whileTap={{ scale: 0.98 }}
                      data-clickable
                    >
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: letterRef.status === "read" 
                            ? "rgba(168, 85, 247, 0.2)" 
                            : "rgba(96, 165, 250, 0.2)",
                        }}
                      >
                        {letterRef.status === "read" ? (
                          <MailOpen className="w-4 h-4 text-[#a855f7]" />
                        ) : (
                          <Mail className="w-4 h-4 text-[#60a5fa]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{letter.title}</div>
                        <div className="text-xs text-white/40">
                          {letterRef.status === "read" ? "已送达" : "等待中"}
                        </div>
                      </div>
                      <span 
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: emotionColors[letterRef.emotion]?.text || "#fff" }}
                      />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部统计 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-3 rounded-full"
           style={{ backgroundColor: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}>
        {(() => {
          const waiting = letters.filter((l) => l.type === "outgoing" && l.status !== "delivered").length;
          const unread = letters.filter((l) => l.type === "incoming" && l.status === "delivered" && !l.readAt).length;
          const read = letters.filter((l) => l.type === "incoming" && l.status === "delivered" && Boolean(l.readAt)).length;
          return (
            <>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#a855f7]" />
          <span className="text-xs text-white/60">已读 {read}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#fbbf24]" />
          <span className="text-xs text-white/60">未读 {unread}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#60a5fa]" />
          <span className="text-xs text-white/60">等待中 {waiting}</span>
        </div>
            </>
          );
        })()}
      </div>

      {/* 统一关闭按钮：右下角悬浮，扩大点击区，避免与拖动冲突 */}
      <div className="absolute bottom-6 right-6 z-40 flex items-center gap-3" data-clickable>
        {selectedYear && selectedNodeLetters && (
          <motion.button
            type="button"
            onClick={() => { setSelectedYear(null); setSelectedNodeLetters(null); }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center border border-white/15 text-white/80 hover:text-white hover:border-white/25"
            style={{ backgroundColor: "rgba(15, 26, 47, 0.92)", backdropFilter: "blur(14px)" }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="关闭年份信件列表"
            data-clickable
          >
            <X className="w-6 h-6" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
