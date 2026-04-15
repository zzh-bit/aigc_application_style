"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Brain, Heart, Target, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { NebulaBackground } from "./nebula-background";
import { fetchJson, userFacingMessage } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";
import { storageGet } from "@/lib/storage";
import {
  dominantInsightEmotion,
  INSIGHT_TOPICS,
  primaryInsightTopic,
} from "@/lib/insights-classify";

interface DataInsightsProps {
  onBack: () => void;
}

type InsightResponse = {
  totalRecords: number;
  reviewFrequencyPerWeek: number;
  emotionDistribution: Array<{ emotion: string; label: string; count: number; percentage: number }>;
  topicDistribution: Array<{ topic: string; count: number; percentage?: number }>;
  biasCards: Array<{ type: string; level: string; evidence: string; suggestion: string }>;
  aiExplanation: string;
  weeklyAdvice: string;
};
type LocalArchiveRecord = {
  id: string;
  date: string;
  summary: string;
  emotions: Array<"happy" | "sad" | "anxious" | "calm" | "excited">;
  keywords: string[];
  messageCount: number;
  messages: Array<{ role: "user" | "assistant"; name: string; content: string }>;
};

const COLORS = ["#8B5CF6", "#60A5FA", "#34D399", "#F59E0B", "#F87171", "#A78BFA"];

