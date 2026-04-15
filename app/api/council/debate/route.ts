import { NextResponse } from "next/server";
import { buildMentorSystemPrompt, getMentorPromptProfile } from "@/lib/mentor/prompt-library";
import { applyCors, corsPreflight } from "@/app/api/_cors";

type RoleType = "radical" | "conservative" | "future" | "mentor" | "host";

type DebateRequestBody = {
  topic?: string;
  includeMentor?: boolean;
  /** 仅生成导师一条（用于议会「邀请导师」开场，避免在无用户发言时跑满五角色） */
  mentorInviteOnly?: boolean;
  mentorId?: string;
  /** 客户端传入的近期对话摘要（多轮追问时延续语境） */
  conversationContext?: string;
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

type FactionLearningProfile = {
  roleMemory: string;
  userConstraintHint: string;
  lastRolePoint: string;
};

const ROLE_META: Record<RoleType, { name: string; prompt: string }> = {
  radical: {
    name: "激进派",
    prompt:
      "你是激进派。倾向快速行动、抓住机会、鼓励突破。回答要具体，2-4句话，避免空话。若对话里已有他人观点，请提出与之不同的行动切入点，不要复述。",
  },
  conservative: {
    name: "保守派",
    prompt:
      "你是保守派。倾向风险控制、稳健策略、先评估后行动。回答要具体，2-4句话。请针对激进派可能忽略的风险与止损条件作答，避免重复其表述。",
  },
  future: {
    name: "未来派",
    prompt:
      "你是未来派。关注长期影响（1-5年）、复利成长与系统性布局。回答要具体，2-4句话。请从时间维度补充前两派未覆盖的长期后果与布局。",
  },
  host: {
    name: "主持人",
    prompt:
      "你是主持人。综合各方发言与用户需求，指出主要分歧点，并给出可执行折中方案（分1-2-3步）。2-5句话，语气中立。",
  },
  mentor: {
    name: "智库导师",
    prompt:
      "你是导师智库成员。在已有派系观点基础上，提供跨学科、可验证的补充视角与一句可执行建议，2-4句话，避免与前面观点同义反复。",
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

function buildRolePrompt(role: RoleType, personalityProfile: string, mentorId?: string, mentorInviteOnly?: boolean) {
  if (role === "mentor" && mentorId) {
    const profile = getMentorPromptProfile(mentorId);
    if (profile) {
      let sys = buildMentorSystemPrompt(profile);
      if (mentorInviteOnly) {
        sys +=
          "\n\n【当前情境：用户刚邀请你进入议会，三派可能尚未讨论或用户尚未输入议题。请先用2-4句做开场：欢迎用户、简要说明你的协助方式，并邀请其说出正在纠结的具体问题；不要虚构已有激进/保守/未来的发言。】";
      }
      return sys;
    }
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
    "5) 给出可执行建议，不要空话；",
    "6) 若上下文中已有其他角色发言，必须承接差异：补充、反驳或细化，禁止整段复述。",
    "7) 必须显式锚定当前议题：至少一次复述议题核心动作/对象（例如“去北京工作”），禁止泛泛而谈。",
  ].join("\n");
}

function parseConversationLines(conversationContext: string) {
  const rows = conversationContext
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parsed = rows
    .map((line) => {
      const idx = line.indexOf("：");
      if (idx < 0) return null;
      const name = line.slice(0, idx).trim();
      const content = line.slice(idx + 1).trim();
      if (!name || !content) return null;
      return { name, content };
    })
    .filter((x): x is { name: string; content: string } => Boolean(x));
  return parsed;
}

function inferFactionLearning(role: RoleType, conversationContext: string): FactionLearningProfile {
  const lines = parseConversationLines(conversationContext);
  const nameMap: Record<RoleType, string> = {
    radical: "激进派",
    conservative: "保守派",
    future: "未来派",
    mentor: "智库导师",
    host: "主持人",
  };
  const myName = nameMap[role];
  const roleLines = lines.filter((l) => l.name === myName).map((l) => l.content);
  const userLines = lines.filter((l) => l.name === "你" || l.name === "用户").map((l) => l.content);
  const roleBlob = roleLines.join(" ").toLowerCase();
  const userBlob = userLines.join(" ").toLowerCase();

  const memoryTags: string[] = [];
  if (/(马上|立刻|先做|先试|冲|执行|推进|别拖)/.test(roleBlob)) memoryTags.push("你过去偏好先行动拿反馈");
  if (/(止损|风险|边界|成本|保底|预算|最坏情况)/.test(roleBlob)) memoryTags.push("你过去强调风险边界与止损");
  if (/(长期|一年后|复利|路径依赖|系统|长期价值)/.test(roleBlob)) memoryTags.push("你过去强调长期复利与系统布局");
  if (/(先.*再|分阶段|小步|试点|复盘)/.test(roleBlob)) memoryTags.push("你过去偏好分阶段推进与复盘");
  if (memoryTags.length === 0) memoryTags.push("你需保持派系立场稳定，同时结合新信息微调");

  const userConstraints: string[] = [];
  if (/(预算|钱|现金流|收入|成本)/.test(userBlob)) userConstraints.push("预算/现金流");
  if (/(时间|ddl|截止|来不及|节奏)/.test(userBlob)) userConstraints.push("时间/节奏");
  if (/(家庭|父母|孩子|伴侣|关系)/.test(userBlob)) userConstraints.push("家庭/关系");
  if (/(健康|焦虑|压力|失眠|情绪)/.test(userBlob)) userConstraints.push("健康/情绪承受");
  if (/(offer|工作|求职|跳槽|学习|留学|考试)/.test(userBlob)) userConstraints.push("职业/学业决策");

  const lastRolePoint = roleLines.length > 0 ? roleLines[roleLines.length - 1].slice(0, 120) : "";
  return {
    roleMemory: memoryTags.slice(0, 2).join("；"),
    userConstraintHint:
      userConstraints.length > 0
        ? `用户反复提到的关键约束：${Array.from(new Set(userConstraints)).join("、")}`
        : "用户约束未充分暴露，请先用一问一句确认约束",
    lastRolePoint,
  };
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

function clipText(text: string, maxLen: number) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function extractTopicAnchors(topic: string): string[] {
  const t = topic.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const anchors: string[] = [];
  const direct = t.replace(/[，,。.!！?？；;：:]+$/g, "").trim();
  if (direct.length >= 2) anchors.push(direct);

  const actionMatch = direct.match(/(?:要不要|该不该|是否|需不需要|能不能|可不可以)(.+)$/u);
  if (actionMatch?.[1]) {
    const action = actionMatch[1].replace(/[吗呢吧呀啊嘛呗\s?？!！。,.，；;：:]+$/g, "").trim();
    if (action.length >= 2) anchors.push(action);
  }

  const chunks = direct.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z][a-zA-Z0-9_-]{2,}/g) ?? [];
  for (const c of chunks) {
    const lower = c.toLowerCase();
    if (/要不要|该不该|是否|怎么|如何|should|what|how|why/.test(lower)) continue;
    anchors.push(c);
  }
  return Array.from(new Set(anchors)).slice(0, 6);
}

function replyMentionsAnchor(reply: string, anchors: string[]): boolean {
  const pack = reply.replace(/\s+/g, "").toLowerCase();
  return anchors.some((a) => {
    const x = a.replace(/\s+/g, "").toLowerCase();
    return x.length >= 2 && pack.includes(x);
  });
}

function enforceReplyTopicAnchor(role: RoleType, reply: string, topic: string): string {
  const text = (reply ?? "").trim();
  if (!text) return text;
  const anchors = extractTopicAnchors(topic);
  if (anchors.length === 0) return text;
  if (replyMentionsAnchor(text, anchors)) return text;
  const focus = anchors[0];
  if (role === "host") return `${text} 请把结论落在「${focus}」这件事上，按步骤执行并复盘。`;
  return `${text} 我这条建议只围绕「${focus}」展开，避免跑题。`;
}

function buildDebateUserContent(input: {
  topic: string;
  memoryContext: string;
  conversationContext: string;
  priorRepliesInRound: string;
}) {
  const blocks: string[] = [];
  blocks.push(`当前议题：${input.topic}`);
  if (input.conversationContext.trim()) {
    blocks.push("", "近期议会对话（请延续语境，回应用户最新补充）：", input.conversationContext);
  }
  blocks.push("", "相关记忆摘录：", input.memoryContext || "无。");
  if (input.priorRepliesInRound.trim()) {
    blocks.push(
      "",
      "本轮中其他角色已发言如下：",
      input.priorRepliesInRound,
      "",
      "要求：不要简单重复他人结论；从本角色立场补充、反驳或细化；可点名回应其中一条具体观点。",
    );
  }
  blocks.push("", "请直接输出你的发言正文（不要加角色名前缀，不要用 Markdown 标题）。");
  return blocks.join("\n");
}

async function callDeepSeek(input: {
  apiKey: string;
  model: string;
  rolePrompt: string;
  topic: string;
  memoryContext: string;
  conversationContext: string;
  priorRepliesInRound: string;
  factionLearning: FactionLearningProfile;
  maxTokens: number;
}) {
  const rolePrompt = [
    input.rolePrompt,
    "",
    "【派系学习记忆】",
    `- 你在本会话的历史倾向：${input.factionLearning.roleMemory}`,
    `- ${input.factionLearning.userConstraintHint}`,
    input.factionLearning.lastRolePoint
      ? `- 你上一轮核心观点：${input.factionLearning.lastRolePoint}`
      : "- 你还没有历史发言，本轮先建立稳定立场基线",
    "- 你本轮必须延续派系特征，且相较上一轮至少新增一个具体动作或判断标准。",
  ].join("\n");
  const userContent = buildDebateUserContent({
    topic: input.topic,
    memoryContext: clipText(input.memoryContext, 1800),
    conversationContext: clipText(input.conversationContext, 2400),
    priorRepliesInRound: clipText(input.priorRepliesInRound, 2000),
  });

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      temperature: 0.65,
      max_tokens: input.maxTokens,
      messages: [
        { role: "system", content: rolePrompt },
        {
          role: "user",
          content: userContent,
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

function mockReply(
  role: RoleType,
  topic: string,
  memoryContext: string,
  priorInRound: string,
  factionLearning?: FactionLearningProfile,
  opts?: { mentorInviteOnly?: boolean; mentorId?: string },
) {
  if (role === "mentor" && opts?.mentorInviteOnly) {
    return "我已加入议会。请先用最直白的一句话说出你正在纠结的议题——我会结合你的记忆（若有）给出可执行的切入点与下一步。";
  }
  const hasPrior = priorInRound.trim().length > 0;
  if (role === "radical") {
    const learned = factionLearning?.roleMemory ? `（延续你的历史风格：${factionLearning.roleMemory}）` : "";
    return `就这个「${topic}」，先别想太多，这周直接做个小实验。动作要小、反馈要快，先跑起来再优化。${learned}`;
  }
  if (role === "conservative") {
    return hasPrior
      ? `在激进派主张先试的前提下，我建议给「${topic}」设清楚止损线与资源上限：哪些绝不能碰、到什么信号就暂停，再谈推进节奏。${factionLearning?.userConstraintHint ? `并优先满足${factionLearning.userConstraintHint.replace("用户反复提到的关键约束：", "")}。` : ""}`
      : `先稳住，别急着拍板。把「${topic}」的风险和底线先写清楚，再决定要不要推进。`;
  }
  if (role === "future") {
    return hasPrior
      ? `结合前面讨论，我更关注「${topic}」一年后是否还能带来复利：哪条路径在重复执行中成本更低、上限更高，值得你押注三个月。${factionLearning?.lastRolePoint ? "并在此基础上补一个月度复盘指标。" : ""}`
      : `从长期看，选那个一年后还能放大收益的方案。你现在多做一点积累，后面会轻松很多。`;
  }
  if (role === "mentor") {
    const memHint = memoryContext && memoryContext !== "无历史记忆可用。" ? "可对照你的记忆摘录，挑一条最相关的约束写进计划里。" : "";
    const profile = opts?.mentorId ? getMentorPromptProfile(opts.mentorId) : undefined;
    if (profile) {
      return `${profile.name}（离线示意）：关于「${topic}」，${profile.philosophy}先写清一个可量化指标，再做一周可验证的小步并复盘。${memHint}`.trim();
    }
    return `导师补充：针对「${topic}」，先写清“要优化的一个指标”，再做一周可验证的小步实验并记录复盘。${memHint}`.trim();
  }
  return `综合前面发言：分歧主要在节奏与风险承受。建议折中——先小步试点并设止损，同时选对一年后仍有复利的那条主线；可按“本周试点 → 两周复盘 → 一月固化”推进「${topic}」。`;
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
  const conversationContext =
    typeof body.conversationContext === "string" ? body.conversationContext.trim() : "";
  const mentorInviteOnly = body.mentorInviteOnly === true;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const order: RoleType[] = mentorInviteOnly
    ? ["mentor"]
    : body.includeMentor
      ? ["radical", "conservative", "future", "mentor", "host"]
      : ["radical", "conservative", "future", "host"];
  const replies: RoleReply[] = [];

  for (const role of order) {
    const meta = ROLE_META[role];
    let message = "";
    const priorRepliesInRound = replies
      .map((r) => `${ROLE_META[r.role].name}：${r.message}`)
      .join("\n");
    const factionLearning = inferFactionLearning(role, conversationContext);
    const maxTokens = role === "host" ? 300 : 240;
    if (apiKey) {
      try {
        message = await callDeepSeek({
          apiKey,
          model,
          rolePrompt: buildRolePrompt(role, personalityProfile, body.mentorId, mentorInviteOnly),
          topic,
          memoryContext,
          conversationContext,
          priorRepliesInRound,
          factionLearning,
          maxTokens,
        });
      } catch {
        message = mockReply(role, topic, memoryContext, priorRepliesInRound, factionLearning, {
          mentorInviteOnly,
          mentorId: body.mentorId,
        });
      }
    } else {
      message = mockReply(role, topic, memoryContext, priorRepliesInRound, factionLearning, {
        mentorInviteOnly,
        mentorId: body.mentorId,
      });
    }
    if (!(mentorInviteOnly && role === "mentor")) {
      message = enforceReplyTopicAnchor(role, message, topic);
    }
    replies.push({ role, name: meta.name, message });
  }

  return applyCors(req, NextResponse.json({ replies }));
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
