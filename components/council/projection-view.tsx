"use client";

import { motion, AnimatePresence } from "framer-motion";
import { DecisionPath } from "./decision-path";
import { X, RefreshCw } from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { storageGet } from "@/lib/storage";
import { fetchJson } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";
import { COUNCIL_MESSAGES_KEY, COUNCIL_PROJECTION_SUPPRESS_KEY } from "@/lib/council-storage-keys";
import { buildGroundedProjectionFromCouncil } from "@/lib/projection-grounded";

interface ProjectionViewProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProjectionBranch = {
  id: string;
  name: string;
  probability: number;
  riskScore: number;
  benefitScore: number;
  emotionForecast: string;
  description: string;
  nodes: Array<{
    id: string;
    type: "emotion" | "finance" | "event";
    label: string;
    sentiment: "positive" | "neutral" | "negative";
    x: number;
    y: number;
  }>;
  opinions: Record<string, { opinion: string; support: number }>;
};

type Compared = {
  branchA: string;
  branchB: string;
  summary: string;
  delta?: {
    benefit: number;
    risk: number;
    emotionA: string;
    emotionB: string;
  };
};
type CouncilContextMessage = {
  role: string;
  name: string;
  content: string;
};

const PROJECTION_CONTEXT_MAX_CHARS_PER_LINE = 480;

/** 多轮对话时传给后端的议题占位（提示模型读全文），不应作为 UI 标题展示 */
const PROJECTION_TOPIC_API_HINT = "议会完整对话（请据全文归纳核心决策）";
const PROJECTION_TOPIC_HINT_FLAG = "请据全文归纳核心决策";

function sanitizeProjectionTopicForUi(topic: string | undefined, fallback: string) {
  const t = (topic ?? "").trim();
  if (!t) return fallback;
  if (t.includes(PROJECTION_TOPIC_HINT_FLAG)) return fallback;
  return t;
}

