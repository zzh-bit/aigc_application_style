import { NextResponse } from "next/server";
import { applyCors, corsPreflight } from "@/app/api/_cors";
import {
  buildGroundedProjectionFromCouncil,
  type GroundedBranch,
  type GroundedCouncilMsg,
  projectionBranchesLookOffTopic,
} from "@/lib/projection-grounded";

// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

type ProjectionRequestBody = {
  /** 客户端占位或首轮议题；多轮时由 focusTopic 提供真实短句 */
  topic?: string;
  /** 议会页真实议题短句，与 topic 的「全文 hint」分离 */
  focusTopic?: string;
  contextMessages?: Array<{
    role?: string;
    name?: string;
    content?: string;
  }>;
};

type BranchOpinion = {
  opinion: string;
  support: number;
};

export type ProjectionBranch = {
  id: string;
  name: string;
  probability: number;
  riskScore: number;
  benefitScore: number;
  emotionForecast: "excited" | "calm" | "anxious" | "happy" | "sad";
  description: string;
  nodes: Array<{
    id: string;
    type: "emotion" | "finance" | "event";
    label: string;
    sentiment: "positive" | "neutral" | "negative";
    x: number;
    y: number;
  }>;
  opinions: Record<"radical" | "future" | "conservative", BranchOpinion>;
};

