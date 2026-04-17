import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  readCouncilArchives,
  type ArchivedEmotion,
  type CouncilArchiveRecord,
} from "@/lib/server/council-archive";
import { applyCors, corsPreflight } from "@/app/api/_cors";
import {
  dominantInsightEmotion,
  INSIGHT_TOPICS,
  primaryInsightTopic,
} from "@/lib/insights-classify";

export const runtime = "nodejs";
// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

function buildProviderRequestConfig(apiKey: string) {
  const baseUrl = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions";
  const url = new URL(baseUrl);
  const isVivo = /api-ai\.vivo\.com\.cn/i.test(url.hostname);
  if (isVivo && !url.searchParams.has("request_id")) {
    url.searchParams.set("request_id", randomUUID());
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  const vivoAppId = process.env.VIVO_APP_ID?.trim();
  if (isVivo && vivoAppId) {
    headers.app_id = vivoAppId;
  }
  return { url: url.toString(), headers };
}

const emotionLabels: Record<ArchivedEmotion, string> = {
  happy: "愉悦",
  sad: "低落",
  anxious: "焦虑",
  calm: "平静",
  excited: "兴奋",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const NOISE_SNIPPETS = [
  "欢迎来到今天的议会",
  "请各位代表发表意见",
  "语音情绪识别",
  "收到数字",
];

function inLast7Days(dateStr: string, nowMs: number) {
  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= WEEK_MS && nowMs - ts >= 0;
}

function normalizeText(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function isMeaningfulUserMessage(textRaw: string) {
  const text = normalizeText(textRaw);
  if (!text) return false;
  if (/^\d+$/.test(text)) return false;
  if (text.length < 2) return false;
  if (NOISE_SNIPPETS.some((s) => text.includes(s.toLowerCase()))) return false;
  return true;
}

function isValidArchiveForInsights(archive: CouncilArchiveRecord) {
  const userMessages = (archive.messages ?? []).filter((m) => m.role === "user");
  const meaningful = userMessages.filter((m) => isMeaningfulUserMessage(m.content));
  return meaningful.length > 0;
}

function archiveUserTextBlob(archive: CouncilArchiveRecord): string {
  const userMessages = (archive.messages ?? []).filter((m) => m.role === "user");
  const fromUser = userMessages.map((m) => m.content).join("\n").trim();
  if (fromUser) return fromUser;
  return (archive.messages ?? [])
    .map((m) => m.content)
    .join("\n")
    .trim();
}

function topicDistributionFromArchives(archives: CouncilArchiveRecord[]) {
  const nowMs = Date.now();
  const counts = new Map<string, number>(INSIGHT_TOPICS.map((t) => [t, 0]));

  for (const archive of archives) {
    if (!inLast7Days(archive.date, nowMs)) continue;
    const blob = archiveUserTextBlob(archive);
    const topic = primaryInsightTopic(blob);
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((acc, n) => acc + n, 0);
  return INSIGHT_TOPICS.map((topic) => {
    const count = counts.get(topic) ?? 0;
    return {
      topic,
      count,
      percentage: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });
}

type BiasCard = { type: string; level: string; evidence: string; suggestion: string };

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      // ignore
    }
  }
  return null;
}

async function buildAiBiasCards(input: {
  archives: CouncilArchiveRecord[];
  emotionDistribution: Array<{ label: string; percentage: number; count: number }>;
  topicDistribution: Array<{ topic: string; count: number; percentage: number }>;
  reviewFrequencyPerWeek: number;
  fallback: BiasCard[];
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) return input.fallback;

  const sample = input.archives
    .slice(0, 8)
    .map((a) => {
      const user = (a.messages ?? [])
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" | ");
      return `${a.date} | ${a.summary} | 用户: ${user}`;
    })
    .join("\n");

  const systemPrompt = [
    "你是决策心理分析助手，请根据输入统计和最近对话归档，给出3张“偏见提醒卡片”。",
    "只输出 JSON，不要 markdown。",
    '格式：{"biasCards":[{"type":"...", "level":"高|中|低", "evidence":"...", "suggestion":"..."}]}',
    "要求：",
    "1) type 使用简短中文（如 冲动决策/确认偏误/拖延规避 等）",
    "2) evidence 必须引用给定统计信号（情绪占比/主题次数/复盘频率）",
    "3) suggestion 必须可执行且具体",
  ].join("\n");

  const userPrompt = [
    `周复盘频率: ${input.reviewFrequencyPerWeek}`,
    `主题分布: ${JSON.stringify(input.topicDistribution)}`,
    `情绪分布: ${JSON.stringify(input.emotionDistribution)}`,
    "最近归档样本:",
    sample || "（无）",
  ].join("\n");

  const providerReq = buildProviderRequestConfig(apiKey);
  const res = await fetch(providerReq.url, {
    method: "POST",
    headers: providerReq.headers,
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) return input.fallback;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = extractJsonObject(content) as { biasCards?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.biasCards)) return input.fallback;
  const cards = parsed.biasCards
    .slice(0, 3)
    .map((c) => {
      const card = c as Record<string, unknown>;
      const levelRaw = typeof card.level === "string" ? card.level : "中";
      const level = levelRaw === "高" || levelRaw === "中" || levelRaw === "低" ? levelRaw : "中";
      return {
        type: typeof card.type === "string" ? card.type : "认知偏差",
        level,
        evidence: typeof card.evidence === "string" ? card.evidence : "统计证据不足",
        suggestion: typeof card.suggestion === "string" ? card.suggestion : "保持记录并定期复盘。",
      };
    })
    .filter((c) => c.type.trim().length > 0);
  return cards.length > 0 ? cards : input.fallback;
}

async function buildAiExplanation(input: {
  totalRecords: number;
  reviewFrequencyPerWeek: number;
  topicDistribution: Array<{ topic: string; count: number; percentage: number }>;
  emotionDistribution: Array<{ label: string; count: number; percentage: number }>;
  fallback: string;
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!apiKey) return input.fallback;

  const topTopic = input.topicDistribution.sort((a, b) => b.count - a.count)[0]?.topic ?? "暂无";
  const topEmotion = input.emotionDistribution.sort((a, b) => b.count - a.count)[0]?.label ?? "暂无";
  const systemPrompt = [
    "你是决策洞察助手，请基于提供的真实统计生成 1 段简短解释。",
    "要求：",
    "1) 必须引用输入中的具体数字（例如占比/次数/频率）",
    "2) 只输出中文纯文本，不要 markdown",
    "3) 长度 80~160 字",
    "4) 语气客观，不要编造数据",
  ].join("\n");
  const userPrompt = [
    `总归档数: ${input.totalRecords}`,
    `周复盘频率: ${input.reviewFrequencyPerWeek}`,
    `主题分布: ${JSON.stringify(input.topicDistribution)}`,
    `情绪分布: ${JSON.stringify(input.emotionDistribution)}`,
    `当前主题Top: ${topTopic}`,
    `当前情绪Top: ${topEmotion}`,
  ].join("\n");

  const providerReq = buildProviderRequestConfig(apiKey);
  const res = await fetch(providerReq.url, {
    method: "POST",
    headers: providerReq.headers,
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 260,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) return input.fallback;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return input.fallback;
  return content;
}

function calcFrequencyPerWeek(dates: string[]) {
  if (dates.length <= 1) return dates.length;
  const sorted = dates.map((d) => Date.parse(d)).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted.length;
  const spanDays = Math.max(1, (sorted[sorted.length - 1] - sorted[0]) / (1000 * 60 * 60 * 24));
  return Number(((sorted.length / spanDays) * 7).toFixed(1));
}

export async function GET(req: Request) {
  const archives = (await readCouncilArchives()).filter(isValidArchiveForInsights);
  const total = archives.length;
  if (total === 0) {
    return applyCors(
      req,
      NextResponse.json({
        totalRecords: 0,
        reviewFrequencyPerWeek: 0,
        emotionDistribution: [],
        topicDistribution: INSIGHT_TOPICS.map((topic) => ({ topic, count: 0, percentage: 0 })),
        biasCards: [],
        aiExplanation: "暂无有效归档数据。请先在对话页完成并保存若干轮真实对话后再查看洞察。",
        weeklyAdvice: "先完成 3-5 轮真实对话并点击“决策完成”保存。",
      }),
    );
  }
  const nowMs = Date.now();
  const weekArchives = archives.filter((a) => inLast7Days(a.date, nowMs));
  const emotionCounts = new Map<ArchivedEmotion, number>([
    ["happy", 0],
    ["sad", 0],
    ["anxious", 0],
    ["calm", 0],
    ["excited", 0],
  ]);
  for (const a of weekArchives) {
    const blob = archiveUserTextBlob(a);
    const e = dominantInsightEmotion(blob);
    emotionCounts.set(e, (emotionCounts.get(e) ?? 0) + 1);
  }
  const emotionSessionTotal = weekArchives.length;
  const emotionDistribution = [...emotionCounts.entries()].map(([emotion, count]) => ({
    emotion,
    label: emotionLabels[emotion],
    count,
    percentage: emotionSessionTotal === 0 ? 0 : Math.round((count / emotionSessionTotal) * 100),
  }));

  const topicDistribution = topicDistributionFromArchives(archives);
  const reviewFrequency = calcFrequencyPerWeek(archives.map((a) => a.date));
  const anxiousRate =
    emotionSessionTotal === 0 ? 0 : ((emotionCounts.get("anxious") ?? 0) / emotionSessionTotal) * 100;
  const calmRate =
    emotionSessionTotal === 0 ? 0 : ((emotionCounts.get("calm") ?? 0) / emotionSessionTotal) * 100;
  const topicTop =
    [...topicDistribution].sort((a, b) => b.count - a.count)[0]?.topic ?? "决策复盘";

  const fallbackBiasCards: BiasCard[] = [
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
  const biasCards = await buildAiBiasCards({
    archives,
    emotionDistribution: emotionDistribution.map((e) => ({ label: e.label, percentage: e.percentage, count: e.count })),
    topicDistribution: topicDistribution.map((t) => ({ topic: t.topic, count: t.count, percentage: t.percentage })),
    reviewFrequencyPerWeek: reviewFrequency,
    fallback: fallbackBiasCards,
  }).catch(() => fallbackBiasCards);

  const fallbackExplanation = `最近共归档 ${total} 次决策。主题重心为「${topicTop}」，焦虑占比 ${Math.round(
    anxiousRate,
  )}% ，周复盘频率 ${reviewFrequency} 次。建议继续使用“冷却-复盘-再决策”流程提升稳定性。`;
  const aiExplanation = await buildAiExplanation({
    totalRecords: total,
    reviewFrequencyPerWeek: reviewFrequency,
    topicDistribution: topicDistribution.map((t) => ({ topic: t.topic, count: t.count, percentage: t.percentage })),
    emotionDistribution: emotionDistribution.map((e) => ({ label: e.label, count: e.count, percentage: e.percentage })),
    fallback: fallbackExplanation,
  }).catch(() => fallbackExplanation);

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

