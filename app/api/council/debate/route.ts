import { NextResponse } from "next/server";
import { buildMentorSystemPrompt, getMentorPromptProfile } from "@/lib/mentor/prompt-library";
import { applyCors, corsPreflight } from "@/app/api/_cors";

type RoleType = "radical" | "conservative" | "future" | "mentor" | "host";

type DebateRequestBody = {
  topic?: string;
  includeMentor?: boolean;
  mentorId?: string;
  memories?: Array<{
    title?: string;
    summary?: string;
    keywords?: string[];
  }>;
};

type RoleReply = {
  role: RoleType;
  name: string;
  message: string;
};

const ROLE_META: Record<RoleType, { name: string; prompt: string }> = {
  radical: {
    name: "激进派",
    prompt:
      "你是激进派。倾向快速行动、抓住机会、鼓励突破。回答要具体，2-4句话，避免空话。",
  },
  conservative: {
    name: "保守派",
    prompt:
      "你是保守派。倾向风险控制、稳健策略、先评估后行动。回答要具体，2-4句话。",
  },
  future: {
    name: "未来派",
    prompt:
      "你是未来派。关注长期影响（1-5年）、复利成长与系统性布局。回答要具体，2-4句话。",
  },
  host: {
    name: "主持人",
    prompt:
      "你是主持人。你的任务是总结三方分歧并给出可执行折中方案（1-2-3步）。2-4句话。",
  },
  mentor: {
    name: "智库导师",
    prompt: "你是导师智库成员，提供跨学科、可执行的补充建议，2-4句话，避免空话。",
  },
};

export const runtime = "nodejs";
// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

function buildPersonalityProfile(memories: DebateRequestBody["memories"]) {
  if (!Array.isArray(memories) || memories.length === 0) {
    return "暂无明显性格线索，先按中性风格沟通。";
  }

  const text = memories
    .slice(0, 8)
    .map((m) => {
      const title = typeof m.title === "string" ? m.title : "";
      const summary = typeof m.summary === "string" ? m.summary : "";
      const keywords = Array.isArray(m.keywords) ? m.keywords.join(" ") : "";
      return `${title} ${summary} ${keywords}`.toLowerCase();
    })
    .join(" ");

  const has = (words: string[]) => words.some((w) => text.includes(w));
  const traits: string[] = [];

  if (has(["焦虑", "担心", "压力", "紧张", "anx", "worried"])) traits.push("对不确定性敏感，安全感需求高");
  if (has(["反思", "复盘", "思考", "记录", "总结"])) traits.push("有反思习惯，愿意做结构化复盘");
  if (has(["成长", "学习", "提升", "机会", "探索"])) traits.push("成长驱动明显，愿意尝试新机会");
  if (has(["关系", "朋友", "家人", "团队", "沟通"])) traits.push("重视关系质量与外部反馈");
  if (has(["稳定", "风险", "后悔", "冲动", "止损"])) traits.push("对风险较敏感，偏好可控路径");
  if (has(["自由", "自主", "选择", "突破"])) traits.push("重视自主性，不喜欢被过度约束");

  if (traits.length === 0) {
    traits.push("性格线索有限，先采用务实、温和、可执行的建议风格");
  }

  return traits.slice(0, 4).map((t, i) => `${i + 1}. ${t}`).join("\n");
}

function buildRolePrompt(role: RoleType, personalityProfile: string, mentorId?: string) {
  if (role === "mentor" && mentorId) {
    const profile = getMentorPromptProfile(mentorId);
    if (profile) return buildMentorSystemPrompt(profile);
  }
  const base = ROLE_META[role].prompt;
  return [
    base,
    "",
    "用户性格画像（基于历史记忆）：",
    personalityProfile,
    "",
    "请严格遵守：",
    "1) 你的立场必须鲜明，符合当前派系定位；",
    "2) 参考性格画像调整措辞和建议强度，不要忽视用户的心理承受度；",
    "3) 口语化表达，像真人对话，不要书面腔；",
    "4) 简洁：最多3句话，每句尽量短；",
    "5) 给出可执行建议，不要空话。",
  ].join("\n");
}

function buildMemoryContext(memories: DebateRequestBody["memories"]) {
  if (!Array.isArray(memories) || memories.length === 0) return "无历史记忆可用。";
  return memories
    .slice(0, 3)
    .map((m, i) => {
      const title = typeof m.title === "string" ? m.title : `记忆${i + 1}`;
      const summary = typeof m.summary === "string" ? m.summary : "";
      const keywords = Array.isArray(m.keywords) ? m.keywords.slice(0, 5).join("、") : "";
      return `${i + 1}. ${title}：${summary}${keywords ? `（关键词：${keywords}）` : ""}`;
    })
    .join("\n");
}

async function callDeepSeek(input: {
  apiKey: string;
  model: string;
  rolePrompt: string;
  topic: string;
  memoryContext: string;
}) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      max_tokens: 220,
      messages: [
        { role: "system", content: input.rolePrompt },
        {
          role: "user",
          content: `议题：${input.topic}\n\n历史记忆：\n${input.memoryContext}\n\n请根据历史记忆给出建议，尽量具体。`,
        },
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
  return content;
}

function mockReply(role: RoleType, topic: string, memoryContext: string) {
  if (role === "radical") {
    return `就这个「${topic}」，先别想太多，这周直接做个小实验。动作要小、反馈要快，先跑起来再优化。`;
  }
  if (role === "conservative") {
    return `先稳住，别急着拍板。把「${topic}」的风险和底线先写清楚，再决定要不要推进。`;
  }
  if (role === "future") {
    return `从长期看，选那个一年后还能放大收益的方案。你现在多做一点积累，后面会轻松很多。`;
  }
  if (role === "mentor") {
    return `导师补充：针对「${topic}」，建议先明确你真正的优先级，再做一周可验证的小步实验，并记录复盘。`;
  }
  return `总结一下：先小步行动，再设风险边界，同时盯住长期收益。你可以按“本周试点 -> 两周复盘 -> 一月固化”来推进。`;
}

export async function POST(req: Request) {
  let body: DebateRequestBody;
  try {
    body = (await req.json()) as DebateRequestBody;
  } catch {
    return applyCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) return applyCors(req, NextResponse.json({ error: "Missing topic" }, { status: 400 }));

  const memoryContext = buildMemoryContext(body.memories);
  const personalityProfile = buildPersonalityProfile(body.memories);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const order: RoleType[] = body.includeMentor
    ? ["radical", "conservative", "future", "mentor", "host"]
    : ["radical", "conservative", "future", "host"];
  const replies: RoleReply[] = [];

  for (const role of order) {
    const meta = ROLE_META[role];
    let message = "";
    if (apiKey) {
      try {
        message = await callDeepSeek({
          apiKey,
          model,
          rolePrompt: buildRolePrompt(role, personalityProfile, body.mentorId),
          topic,
          memoryContext,
        });
      } catch {
        message = mockReply(role, topic, memoryContext);
      }
    } else {
      message = mockReply(role, topic, memoryContext);
    }
    replies.push({ role, name: meta.name, message });
  }

  return applyCors(req, NextResponse.json({ replies }));
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