type ComparedPayload = {
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

function normalizeTopicSeed(input: string) {
  return input.replace(/\s+/g, " ").replace(/[。！？!?,，；;：:]+$/g, "").trim();
}

function isPlaceholderTopic(input: string | undefined) {
  const t = (input ?? "").trim();
  if (!t) return true;
  return t.includes("请据全文归纳核心决策") || t.startsWith("议会完整对话");
}

function deriveTopicFromContext(
  fallbackTopic: string,
  contextMessages: Array<{ role: string; name: string; content: string }>,
) {
  const userLines = contextMessages
    .filter((m) => {
      const role = (m.role ?? "").toLowerCase();
      const name = (m.name ?? "").trim();
      return role === "user" || name === "你" || name === "用户";
    })
    .map((m) => normalizeTopicSeed(m.content))
    .filter((s) => s.length > 0);
  if (userLines.length === 0) return normalizeTopicSeed(fallbackTopic) || "当前关键决策";

  const seed = normalizeTopicSeed(fallbackTopic);
  if (seed && !seed.startsWith("议会完整对话")) {
    const seedHit = userLines.some((line) => line.includes(seed) || seed.includes(line.slice(0, 16)));
    if (seedHit) return seed;
  }

  const decisionLine =
    [...userLines]
      .reverse()
      .find((line) =>
        /(要不要|是否|该不该|怎么选|如何选|去|留|换|跳槽|辞职|读研|留学|创业|搬家|结婚|分手|选择)/.test(line),
      ) ?? userLines[userLines.length - 1];
  return decisionLine.slice(0, 40) || "当前关键决策";
}

const EMOTION_FORECAST = new Set(["excited", "calm", "anxious", "happy", "sad"]);

/** 与客户端 buildGroundedProjectionFromCouncil 一致，避免 LLM 跑题 */
function mapGroundedToProjection(branches: GroundedBranch[]): ProjectionBranch[] {
  return branches.map((b) => {
    const ef = b.emotionForecast;
    const emotionForecast = EMOTION_FORECAST.has(ef)
      ? (ef as ProjectionBranch["emotionForecast"])
      : "calm";
    const r = b.opinions.radical;
    const f = b.opinions.future;
    const c = b.opinions.conservative;
    return {
      ...b,
      emotionForecast,
      opinions: {
        radical: { support: r?.support ?? 50, opinion: r?.opinion ?? "" },
        future: { support: f?.support ?? 50, opinion: f?.opinion ?? "" },
        conservative: { support: c?.support ?? 50, opinion: c?.opinion ?? "" },
      },
    };
  });
}

function defaultCompared(branches: ProjectionBranch[]): ComparedPayload {
  const [a, b] = [branches[0], branches[2] ?? branches[1]];
  return {
    branchA: a.id,
    branchB: b.id,
    summary: `${a.name} 收益更高但风险与波动更大；${b.name} 更均衡，适合在意稳定性的阶段。`,
    delta: {
      benefit: (a.benefitScore ?? 0) - (b.benefitScore ?? 0),
      risk: (a.riskScore ?? 0) - (b.riskScore ?? 0),
      emotionA: a.emotionForecast,
      emotionB: b.emotionForecast,
    },
  };
}

function normalizeCompared(raw: unknown, branches: ProjectionBranch[]): ComparedPayload {
  const fallback = defaultCompared(branches);
  if (!raw || typeof raw !== "object") return fallback;
  const c = raw as Record<string, unknown>;
  const branchA = typeof c.branchA === "string" ? c.branchA : fallback.branchA;
  const branchB = typeof c.branchB === "string" ? c.branchB : fallback.branchB;
  const summary = typeof c.summary === "string" ? c.summary : fallback.summary;
  const validA = branches.some((b) => b.id === branchA);
  const validB = branches.some((b) => b.id === branchB);
  const aData = branches.find((b) => b.id === (validA ? branchA : fallback.branchA));
  const bData = branches.find((b) => b.id === (validB ? branchB : fallback.branchB));
  return {
    branchA: validA ? branchA : fallback.branchA,
    branchB: validB ? branchB : fallback.branchB,
    summary,
    delta: {
      benefit: (aData?.benefitScore ?? 0) - (bData?.benefitScore ?? 0),
      risk: (aData?.riskScore ?? 0) - (bData?.riskScore ?? 0),
      emotionA: aData?.emotionForecast ?? "calm",
      emotionB: bData?.emotionForecast ?? "calm",
    },
  };
}

function clipStr(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * 将本地主题锚定骨架交给大模型：固定 id / 条数，展开具体选项并把 nodes 写成短语级关键词。
 */
function buildTemplateGuidedProjectionPrompt(
  topic: string,
  contextMessages: Array<{ role: string; name: string; content: string }>,
  branchSkeletonJson: string,
) {
  const chatHistory = contextMessages
    .map((m) => `${m.name || m.role}: ${m.content}`)
    .join("\n");

  return `你是「Parallel Self」决策推演助手。必须在单一主题下输出结构化 JSON，禁止跑题。

【当前主题】${topic}
所有分支名称、描述、派系意见、nodes 里的关键词都必须能直接对应上述主题（出现主题中的核心动作、地点、选项等），禁止替换成会议表决、议案投票、职场官僚套话。

【路径骨架】以下为系统根据主题与会话规则生成的路径骨架。你必须：
- 保持 branches 与骨架**条数一致、顺序一致**；
- 每条 branch 的 **id 必须与骨架中该条 id 完全一致**，禁止改名、禁止增删 id；
- 在骨架对应取向上，结合对话把 name、description 写得更具体可执行；
- 每个 branch 的 **nodes 必须恰好 3 个**，且 type 依次为 "event"、"finance"、"emotion"；每个 node 的 label 为 **≤16 字的提炼关键词**（短语，非长句），分别概括：关键动作/事件、成本或资源、情绪或心态；
- probability 为 0～1 小数；riskScore、benefitScore 为 0～100 整数；emotionForecast 只能是 "excited"|"calm"|"anxious"|"happy"|"sad"；
- opinions 必须含 radical、future、conservative；每项 opinion 为 2～3 句中文，紧扣主题与路径；support 为 0～100 整数。

【禁止用语】（除非用户主题本身就是开会投票）：妥协通过、激烈否决、延期再审、表决、议案、否决案、原则通过、复议等。

骨架 JSON：
${branchSkeletonJson}

【议会对话】
---
${chatHistory}
---

请只输出一个合法 JSON 对象（不要 markdown），顶层结构：
{
  "topic": "不超过12字的核心决策归纳",
  "branches": [ /* 与骨架同 id、同条数 */ ],
  "compared": { "branchA": "<某 branch.id>", "branchB": "<另一 branch.id>", "summary": "结合主题对比两条路径" }
}`;
}

function clampScore(n: unknown, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampProb(n: unknown, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeNodesFromLlm(
  raw: unknown,
  fallbackNodes: ProjectionBranch["nodes"],
  branchIdx: number,
): ProjectionBranch["nodes"] {
  const types: Array<"event" | "finance" | "emotion"> = ["event", "finance", "emotion"];
  const arr = Array.isArray(raw) ? raw : [];
  const out: ProjectionBranch["nodes"] = [];
  for (let i = 0; i < 3; i++) {
    const item = arr[i] as Record<string, unknown> | undefined;
    const fb = fallbackNodes[i];
    const type = types[i];
    let label = typeof item?.label === "string" && item.label.trim() ? item.label.trim() : fb?.label ?? "—";
    label = clipStr(label, 16);
    const sentiment =
      item?.sentiment === "positive" || item?.sentiment === "negative" || item?.sentiment === "neutral"
        ? item.sentiment
        : fb?.sentiment ?? "neutral";
    const id = typeof item?.id === "string" && item.id.trim() ? item.id.trim() : `n-${branchIdx}-${i}`;
    out.push({ id, type, label, sentiment, x: 0, y: 0 });
  }
  return out;
}

function mergeOpinions(
  raw: unknown,
  fallback: ProjectionBranch["opinions"],
): ProjectionBranch["opinions"] {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (key: "radical" | "future" | "conservative"): BranchOpinion => {
    const v = o[key];
    if (v && typeof v === "object") {
      const op = v as Record<string, unknown>;
      const opinion =
        typeof op.opinion === "string" && op.opinion.trim() ? op.opinion.trim() : fallback[key].opinion;
      return { opinion, support: clampScore(op.support, fallback[key].support) };
    }
    return fallback[key];
  };
  return { radical: pick("radical"), future: pick("future"), conservative: pick("conservative") };
}

function reconcileBranchesWithSkeleton(
  parsedBranches: unknown,
  skeleton: GroundedBranch[],
): ProjectionBranch[] {
  const arr = Array.isArray(parsedBranches) ? parsedBranches : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of arr) {
    if (p && typeof p === "object" && typeof (p as Record<string, unknown>).id === "string") {
      byId.set((p as Record<string, unknown>).id as string, p as Record<string, unknown>);
    }
  }
  return skeleton.map((skel, idx) => {
    const base = mapGroundedToProjection([skel])[0];
    const llm = byId.get(skel.id) ?? (arr[idx] as Record<string, unknown> | undefined);
    const raw = llm && typeof llm === "object" ? llm : {};
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : base.name;
    const description =
      typeof raw.description === "string" && raw.description.trim() ? raw.description.trim() : base.description;
    const emotionForecast = EMOTION_FORECAST.has(raw.emotionForecast as string)
      ? (raw.emotionForecast as ProjectionBranch["emotionForecast"])
      : base.emotionForecast;
    return {
      ...base,
      id: skel.id,
      name,
      description,
      probability: clampProb(raw.probability, base.probability),
      riskScore: clampScore(raw.riskScore, base.riskScore),
      benefitScore: clampScore(raw.benefitScore, base.benefitScore),
      emotionForecast,
      nodes: normalizeNodesFromLlm(raw.nodes, base.nodes, idx),
      opinions: mergeOpinions(raw.opinions, base.opinions),
    };
  });
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: ProjectionRequestBody;
  try {
    body = (await req.json()) as ProjectionRequestBody;
  } catch {
    return applyCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const topicRaw =
    typeof body.topic === "string" && body.topic.trim().length > 0 ? body.topic.trim() : "当前关键决策";
  const contextMessages = Array.isArray(body.contextMessages)
    ? body.contextMessages
        .map((m) => ({
          role: typeof m?.role === "string" ? m.role : "",
          name: typeof m?.name === "string" ? m.name : "",
          content: typeof m?.content === "string" ? m.content : "",
        }))
        .filter((m) => m.content.trim().length > 0)
        .slice(-48)
    : [];

  const effectiveTopic = deriveTopicFromContext(topicRaw, contextMessages);
  const focusTopicRaw = typeof body.focusTopic === "string" ? body.focusTopic.trim() : "";
  const promptTopic = normalizeTopicSeed(focusTopicRaw || effectiveTopic) || effectiveTopic;

  const grounded = buildGroundedProjectionFromCouncil(promptTopic, contextMessages as GroundedCouncilMsg[]);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  /** 设 PS2_PROJECTION_USE_LLM=0 可强制仅用本地骨架（调试用）；默认有 Key 则走模板引导大模型 */
  const skipProjectionLlm = process.env.PS2_PROJECTION_USE_LLM === "0";

  if (apiKey && !skipProjectionLlm) {
    try {
      const skeleton = grounded.branches.map((b) => ({
        id: b.id,
        name: b.name,
        summary: clipStr(b.description, 220),
        emotionForecast: b.emotionForecast,
        nodeHintLabels: b.nodes.map((n) => ({ type: n.type, label: n.label })),
      }));
      const branchSkeletonJson = JSON.stringify(skeleton);
      const prompt = buildTemplateGuidedProjectionPrompt(promptTopic, contextMessages, branchSkeletonJson);
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.45,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let content = data.choices?.[0]?.message?.content;
        if (content) {
          content = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
          const parsed = JSON.parse(content) as {
            topic?: string;
            branches?: unknown;
            compared?: unknown;
          };

          if (parsed.branches && Array.isArray(parsed.branches) && parsed.branches.length > 0) {
            const branches = reconcileBranchesWithSkeleton(parsed.branches, grounded.branches);

            // 模板合并后 id/条数已锚定；启发式跑题检测易误判（同义改写、模型换词），不再丢弃 LLM 结果
            if (
              projectionBranchesLookOffTopic(
                branches as GroundedBranch[],
                promptTopic,
                contextMessages as GroundedCouncilMsg[],
              )
            ) {
              console.warn("[ps2] projection: post-merge off-topic heuristics flagged; still returning LLM merge");
            }

            const compared = normalizeCompared(parsed.compared, branches);

            return applyCors(
              req,
              NextResponse.json({
                topic: isPlaceholderTopic(parsed.topic) ? promptTopic : (parsed.topic as string),
                branches,
                compared,
                meta: { source: "llm" as const },
              }),
            );
          }
        }
      } else {
        const errText = await res.text().catch(() => "");
        console.warn("[ps2] DeepSeek HTTP", res.status, errText.slice(0, 400));
      }
    } catch (e) {
      console.warn("[ps2] template-guided projection LLM failed, falling back to grounded only", e);
    }
  }

  const branches = mapGroundedToProjection(grounded.branches);
  const compared = normalizeCompared(grounded.compared, branches);

  return applyCors(
    req,
    NextResponse.json({
      topic: promptTopic,
      branches,
      compared,
      meta: {
        source: "grounded" as const,
        llmAttempted: Boolean(apiKey && !skipProjectionLlm),
      },
    }),
  );
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