/** 顶部只读展示用，完整文案放在 title 提示 */
function ellipsizeBrief(s: string, maxChars = 28): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(4, maxChars - 1))}…`;
}

function councilRawToContextMessages(
  raw: Array<{ name?: string; message?: string; role?: string }>,
  tailCount: number,
): CouncilContextMessage[] {
  return raw
    .slice(-tailCount)
    .map((m) => ({
      role: (m.role ?? "").toString(),
      name: (m.name ?? "").toString(),
      content: (m.message ?? "").toString().trim().slice(0, PROJECTION_CONTEXT_MAX_CHARS_PER_LINE),
    }))
    .filter((m) => m.content.length > 0);
}

async function readCouncilProjectionGate(): Promise<{
  allowed: boolean;
  topicSeed: string;
  /** 议会页真实议题短句，用于决策树标题（与 API 内部 hint 分离） */
  displayTopic: string;
  suppress: boolean;
  hasUserTurn: boolean;
}> {
  const [suppress, raw, lastTopic] = await Promise.all([
    storageGet<boolean>(COUNCIL_PROJECTION_SUPPRESS_KEY, false),
    storageGet<Array<{ name?: string; message?: string; role?: string }>>(COUNCIL_MESSAGES_KEY, []),
    storageGet<string>("council.lastTopic.v1", ""),
  ]);
  const hasUserTurn = raw.some(
    (m) => (m.name ?? "").trim() === "你" && (m.message ?? "").toString().trim().length > 0,
  );
  const allowed = !suppress && hasUserTurn;
  const firstUserLine =
    raw.find((m) => (m.name ?? "").trim() === "你" && (m.message ?? "").toString().trim().length > 0)?.message ?? "";
  const nonEmptyTurns = raw.filter((m) => (m.message ?? "").toString().trim().length > 0).length;
  const displayTopic =
    (lastTopic ?? "").trim() || firstUserLine.toString().trim() || "当前关键决策";
  /** 多轮对话时仍用 hint 作为 topic 字段，避免模型只盯最后一句；归纳结果由 sessionTopic 覆盖 */
  const topicSeed = nonEmptyTurns >= 3 ? PROJECTION_TOPIC_API_HINT : displayTopic;
  return { allowed, topicSeed, displayTopic, suppress, hasUserTurn };
}

export function ProjectionView({ isOpen, onClose }: ProjectionViewProps) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<ProjectionBranch[]>([]);
  const [question, setQuestion] = useState("当前关键决策");
  const [compareSummary, setCompareSummary] = useState("");
  const [defaultCompare, setDefaultCompare] = useState<{ branchA: string; branchB: string } | null>(null);
  const [comparedDelta, setComparedDelta] = useState<Compared["delta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedHint, setBlockedHint] = useState<string | null>(null);

  const fetchProjection = useCallback(async (contextMessages: CouncilContextMessage[] = []) => {
    const gate = await readCouncilProjectionGate();
    if (!gate.allowed) {
      setLoading(false);
      setError(null);
      setSelectedBranch(null);
      setBranches([]);
      setDefaultCompare(null);
      setCompareSummary("");
      setComparedDelta(null);
      setQuestion("议会对话");
      if (gate.suppress && gate.hasUserTurn) {
        setBlockedHint("本轮正在归档或刚完成决策，请等待结束后再打开推演；或开始新一轮议会对话。");
      } else {
        setBlockedHint("请先在议会页发送至少一条议题，再生成决策树推演。");
      }
      return;
    }
    setBlockedHint(null);
    setLoading(true);
    setError(null);
    setSelectedBranch(null);
    setBranches([]);
    try {
      const res = await fetchJson<{
        topic: string;
        branches: ProjectionBranch[];
        compared: Compared;
        meta?: { source?: string; llmAttempted?: boolean };
      }>("/api/projection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: gate.topicSeed,
          focusTopic: gate.displayTopic,
          contextMessages,
        }),
      });
      if (res?.branches?.length) {
        setQuestion(sanitizeProjectionTopicForUi(res.topic, gate.displayTopic));
        setBranches(res.branches);
        setDefaultCompare({ branchA: res.compared.branchA, branchB: res.compared.branchB });
        setCompareSummary(res.compared.summary);
        setComparedDelta(res.compared.delta ?? null);
        const src = res.meta?.source;
        if (src === "grounded" && res.meta?.llmAttempted) {
          setError(
            "已连上 API，但服务端未走通 AI 推演（请检查服务器 DEEPSEEK_API_KEY / DeepSeek 配额）。当前为规则骨架。",
          );
        } else {
          setError(null);
        }
        clientLog("info", "projection.api", "cloud success", {
          branchCount: res.branches.length,
          source: src,
          llmAttempted: res.meta?.llmAttempted,
        });
        return;
      }
      throw new Error("Empty projection branches from API");
    } catch (e) {
      clientLog("warn", "projection.api", "cloud failed fallback local", { detail: String(e) });
      setError("云端推演暂不可用，已切换本地兜底。");
      const grounded = buildGroundedProjectionFromCouncil(gate.displayTopic, contextMessages);
      setQuestion(gate.displayTopic);
      setBranches(grounded.branches as ProjectionBranch[]);
      setDefaultCompare({ branchA: grounded.compared.branchA, branchB: grounded.compared.branchB });
      setCompareSummary(grounded.compared.summary);
      setComparedDelta(grounded.compared.delta ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const topicDisplayBrief = useMemo(() => ellipsizeBrief(question, 30), [question]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      const gate = await readCouncilProjectionGate();
      const contextRaw = await storageGet<
        Array<{ name?: string; message?: string; role?: string }>
      >(COUNCIL_MESSAGES_KEY, []);
      if (cancelled) return;
      const contextMessages = councilRawToContextMessages(contextRaw, 48);
      if (!gate.allowed) {
        setBlockedHint(
          gate.suppress && gate.hasUserTurn
            ? "本轮正在归档或刚完成决策，请等待结束后再打开推演；或开始新一轮议会对话。"
            : "请先在议会页发送至少一条议题，再生成决策树推演。",
        );
        setBranches([]);
        setQuestion("议会对话");
        setDefaultCompare(null);
        setCompareSummary("");
        setComparedDelta(null);
        setError(null);
        return;
      }
      setBlockedHint(null);
      await fetchProjection(contextMessages);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, fetchProjection]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-40 bg-[oklch(0.05_0.02_260)] flex flex-col"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
        >
          {/* 顶部栏 */}
          <div className="flex-shrink-0 z-50 flex flex-col gap-3 px-4 pt-4 pb-2 border-b border-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <motion.h2
              className="text-lg font-medium text-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              动态叙事推演
            </motion.h2>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div
                className="min-w-0 max-w-[min(20rem,52vw)] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left backdrop-blur-sm"
                title={question}
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/90">归纳议题</div>
                <div className="text-sm font-medium text-foreground/95 truncate">
                  {loading && branches.length === 0 ? "生成中…" : topicDisplayBrief}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const gate = await readCouncilProjectionGate();
                  if (!gate.allowed) {
                    setBlockedHint(
                      gate.suppress && gate.hasUserTurn
                        ? "本轮正在归档或刚完成决策，请等待结束后再生成推演。"
                        : "请先在议会页发送至少一条议题，再生成推演。",
                    );
                    return;
                  }
                  const contextRaw = await storageGet<
                    Array<{ name?: string; message?: string; role?: string }>
                  >(COUNCIL_MESSAGES_KEY, []);
                  const contextMessages = councilRawToContextMessages(contextRaw, 48);
                  await fetchProjection(contextMessages);
                }}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "生成中…" : "生成推演"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full bg-card/50 hover:bg-card transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {error && (
            <div className="flex-shrink-0 px-6 py-2 text-xs text-amber-300 bg-amber-950/30 border-b border-amber-900/40">
              {error}
            </div>
          )}

          {blockedHint && !error && (
            <div className="flex-shrink-0 px-6 py-2 text-xs text-sky-200/90 bg-sky-950/25 border-b border-sky-900/35">
              {blockedHint}
            </div>
          )}

          {/* 决策路径：占主内容区绝大部分高度，内部树 3/5 + 底栏 2/5 */}
          <div className="flex-1 min-h-0 h-0 pt-2">
            {!loading && branches.length === 0 && blockedHint ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center text-sm text-muted-foreground">
                <p>当前不会自动生成示例决策树。</p>
                <p className="text-xs text-muted-foreground/80">返回议会输入你的真实议题后，再打开推演或点击「生成推演」。</p>
              </div>
            ) : loading && branches.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                正在根据议会会话归纳决策并生成 2–3 条路径…
              </div>
            ) : (
              <DecisionPath
                key={branches.length ? [question, ...branches.map((b) => b.id)].join("|") : "empty"}
                question={question}
                branches={branches}
                selectedBranch={selectedBranch}
                onSelectBranch={setSelectedBranch}
                compareSummary={compareSummary}
                defaultCompare={defaultCompare}
                comparedDelta={comparedDelta}
              />
            )}
          </div>

          <motion.div
            className="flex-shrink-0 pb-3 pt-1 flex z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="w-full px-4 sm:px-6 text-right text-xs text-muted-foreground/60">
              点击路径查看详情与三派系意见 · 右侧可对比两条路径的收益、风险与情绪预测
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
