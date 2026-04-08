import { NextResponse } from "next/server";
import { readCouncilArchives, type ArchivedEmotion } from "@/lib/server/council-archive";
import { applyCors, corsPreflight } from "@/app/api/_cors";

export const runtime = "nodejs";
// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

const emotionLabels: Record<ArchivedEmotion, string> = {
  happy: "愉悦",
  sad: "低落",
  anxious: "焦虑",
  calm: "平静",
  excited: "兴奋",
};

function topTopics(keywords: string[]) {
  const counts = new Map<string, number>();
  for (const k of keywords) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => ({ topic, count }));
}

function calcFrequencyPerWeek(dates: string[]) {
  if (dates.length <= 1) return dates.length;
  const sorted = dates.map((d) => Date.parse(d)).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted.length;
  const spanDays = Math.max(1, (sorted[sorted.length - 1] - sorted[0]) / (1000 * 60 * 60 * 24));
  return Number(((sorted.length / spanDays) * 7).toFixed(1));
}

export async function GET(req: Request) {
  const archives = await readCouncilArchives();
  const total = archives.length;
  const allEmotions = archives.flatMap((a) => a.emotions);
  const allKeywords = archives.flatMap((a) => a.keywords);
  const emotionCounts = new Map<ArchivedEmotion, number>([
    ["happy", 0],
    ["sad", 0],
    ["anxious", 0],
    ["calm", 0],
    ["excited", 0],
  ]);
  for (const e of allEmotions) emotionCounts.set(e, (emotionCounts.get(e) ?? 0) + 1);

  const emotionDistribution = [...emotionCounts.entries()].map(([emotion, count]) => ({
    emotion,
    label: emotionLabels[emotion],
    count,
    percentage: total === 0 ? 0 : Math.round((count / total) * 100),
  }));

  const topicDistribution = topTopics(allKeywords);
  const reviewFrequency = calcFrequencyPerWeek(archives.map((a) => a.date));
  const anxiousRate = total === 0 ? 0 : ((emotionCounts.get("anxious") ?? 0) / total) * 100;
  const calmRate = total === 0 ? 0 : ((emotionCounts.get("calm") ?? 0) / total) * 100;
  const topicTop = topicDistribution[0]?.topic ?? "决策复盘";

  const biasCards = [
    {
      type: "冲动决策",
      level: anxiousRate >= 35 ? "高" : anxiousRate >= 20 ? "中" : "低",
      evidence: `焦虑情绪占比 ${Math.round(anxiousRate)}%`,
      suggestion: "在高压情境下引入 10 分钟冷却期，再进入最终选择。",
    },
    {
      type: "拖延规避",
      level: reviewFrequency < 2 ? "高" : reviewFrequency < 4 ? "中" : "低",
      evidence: `周均复盘频率 ${reviewFrequency} 次`,
      suggestion: "把每周至少 2 次复盘写入固定日程，降低执行阻力。",
    },
    {
      type: "过度规避风险",
      level: calmRate > 60 ? "中" : "低",
      evidence: `平静占比 ${Math.round(calmRate)}%，主题集中在「${topicTop}」`,
      suggestion: "每次决策保留 1 个可控探索选项，逐步提升风险承受带宽。",
    },
  ];

  const aiExplanation =
    total === 0
      ? "当前暂无足够归档数据，先完成 3-5 次议会对话后可生成稳定洞察。"
      : `最近共归档 ${total} 次决策，主题重心集中在「${topicTop}」。情绪分布显示焦虑占比 ${Math.round(
          anxiousRate,
        )}% ，建议在高压议题中采用“冷却-复盘-再决策”三段流程提升决策质量。`;

  const weeklyAdvice =
    reviewFrequency < 3
      ? "下周建议：固定 3 次 15 分钟复盘，优先回看高焦虑议题。"
      : "下周建议：保持复盘频率，并增加一次“反事实推演”训练。";

  return applyCors(req, NextResponse.json({
    totalRecords: total,
    reviewFrequencyPerWeek: reviewFrequency,
    emotionDistribution,
    topicDistribution,
    biasCards,
    aiExplanation,
    weeklyAdvice,
  }));
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