function orderedTopicRows(raw: Array<{ topic: string; count: number; percentage?: number }>) {
  const map = new Map(raw.map((r) => [r.topic, r]));
  return INSIGHT_TOPICS.map((topic) => {
    const row = map.get(topic);
    const count = row && Number.isFinite(row.count) ? Math.max(0, row.count) : 0;
    const percentage =
      typeof row?.percentage === "number" && Number.isFinite(row.percentage) ? row.percentage : 0;
    return { topic, count, percentage };
  });
}

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
        const localArchives = await storageGet<LocalArchiveRecord[]>("council.archives.local.v1", []);
        const noise = ["欢迎来到今天的议会", "语音情绪识别", "收到数字"];
        const valid = localArchives.filter((a) => {
          const users = (a.messages ?? []).filter((m) => m.role === "user");
          const text = users.map((u) => u.content).join(" ").trim();
          if (!text || /^\d+$/.test(text)) return false;
          if (noise.some((n) => text.includes(n))) return false;
          return true;
        });
        const now = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const week = valid.filter((a) => {
          const ts = Date.parse(a.date);
          return Number.isFinite(ts) && now - ts <= weekMs && now - ts >= 0;
        });
        const totalRecords = valid.length;
        const reviewFrequencyPerWeek = week.length;
        const emotionKeys: Array<{ emotion: string; label: string }> = [
          { emotion: "happy", label: "愉悦" },
          { emotion: "sad", label: "低落" },
          { emotion: "anxious", label: "焦虑" },
          { emotion: "calm", label: "平静" },
          { emotion: "excited", label: "兴奋" },
        ];
        const emotionCountMap = new Map<string, number>(emotionKeys.map((k) => [k.emotion, 0]));
        for (const a of week) {
          const userText = (a.messages ?? [])
            .filter((m) => m.role === "user")
            .map((m) => m.content)
            .join("\n");
          const emo = dominantInsightEmotion(userText);
          emotionCountMap.set(emo, (emotionCountMap.get(emo) ?? 0) + 1);
        }
        const sessionWeek = week.length;
        const emotionDistribution = emotionKeys.map((k) => {
          const count = emotionCountMap.get(k.emotion) ?? 0;
          return {
            emotion: k.emotion,
            label: k.label,
            count,
            percentage: sessionWeek === 0 ? 0 : Math.round((count / sessionWeek) * 100),
          };
        });
        const topicCounts = new Map<string, number>(INSIGHT_TOPICS.map((t) => [t, 0]));
        for (const a of week) {
          const userText = (a.messages ?? [])
            .filter((m) => m.role === "user")
            .map((m) => m.content)
            .join("\n");
          const topic = primaryInsightTopic(userText);
          topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
        }
        const topicDistribution = INSIGHT_TOPICS.map((t) => {
          const count = topicCounts.get(t) ?? 0;
          return {
            topic: t,
            count,
            percentage: sessionWeek === 0 ? 0 : Math.round((count / sessionWeek) * 100),
          };
        });
        const anxiousRate = emotionDistribution.find((e) => e.emotion === "anxious")?.percentage ?? 0;
        const calmRate = emotionDistribution.find((e) => e.emotion === "calm")?.percentage ?? 0;
        const topTopic = [...topicDistribution].sort((a, b) => b.count - a.count)[0]?.topic ?? "暂无";
        const aiExplanation =
          totalRecords === 0
            ? "暂无有效归档数据。请先完成真实对话并点击“决策完成”保存。"
            : `近一周有效归档 ${reviewFrequencyPerWeek} 次（累计 ${totalRecords} 次），主题重心为「${topTopic}」，焦虑占比 ${Math.round(
                anxiousRate,
              )}% ，平静占比 ${Math.round(calmRate)}%。`;
        const localData: InsightResponse = {
          totalRecords,
          reviewFrequencyPerWeek,
          emotionDistribution,
          topicDistribution,
          biasCards: [
            {
              type: "冲动决策",
              level: anxiousRate >= 35 ? "高" : anxiousRate >= 20 ? "中" : "低",
              evidence: `焦虑占比 ${Math.round(anxiousRate)}%`,
              suggestion: "高压情境先冷却 10 分钟，再进入最终选择。",
            },
            {
              type: "拖延规避",
              level: reviewFrequencyPerWeek < 2 ? "高" : reviewFrequencyPerWeek < 4 ? "中" : "低",
              evidence: `近一周复盘 ${reviewFrequencyPerWeek} 次`,
              suggestion: "固定每周至少 2 次复盘并设置提醒。",
            },
            {
              type: "过度规避风险",
              level: calmRate > 60 ? "中" : "低",
              evidence: `平静占比 ${Math.round(calmRate)}%`,
              suggestion: "每次决策保留 1 个可控探索选项。",
            },
          ],
          aiExplanation,
          weeklyAdvice: reviewFrequencyPerWeek < 3 ? "下周建议：固定 3 次 15 分钟复盘。" : "下周建议：保持复盘并增加一次反事实推演。",
        };
        if (!cancelled) setData(localData);
      } catch (e) {
        clientLog("warn", "insights.load", "failed", { detail: String(e) });
        if (!cancelled) {
          setError(userFacingMessage(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const topTopic = useMemo(() => {
    if (!data?.topicDistribution?.length) return "暂无";
    return [...data.topicDistribution].sort((a, b) => b.count - a.count)[0]?.topic ?? "暂无";
  }, [data?.topicDistribution]);
  const normalizedTopics = useMemo(
    () => orderedTopicRows(data?.topicDistribution ?? []),
    [data?.topicDistribution],
  );

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
                <h3 className="text-sm text-white/70 mb-1 flex items-center gap-2">
                  <Heart className="w-4 h-4" />情绪分布
                </h3>
                <p className="text-xs text-white/40 mb-4">按每场归档的主导情绪计 1 票（近一周）</p>
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
                <h3 className="text-sm text-white/70 mb-1">决策主题分布</h3>
                <p className="text-xs text-white/40 mb-4">
                  固定五类主主题（每场归档计 1 次）：生活 / 工作 / 旅行 / 学习 / 情绪；统计范围为近一周
                </p>
                <div className="space-y-3">
                  {normalizedTopics.every((t) => t.count === 0) && <p className="text-sm text-white/45">近一周暂无有效主题数据</p>}
                  {normalizedTopics.map((topic, i) => {
                    const pct =
                      typeof topic.percentage === "number"
                        ? topic.percentage
                        : data.totalRecords > 0
                          ? Math.round((topic.count / data.totalRecords) * 100)
                          : 0;
                    return (
                      <div key={topic.topic}>
                        <div className="flex items-center justify-between text-sm text-white/75 mb-1">
                          <span>
                            {i + 1}. {topic.topic}
                          </span>
                          <span className="text-white/50 tabular-nums">
                            {topic.count} 场 · {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
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
