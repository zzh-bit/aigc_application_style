"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Calendar,
  Heart,
  Briefcase,
  Plane,
  GraduationCap,
  Star,
  Eye,
  Pencil,
  EyeOff,
  Quote,
  ChevronLeft,
  ChevronRight,
  Brain,
  Sparkles,
  TrendingUp,
  Cloud,
  Search,
  Tags,
  X,
} from "lucide-react";
import { storageGet, storageSet } from "@/lib/storage";
import { fetchJson } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";
import { EMOTION_TRIGGER_OPTIONS, type EmotionTriggerValue } from "@/lib/emotion-options";
import { usePerformanceProfile } from "@/lib/performance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 记忆类型
type MemoryType = "life" | "work" | "travel" | "education" | "emotion";

// 情绪类型
type EmotionType = EmotionTriggerValue;

interface Memory {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  summary: string;
  date: string;
  year: number;
  emotion: EmotionType;
  relevance: number; // 0-5
  keywords: string[];
  summaryStatus?: "ready" | "pending";
}

const DEFAULT_MEMORIES: Memory[] = [
  {
    id: "1",
    type: "work",
    title: "第一次独立完成项目",
    content: "今天终于把那个棘手的项目交付了。虽然过程中遇到了很多困难，但最终还是克服了。领导的认可让我感到所有的付出都是值得的。",
    summary: "独立完成重要项目，获得认可",
    date: "2024-03-15",
    year: 2024,
    emotion: "happy",
    relevance: 5,
    keywords: ["成就", "工作", "成长"],
  },
  {
    id: "2",
    type: "emotion",
    title: "深夜的思考",
    content: "有时候会想，现在的选择是否正确？但转念一想，每一步都是自己走过来的，没有所谓的对错，只有经历。",
    summary: "对人生选择的哲学思考",
    date: "2024-02-20",
    year: 2024,
    emotion: "calm",
    relevance: 4,
    keywords: ["反思", "人生", "选择"],
  },
  {
    id: "3",
    type: "travel",
    title: "日本之行",
    content: "在京都的那个雨天，漫步在哲学之道上，樱花落满了小径。那一刻，时间仿佛静止了。这种宁静的美好，是我一直在寻找的。",
    summary: "京都哲学之道的静谧体验",
    date: "2023-04-08",
    year: 2023,
    emotion: "calm",
    relevance: 5,
    keywords: ["旅行", "日本", "宁静"],
  },
  {
    id: "4",
    type: "life",
    title: "和老友重逢",
    content: "十年未见的老友突然联系我，我们约在老地方见面。聊起往事，仿佛时光倒流。有些友情，真的可以跨越时间。",
    summary: "与十年未见的老友重逢",
    date: "2023-08-22",
    year: 2023,
    emotion: "happy",
    relevance: 4,
    keywords: ["友情", "重逢", "回忆"],
  },
  {
    id: "5",
    type: "education",
    title: "毕业典礼",
    content: "站在礼堂里，听着校长的致辞，回想四年的点点滴滴。感谢这段时光，让我成为了更好的自己。",
    summary: "大学毕业的感慨时刻",
    date: "2018-06-30",
    year: 2018,
    emotion: "excited",
    relevance: 5,
    keywords: ["毕业", "青春", "成长"],
  },
  {
    id: "6",
    type: "emotion",
    title: "疫情中的坚持",
    content: "居家办公的日子虽然艰难，但也让我学会了与自己相处。在这段特殊时期，我完成了很多一直想做但没时间做的事。",
    summary: "疫情期间的自我成长",
    date: "2020-05-15",
    year: 2020,
    emotion: "calm",
    relevance: 3,
    keywords: ["疫情", "成长", "独处"],
  },
];

// 情绪颜色映射
const EMOTION_COLORS: Record<string, string> = {
  happy: "bg-amber-400",
  sad: "bg-blue-400",
  anxious: "bg-red-400",
  calm: "bg-cyan-400",
  excited: "bg-orange-400",
  lost: "bg-indigo-400",
  tired: "bg-purple-400",
  lonely: "bg-slate-400",
  down: "bg-sky-500",
  stressed: "bg-rose-500",
  grateful: "bg-yellow-300",
  confident: "bg-emerald-400",
};

