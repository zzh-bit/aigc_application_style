"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Brain, Heart, Target, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { NebulaBackground } from "./nebula-background";
import { fetchJson, userFacingMessage } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";

interface DataInsightsProps {
  onBack: () => void;
}

type InsightResponse = {
  totalRecords: number;
  reviewFrequencyPerWeek: number;
  emotionDistribution: Array<{ emotion: string; label: string; count: number; percentage: number }>;
  topicDistribution: Array<{ topic: string; count: number }>;
  biasCards: Array<{ type: string; level: string; evidence: string; suggestion: string }>;
  aiExplanation: string;
  weeklyAdvice: string;
};

const COLORS = ["#8B5CF6", "#60A5FA", "#34D399", "#F59E0B", "#F87171", "#A78BFA"];

export function DataInsights({ onBack }: DataInsightsProps) {
  const [data, setData] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const json = await fetchJson<InsightResponse>("/api/insights", {
          method: "GET",
          timeoutMs: 30_000,
        });
        if (!cancelled) setData(json);
      } catch (e) {
        clientLog("warn", "insights.load", "failed", { detail: String(e) });
        if (!cancelled) setError(userFacingMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const topTopic = useMemo(() => data?.topicDistribution[0]?.topic ?? "暂无", [data]);

  const handleRetry = () => {
    setData(null);
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="relative w-full min-h-screen overflow-hidden">
      <NebulaBackground />
      <div className="relative z-10 w-full min-h-screen p-6">
        <header className="flex items-center justify-between mb-8">
          <motion.button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </motion.button>
          <h1 className="text-xl font-light text-white/90">数据洞察</h1>
          <div className="w-20" />
        </header>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/60">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-violet-400" />
            <p className="text-sm">正在加载洞察报告…</p>
          </div>
        )}

        {!loading && error && (
          <div className="max-w-md mx-auto rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-200 mb-4">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 px-4 py-2 text-sm text-red-100 hover:bg-red-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.totalRecords === 0 && (
              <div className="lg:col-span-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                暂无归档记录：先在议会中完成几轮对话并点击「决策完成」保存后，统计会更准确。下方为引导性参考内容。
              </div>
            )}
            <div className="space-y-6">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/80"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  重新加载
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 text-white/60 mb-2">
                    <Target className="w-4 h-4" />累计归档
                  </div>
                  <p className="text-3xl text-white font-light">{data.totalRecords}</p>
                </div>
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 text-white/60 mb-2">
                    <TrendingUp className="w-4 h-4" />周复盘频率
                  </div>
                  <p className="text-3xl text-white font-light">{data.reviewFrequencyPerWeek}</p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h3 className="text-sm text-white/70 mb-4 flex items-center gap-2">
                  <Heart className="w-4 h-4" />情绪分布
                </h3>
                <div className="space-y-3">
                  {data.emotionDistribution.map((item, i) => (
                    <div key={item.emotion}>
                      <div className="flex items-center justify-between text-sm text-white/75 mb-1">
                        <span>{item.label}</span>
                        <span>{item.percentage}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${item.percentage}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h3 className="text-sm text-white/70 mb-4">决策主题分布</h3>
                <div className="space-y-2">
                  {data.topicDistribution.length === 0 && <p className="text-sm text-white/45">暂无主题数据</p>}
                  {data.topicDistribution.map((topic, i) => (
                    <div key={topic.topic} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                      <span className="text-white/80 text-sm">
                        {i + 1}. {topic.topic}
                      </span>
                      <span className="text-white/50 text-sm">{topic.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h3 className="text-sm text-white/70 mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4" />AI 解释
                </h3>
                <p className="text-sm text-white/80 leading-6">{data.aiExplanation}</p>
                <div className="mt-4 p-3 rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-indigo-100 text-sm">
                  下周建议：{data.weeklyAdvice}
                </div>
                <div className="mt-3 text-xs text-white/45">当前主题重心：{topTopic}</div>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h3 className="text-sm text-white/70 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />偏见提醒卡片
                </h3>
                <div className="space-y-3">
                  {data.biasCards.map((card) => (
                    <div key={card.type} className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/85">{card.type}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                          风险{card.level}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-2">{card.evidence}</p>
                      <p className="text-sm text-white/75 mt-2">{card.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
