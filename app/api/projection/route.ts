import { NextResponse } from "next/server";
import { applyCors, corsPreflight } from "@/app/api/_cors";

// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

type ProjectionRequestBody = {
  topic?: string;
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

function buildProjection(topic: string): ProjectionBranch[] {
  return [
    {
      id: "branch-1",
      name: "快速推进",
      probability: 0.78,
      riskScore: 72,
      benefitScore: 88,
      emotionForecast: "excited",
      description: `围绕「${topic}」直接执行，最快拿到外部反馈。短期压力会升高，但增长速度也更快。`,
      nodes: [
        { id: "n1", type: "emotion", label: "兴奋", sentiment: "positive", x: 0, y: 0 },
        { id: "n2", type: "event", label: "执行", sentiment: "neutral", x: 0, y: 0 },
        { id: "n3", type: "finance", label: "回报", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: {
        radical: { support: 93, opinion: "别再拖，马上开干。先把第一版做出来，边跑边改就是最优解。" },
        future: { support: 76, opinion: "适合做高密度试错，但要补一个复盘机制，避免短期冲刺透支长期。" },
        conservative: { support: 44, opinion: "风险偏高，建议加预算上限和时间止损，否则容易越陷越深。" },
      },
    },
    {
      id: "branch-2",
      name: "稳健观察",
      probability: 0.56,
      riskScore: 34,
      benefitScore: 61,
      emotionForecast: "calm",
      description: `围绕「${topic}」先做信息收集和小范围验证。风险低，但增长速度相对慢。`,
      nodes: [
        { id: "n4", type: "event", label: "调研", sentiment: "neutral", x: 0, y: 0 },
        { id: "n5", type: "finance", label: "稳定", sentiment: "neutral", x: 0, y: 0 },
        { id: "n6", type: "emotion", label: "安心", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: {
        radical: { support: 22, opinion: "太慢了，容易错过窗口期。你会把行动拖成无休止准备。" },
        future: { support: 58, opinion: "可以作为过渡路径，但建议给观察期设截止日期，避免无限延期。" },
        conservative: { support: 91, opinion: "这条路最可控。先稳住现金流和精力，再选择是否加码。" },
      },
    },
    {
      id: "branch-3",
      name: "协商折中",
      probability: 0.69,
      riskScore: 49,
      benefitScore: 79,
      emotionForecast: "happy",
      description: `围绕「${topic}」与相关方协商条件，争取资源与节奏的平衡，达成中间解。`,
      nodes: [
        { id: "n7", type: "event", label: "谈判", sentiment: "neutral", x: 0, y: 0 },
        { id: "n8", type: "finance", label: "优化", sentiment: "positive", x: 0, y: 0 },
        { id: "n9", type: "emotion", label: "满足", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: {
        radical: { support: 67, opinion: "谈可以，但别谈太久。给谈判设最后期限，过线就直接执行。" },
        future: { support: 90, opinion: "这是性价比最高的策略。通过结构化协商，把短期成本换成长期确定性。" },
        conservative: { support: 72, opinion: "相对稳妥，但要准备兜底方案，防止协商失败时被动。" },
      },
    },
  ];
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

function normalizeBranches(raw: unknown): ProjectionBranch[] | null {
  if (!raw || typeof raw !== "object") return null;
  const arr = (raw as { branches?: unknown }).branches;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: ProjectionBranch[] = [];
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i] as Record<string, unknown>;
    const id = typeof b.id === "string" ? b.id : `branch-${i + 1}`;
    const name = typeof b.name === "string" ? b.name : `路径 ${i + 1}`;
    const probability = typeof b.probability === "number" ? Math.min(1, Math.max(0, b.probability)) : 0.6;
    const riskScore = typeof b.riskScore === "number" ? b.riskScore : 50;
    const benefitScore = typeof b.benefitScore === "number" ? b.benefitScore : 50;
    const emotionForecast =
      typeof b.emotionForecast === "string" &&
      ["excited", "calm", "anxious", "happy", "sad"].includes(b.emotionForecast)
        ? (b.emotionForecast as ProjectionBranch["emotionForecast"])
        : "calm";
    const description = typeof b.description === "string" ? b.description : "";
    const opinionsIn = (b.opinions ?? {}) as Record<string, unknown>;
    const pickOpinion = (key: "radical" | "future" | "conservative") => {
      const o = opinionsIn[key] as Record<string, unknown> | undefined;
      return {
        support: typeof o?.support === "number" ? Math.min(100, Math.max(0, o.support)) : 50,
        opinion: typeof o?.opinion === "string" ? o.opinion : "",
      };
    };
    const nodesRaw = Array.isArray(b.nodes) ? b.nodes : [];
    const nodes = nodesRaw.slice(0, 6).map((n: unknown, j: number) => {
      const node = n as Record<string, unknown>;
      return {
        id: typeof node.id === "string" ? node.id : `n-${i}-${j}`,
        type:
          node.type === "emotion" || node.type === "finance" || node.type === "event"
            ? node.type
            : "event",
        label: typeof node.label === "string" ? node.label : "节点",
        sentiment:
          node.sentiment === "positive" || node.sentiment === "negative" || node.sentiment === "neutral"
            ? node.sentiment
            : "neutral",
        x: typeof node.x === "number" ? node.x : 0,
        y: typeof node.y === "number" ? node.y : 0,
      };
    });
    out.push({
      id,
      name,
      probability,
      riskScore,
      benefitScore,
      emotionForecast,
      description,
      nodes: nodes.length > 0 ? nodes : [{ id: `${id}-n0`, type: "event", label: "节点", sentiment: "neutral", x: 0, y: 0 }],
      opinions: {
        radical: pickOpinion("radical"),
        future: pickOpinion("future"),
        conservative: pickOpinion("conservative"),
      },
    });
  }
  return out.length >= 2 ? out : null;
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

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      // continue
    }
  }
  return null;
}

async function callDeepSeekProjection(input: { apiKey: string; model: string; topic: string }) {
  const system = [
    "你是「叙事推演」引擎，只输出合法 JSON，不要 markdown 代码块，不要任何解释文字。",
    "JSON 结构：",
    `{
  "branches": [
    {
      "id": "branch-1",
      "name": "路径名（简短）",
      "probability": 0.0到1.0,
      "riskScore": 0-100,
      "benefitScore": 0-100,
      "emotionForecast": "excited"|"calm"|"anxious"|"happy"|"sad",
      "description": "该路径下情感/财务/关键事件的叙事说明，2-4句",
      "nodes": [{"id":"n1","type":"emotion|finance|event","label":"标签","sentiment":"positive|neutral|negative","x":0,"y":0}],
      "opinions": {
        "radical": {"support":0-100,"opinion":"一句话"},
        "future": {"support":0-100,"opinion":"一句话"},
        "conservative": {"support":0-100,"opinion":"一句话"}
      }
    }
  ],
  "compared": {
    "branchA": "某条 branch id",
    "branchB": "另一条 branch id",
    "summary": "两条路径差异的一句话对比（中文）"
  }
}`,
    "要求：branches 必须 2～3 条，且针对用户议题；compared 必须是其中两条不同 id。",
  ].join("\n");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      max_tokens: 1800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `议题：${input.topic}\n请生成推演 JSON。` },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("DeepSeek empty response");
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON from model");
  return parsed as { branches?: unknown; compared?: unknown };
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: ProjectionRequestBody;
  try {
    body = (await req.json()) as ProjectionRequestBody;
  } catch {
    return applyCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const topic =
    typeof body.topic === "string" && body.topic.trim().length > 0 ? body.topic.trim() : "当前关键决策";

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  let branches: ProjectionBranch[] = buildProjection(topic);
  let comparedRaw: unknown = null;

  if (apiKey) {
    try {
      const ai = await callDeepSeekProjection({ apiKey, model, topic });
      const normalized = normalizeBranches(ai);
      if (normalized) {
        branches = normalized;
        comparedRaw = ai.compared;
      }
    } catch {
      branches = buildProjection(topic);
    }
  }

  const compared = normalizeCompared(comparedRaw, branches);

  return applyCors(req, NextResponse.json({
    topic,
    branches,
    compared,
  }));
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