// 记忆类型图标
const TYPE_ICONS: Record<MemoryType, React.ElementType> = {
  life: Heart,
  work: Briefcase,
  travel: Plane,
  education: GraduationCap,
  emotion: Brain,
};

interface MemoryVaultProps {
  onBack: () => void;
}

const STOPWORDS = new Set([
  "的",
  "了",
  "在",
  "是",
  "我",
  "有",
  "和",
  "就",
  "不",
  "人",
  "都",
  "一",
  "一个",
  "上",
  "也",
  "到",
  "说",
  "要",
  "去",
  "你",
  "会",
  "着",
  "没有",
  "看",
  "好",
  "自己",
  "这",
  "那",
  "吗",
  "呢",
  "吧",
  "很",
  "还",
  "又",
  "与",
  "为",
  "以",
  "从",
  "对",
  "让",
  "把",
  "被",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "to",
  "of",
  "and",
  "or",
  "for",
  "in",
  "on",
  "it",
  "that",
  "this",
  "with",
  "as",
  "at",
  "by",
]);

function extractKeywords(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/[\n\r\t]/g, " ")
    .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, 8);
}

async function summarizeAsync(text: string) {
  try {
    const data = await fetchJson<{ summary?: string }>("/api/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      timeoutMs: 35_000,
    });
    return (data.summary ?? "").trim();
  } catch (e) {
    clientLog("warn", "memory.summarize", "request failed", { detail: String(e) });
    throw e;
  }
}

function applySummaryResult(
  memoryId: string,
  summaryText: string,
  title: string,
  content: string,
  setMemories: Dispatch<SetStateAction<Memory[]>>,
  setSelectedMemory: Dispatch<SetStateAction<Memory | null>>,
) {
  const autoKeywords = extractKeywords(`${title} ${summaryText} ${content}`);
  setMemories((prev) => {
    const next = prev.map((m) =>
      m.id === memoryId
        ? {
            ...m,
            summary: summaryText || m.summary,
            keywords: Array.from(new Set([...m.keywords, ...autoKeywords])).slice(0, 10),
            summaryStatus: "ready" as const,
          }
        : m,
    );
    void storageSet("memory.memories.v1", next);
    return next;
  });
  setSelectedMemory((prev) =>
    prev && prev.id === memoryId
      ? {
          ...prev,
          summary: summaryText || prev.summary,
          keywords: Array.from(new Set([...prev.keywords, ...autoKeywords])).slice(0, 10),
          summaryStatus: "ready",
        }
      : prev,
  );
}

function applySummaryFailure(memoryId: string, setMemories: Dispatch<SetStateAction<Memory[]>>) {
  setMemories((prev) => {
    const next = prev.map((m) =>
      m.id === memoryId ? { ...m, summaryStatus: "ready" as const, summary: m.content.slice(0, 48) + (m.content.length > 48 ? "…" : "") } : m,
    );
    void storageSet("memory.memories.v1", next);
    return next;
  });
}

