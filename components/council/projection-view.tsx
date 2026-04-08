"use client";

import { motion, AnimatePresence } from "framer-motion";
import { DecisionPath } from "./decision-path";
import { X, RefreshCw } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { storageGet } from "@/lib/storage";
import { fetchJson, userFacingMessage } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";

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

export function ProjectionView({ isOpen, onClose }: ProjectionViewProps) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<ProjectionBranch[]>([]);
  const [question, setQuestion] = useState("当前关键决策");
  const [topicInput, setTopicInput] = useState("");
  const [compareSummary, setCompareSummary] = useState("");
  const [defaultCompare, setDefaultCompare] = useState<{ branchA: string; branchB: string } | null>(null);
  const [comparedDelta, setComparedDelta] = useState<Compared["delta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjection = useCallback(async (topic: string) => {
    const t = topic.trim() || "当前关键决策";
    setLoading(true);
    setError(null);
    setSelectedBranch(null);
    try {
      const data = await fetchJson<{
        topic?: string;
        branches?: ProjectionBranch[];
        compared?: Compared;
      }>("/api/projection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: t }),
        timeoutMs: 60_000,
      });
      setQuestion(data.topic ?? t);
      setBranches(Array.isArray(data.branches) ? data.branches : []);
      const c = data.compared;
      if (c?.branchA && c?.branchB) {
        setDefaultCompare({ branchA: c.branchA, branchB: c.branchB });
        setCompareSummary(c.summary ?? "");
        setComparedDelta(c.delta ?? null);
      } else {
        setDefaultCompare(null);
        setCompareSummary("");
        setComparedDelta(null);
      }
    } catch (e) {
      clientLog("warn", "projection.fetch", "failed", { detail: String(e) });
      setError(userFacingMessage(e));
      setBranches([]);
      setCompareSummary("");
      setDefaultCompare(null);
      setComparedDelta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      const fromCouncil = await storageGet<string>("council.lastTopic.v1", "");
      if (cancelled) return;
      const initial = fromCouncil.trim() || "赴京工作？";
      setTopicInput(initial);
      await fetchProjection(initial);
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="输入议题生成路径…"
                className="min-w-[12rem] flex-1 sm:flex-none px-3 py-2 rounded-xl text-sm bg-card/60 border border-border/50 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => void fetchProjection(topicInput)}
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

          {/* 决策路径可视化 */}
          <div className="flex-1 min-h-0 pt-2">
            {loading && branches.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                正在根据议题生成 2–3 条路径…
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
            className="flex-shrink-0 pb-3 pt-1 flex flex-col items-center gap-1 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-xs text-muted-foreground/60">
              点击路径查看详情与三派系意见 · 下方可对比两条路径的收益、风险与情绪预测
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