export function MemoryVault({ onBack }: MemoryVaultProps) {
  const perf = usePerformanceProfile();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<MemoryType>("life");
  const [newEmotion, setNewEmotion] = useState<EmotionType>("calm");
  const [newRelevance, setNewRelevance] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");
  const [keywordDraft, setKeywordDraft] = useState("");
  /** 时间线：近三年快速筛选（与按年单选可叠加） */
  const [yearRangeFilter, setYearRangeFilter] = useState<"all" | "recent3">("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await storageGet<Memory[]>("memory.memories.v1", []);
      if (cancelled) return;
      if (saved.length > 0) {
        setMemories(saved);
        for (const m of saved) {
          if (cancelled) break;
          if (m.summaryStatus !== "pending" || !m.content?.trim()) continue;
          void (async () => {
            try {
              const summaryText = await summarizeAsync(m.content);
              if (cancelled) return;
              applySummaryResult(m.id, summaryText, m.title, m.content, setMemories, setSelectedMemory);
            } catch {
              if (cancelled) return;
              applySummaryFailure(m.id, setMemories);
            }
          })();
        }
        return;
      }
      setMemories(DEFAULT_MEMORIES);
      await storageSet("memory.memories.v1", DEFAULT_MEMORIES);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenAddMemory = () => {
    setNewTitle("");
    setNewContent("");
    setNewType("life");
    setNewEmotion("calm");
    setNewRelevance(3);
    setIsAddingMemory(true);
  };

  // 根据年份/类型/关键词筛选记忆（关键词支持空格分隔多词，全部命中才显示）
  const filteredMemories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const minYear = new Date().getFullYear() - 2;
    return memories.filter((m) => {
      if (selectedYear !== null && m.year !== selectedYear) return false;
      if (yearRangeFilter === "recent3" && m.year < minYear) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (tokens.length === 0) return true;
      const inText = `${m.title} ${m.content} ${m.summary} ${m.keywords.join(" ")}`.toLowerCase();
      return tokens.every((tok) => inText.includes(tok));
    });
  }, [memories, selectedYear, searchQuery, typeFilter, yearRangeFilter]);

  const dynamicTimeNodes = useMemo(() => {
    const byYear = new Map<number, number>();
    for (const m of memories) byYear.set(m.year, (byYear.get(m.year) ?? 0) + 1);
    return Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, count]) => ({
        year,
        label: `${year}`,
        count,
        density: Math.max(1, Math.min(5, count)),
      }));
  }, [memories]);

  // 统计数据
  const stats = useMemo(() => {
    const total = memories.length;
    const emotionCounts: Record<string, number> = Object.fromEntries(
      EMOTION_TRIGGER_OPTIONS.map((e) => [e.value, 0]),
    );
    const allKeywords: string[] = [];

    memories.forEach((m) => {
      // 兼容历史/异常数据，避免出现 undefined++ 导致 NaN
      if (m.emotion in emotionCounts) emotionCounts[m.emotion] += 1;
      allKeywords.push(...m.keywords);
    });

    // 计算高频词
    const keywordCounts = allKeywords.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);

    return { total, emotionCounts, topKeywords };
  }, [memories]);

  const handleSaveMemory = () => {
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || !content) {
      setIsAddingMemory(false);
      return;
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const year = now.getFullYear();
    const keywords = extractKeywords(`${title} ${content}`);
    const summary = "摘要生成中...";

    const memory: Memory = {
      id: now.getTime().toString(),
      type: newType,
      title,
      content,
      summary,
      date,
      year,
      emotion: newEmotion,
      relevance: newRelevance,
      keywords,
      summaryStatus: "pending",
    };

    setMemories((prev) => {
      const next = [memory, ...prev];
      void storageSet("memory.memories.v1", next);
      return next;
    });
    setSelectedYear(null);
    setSelectedMemory(memory);
    setIsAddingMemory(false);

    void (async () => {
      try {
        await new Promise((r) => window.setTimeout(r, 0));
        const summaryText = await summarizeAsync(content);
        applySummaryResult(memory.id, summaryText, title, content, setMemories, setSelectedMemory);
      } catch {
        applySummaryFailure(memory.id, setMemories);
      }
    })();
  };

  return (
    <div className="relative w-full h-screen flex overflow-hidden bg-background">
      {/* 左侧栏 - 时间轴导航 */}
      <aside className="w-[20%] min-w-[200px] h-full border-r border-border/30 flex flex-col bg-card/30 backdrop-blur-sm">
        {/* 返回按钮 */}
        <div className="p-4 border-b border-border/30">
          <motion.button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            whileHover={perf.lowPerformanceMode ? undefined : { x: -2 }}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>返回议会</span>
          </motion.button>
        </div>

        {/* 时间轴标题 */}
        <div className="px-4 py-3 space-y-2">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            时间轴
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setYearRangeFilter("all")}
              className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                yearRangeFilter === "all"
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/50 text-muted-foreground hover:bg-card/50"
              }`}
            >
              全部年份
            </button>
            <button
              type="button"
              onClick={() => setYearRangeFilter((v) => (v === "recent3" ? "all" : "recent3"))}
              className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                yearRangeFilter === "recent3"
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/50 text-muted-foreground hover:bg-card/50"
              }`}
            >
              近三年
            </button>
          </div>
        </div>

        {/* 垂直时间轴 */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <div className="relative">
            {/* 时间轴线 */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-primary/30 to-transparent" />

            {/* 时间节点 */}
            {dynamicTimeNodes.map((node, index) => (
              <motion.button
                key={node.year}
                onClick={() => setSelectedYear(selectedYear === node.year ? null : node.year)}
                className={`relative w-full flex items-center gap-3 py-3 pl-1 pr-2 rounded-lg transition-colors ${
                  selectedYear === node.year
                    ? "bg-primary/10"
                    : "hover:bg-card/50"
                }`}
                initial={perf.lowPerformanceMode ? { opacity: 1 } : { opacity: 0, x: -10 }}
                animate={perf.lowPerformanceMode ? { opacity: 1 } : { opacity: 1, x: 0 }}
                transition={perf.lowPerformanceMode ? { duration: 0 } : { delay: index * 0.05 }}
              >
                {/* 节点圆点 - 大小表示记忆密度 */}
                <div
                  className={`relative z-10 rounded-full border-2 transition-colors ${
                    selectedYear === node.year
                      ? "bg-primary border-primary"
                      : "bg-card border-primary/50"
                  }`}
                  style={{
                    width: 8 + node.density * 3,
                    height: 8 + node.density * 3,
                  }}
                />

                {/* 节点信息 */}
                <div className="flex-1 text-left">
                  <div className={`text-sm font-medium ${
                    selectedYear === node.year ? "text-primary" : "text-foreground"
                  }`}>
                    {node.year}
                  </div>
                  <div className="text-xs text-muted-foreground">{node.label}</div>
                </div>

                {/* 记忆数量指示 */}
                <div className="text-xs text-muted-foreground">
                  {node.count}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* 添加记忆按钮 */}
        <div className="p-4 border-t border-border/30">
          <motion.button
            onClick={handleOpenAddMemory}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition-colors"
            whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.02 }}
            whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.98 }}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">添加记忆</span>
          </motion.button>
        </div>
      </aside>

      {/* 中间栏 - 记忆卡片墙 */}
      <main className="flex-1 h-full overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">记忆库</h1>
            <p className="text-sm text-muted-foreground">
              {selectedYear ? `${selectedYear}年的记忆` : "所有记忆"} · {filteredMemories.length} 条
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="关键词（空格=同时包含）"
                className="pl-7 pr-2 py-1.5 w-44 text-xs bg-card/70 border border-border/50 rounded-lg text-foreground outline-none"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as MemoryType | "all")}>
              <SelectTrigger className="h-8 rounded-lg px-2 text-xs bg-card/70 border border-border/50 text-foreground">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent className="border-border/60 bg-[#0E1629]/95 backdrop-blur-xl text-foreground">
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="life">生活</SelectItem>
                <SelectItem value="work">工作</SelectItem>
                <SelectItem value="travel">旅行</SelectItem>
                <SelectItem value="education">学习</SelectItem>
                <SelectItem value="emotion">情绪</SelectItem>
              </SelectContent>
            </Select>
            {selectedYear && (
              <motion.button
                onClick={() => setSelectedYear(null)}
                className="text-xs text-primary hover:underline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                查看全部
              </motion.button>
            )}
          </div>
        </div>

        {/* 瀑布流卡片区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="columns-1 md:columns-2 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredMemories.map((memory, index) => {
                const TypeIcon = TYPE_ICONS[memory.type];
                return (
                  <motion.div
                    key={memory.id}
                    layout={!perf.lowPerformanceMode}
                    initial={perf.lowPerformanceMode ? { opacity: 1 } : { opacity: 0, y: 20 }}
                    animate={perf.lowPerformanceMode ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    exit={perf.lowPerformanceMode ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                    // 低端机避免大量“逐个延迟”导致主线程持续繁忙
                    transition={perf.lowPerformanceMode ? { duration: 0.12 } : { duration: 0.22 }}
                    onClick={() => setSelectedMemory(memory)}
                    className={`break-inside-avoid mb-4 group cursor-pointer ${
                      selectedMemory?.id === memory.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <motion.div
                      className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden transition-all duration-300 hover:bg-card/80 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                      whileHover={perf.lowPerformanceMode ? undefined : { y: -4 }}
                    >
                      {/* 卡片头部 */}
                      <div className="px-4 py-3 flex items-center gap-3 border-b border-border/30">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <TypeIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground">{memory.date}</div>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${EMOTION_COLORS[memory.emotion]}`} />
                      </div>

                      {/* 卡片内容 */}
                      <div className="px-4 py-3">
                        <h3 className="text-sm font-medium text-foreground mb-2">{memory.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
                          {memory.content}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-primary/70">
                          <Sparkles className="w-3 h-3" />
                          <span>{memory.summary}</span>
                          {memory.summaryStatus === "pending" && (
                            <span className="text-[10px] text-amber-300">生成中</span>
                          )}
                        </div>
                      </div>

                      {/* 卡片底部 */}
                      <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between">
                        {/* 关联度星星 */}
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${
                                i < memory.relevance
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                        </div>

                        {/* 快速操作 */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                            <Quote className="w-3 h-3" />
                          </button>
                          <button className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                            <EyeOff className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* 右侧栏 - 记忆详情/统计 */}
      <aside className="w-[30%] min-w-[280px] h-full min-h-0 border-l border-border/30 flex flex-col bg-card/30 backdrop-blur-sm">
        <AnimatePresence mode="wait">
          {selectedMemory ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex-1 min-h-0 flex flex-col"
            >
              {/* 详情头部 */}
              <div className="p-4 border-b border-border/30 flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">记忆详情</h2>
                <button
                  onClick={() => setSelectedMemory(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  关闭
                </button>
              </div>

              {/* 详情内容 */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
                {/* 基本信息 */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-3 h-3 rounded-full ${EMOTION_COLORS[selectedMemory.emotion]}`} />
                    <span className="text-xs text-muted-foreground">{selectedMemory.date}</span>
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-3">{selectedMemory.title}</h3>
                  <p className="text-sm text-foreground/80 leading-relaxed">{selectedMemory.content}</p>
                </div>

                {/* AI洞察 */}
                <div className="mb-6 p-4 bg-primary/5 rounded-xl border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-primary">AI洞察</span>
                  </div>
                  <p className="text-sm text-foreground/70">{selectedMemory.summary}</p>
                </div>

                {/* 关键词 */}
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Tags className="w-3 h-3" />
                    关键词（自动 + 手动）
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedMemory.keywords.map((keyword) => (
                      <button
                        key={keyword}
                        onClick={() => {
                          const nextKeywords = selectedMemory.keywords.filter((k) => k !== keyword);
                          setSelectedMemory({ ...selectedMemory, keywords: nextKeywords });
                          setMemories((prev) => {
                            const next = prev.map((m) => (m.id === selectedMemory.id ? { ...m, keywords: nextKeywords } : m));
                            void storageSet("memory.memories.v1", next);
                            return next;
                          });
                        }}
                        className="px-2 py-1 text-xs bg-card/80 rounded-full border border-border/50 text-foreground/70 inline-flex items-center gap-1 hover:border-primary/40"
                      >
                        {keyword}
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={keywordDraft}
                      onChange={(e) => setKeywordDraft(e.target.value)}
                      placeholder="手动添加标签"
                      className="flex-1 px-2 py-1 text-xs bg-card/70 border border-border/50 rounded-lg text-foreground outline-none"
                    />
                    <button
                      onClick={() => {
                        const tag = keywordDraft.trim();
                        if (!tag) return;
                        const nextKeywords = Array.from(new Set([...selectedMemory.keywords, tag]));
                        setSelectedMemory({ ...selectedMemory, keywords: nextKeywords });
                        setMemories((prev) => {
                          const next = prev.map((m) => (m.id === selectedMemory.id ? { ...m, keywords: nextKeywords } : m));
                          void storageSet("memory.memories.v1", next);
                          return next;
                        });
                        setKeywordDraft("");
                      }}
                      className="px-2 py-1 text-xs bg-primary/20 border border-primary/30 rounded-lg text-primary"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {/* 相关记忆推荐 */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">相关记忆</h4>
                  <div className="flex flex-col gap-2">
                    {memories.filter(
                      (m) =>
                        m.id !== selectedMemory.id &&
                        m.keywords.some((k) => selectedMemory.keywords.includes(k))
                    )
                      .slice(0, 3)
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMemory(m)}
                          className="text-left p-2 rounded-lg bg-card/50 hover:bg-card/80 transition-colors"
                        >
                          <div className="text-xs font-medium text-foreground">{m.title}</div>
                          <div className="text-xs text-muted-foreground">{m.date}</div>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="stats"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex-1 min-h-0 flex flex-col"
            >
              {/* 统计头部 */}
              <div className="p-4 border-b border-border/30">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  记忆统计
                </h2>
              </div>

              {/* 统计内容 */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: "touch" }}>
                {/* 记忆总量 */}
                <div className="mb-6 p-4 bg-card/50 rounded-xl border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1">记忆总量</div>
                  <div className="text-3xl font-bold text-foreground">{stats.total}</div>
                </div>

                {/* 情绪分布 */}
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-muted-foreground mb-3">情绪分布</h4>
                  <div className="relative w-32 h-32 mx-auto">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      {Object.entries(stats.emotionCounts).reduce(
                        (acc, [emotion, count], index) => {
                          const safeTotal = stats.total > 0 ? stats.total : 1;
                          const safeCount = Number.isFinite(count) ? count : 0;
                          const percentage = (safeCount / safeTotal) * 100;
                          const circumference = 2 * Math.PI * 40;
                          const strokeDasharray = (percentage / 100) * circumference;
                          const strokeDashoffset = acc.offset;

                          acc.elements.push(
                            <circle
                              key={emotion}
                              cx="50"
                              cy="50"
                              r="40"
                              fill="none"
                              strokeWidth="8"
                              stroke={
                                emotion === "happy"
                                  ? "#fbbf24"
                                  : emotion === "sad"
                                  ? "#60a5fa"
                                  : emotion === "anxious"
                                  ? "#f87171"
                                  : emotion === "calm"
                                  ? "#22d3ee"
                                  : "#fb923c"
                              }
                              strokeDasharray={`${strokeDasharray} ${circumference}`}
                              strokeDashoffset={-strokeDashoffset}
                              className="transition-all duration-500"
                            />
                          );
                          acc.offset += strokeDasharray;
                          return acc;
                        },
                        { elements: [] as React.ReactNode[], offset: 0 }
                      ).elements}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-lg font-bold text-foreground">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">条记忆</div>
                      </div>
                    </div>
                  </div>

                  {/* 图例 */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {Object.entries(stats.emotionCounts).map(([emotion, count]) => (
                      <div key={emotion} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${EMOTION_COLORS[emotion] ?? "bg-white/40"}`} />
                        <span className="text-muted-foreground capitalize">{emotion}</span>
                        <span className="text-foreground ml-auto">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 高频词汇云 */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Cloud className="w-3 h-3" />
                    高频词汇
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {stats.topKeywords.map((keyword, index) => (
                      <motion.span
                        key={keyword}
                        initial={perf.lowPerformanceMode ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={perf.lowPerformanceMode ? { duration: 0 } : { delay: index * 0.05 }}
                        className="px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm"
                        style={{
                          fontSize: `${12 + (stats.topKeywords.length - index) * 1.5}px`,
                        }}
                      >
                        {keyword}
                      </motion.span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* 添加记忆弹窗 - 简化版 */}
      <AnimatePresence>
        {isAddingMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setIsAddingMemory(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-card rounded-2xl border border-border/50 p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-foreground mb-4">添加新记忆</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">标题</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-background rounded-lg border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="给这段记忆起个名字..."
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">内容</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full h-32 px-3 py-2 bg-background rounded-lg border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    placeholder="记录下这段记忆..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">类型</label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as MemoryType)}
                      className="w-full px-3 py-2 bg-background rounded-lg border border-border/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="life">生活</option>
                      <option value="work">工作</option>
                      <option value="travel">旅行</option>
                      <option value="education">学习</option>
                      <option value="emotion">情绪</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">情绪</label>
                    <select
                      value={newEmotion}
                      onChange={(e) => setNewEmotion(e.target.value as EmotionType)}
                      className="w-full px-3 py-2 bg-background rounded-lg border border-border/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {EMOTION_TRIGGER_OPTIONS.map((opt) => (
                        <option key={`mem-emo-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">关联度（1-5）</label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={newRelevance}
                    onChange={(e) => setNewRelevance(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsAddingMemory(false)}
                    className="flex-1 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveMemory}
                    className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    保存
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
