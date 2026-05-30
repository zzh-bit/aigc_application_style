/**
 * 静态导出 / APK 离线场景下 /api/projection 可能不可用或返回跑题结果。
 * 用「归纳议题 + 主持人总结 + 会话摘录」在客户端生成必与主题锚定的 2～3 条路径（含三派系意见）。
 */

export type GroundedCouncilMsg = { role: string; name: string; content: string };

export type GroundedBranch = {
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

export type GroundedCompared = {
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

const MEETING_PATH_LEXICON = /妥协通过|强硬否决|延期再议|表决通过|暂缓执行|原则通过|议案通过|投票否决|会议暂缓|否决案|复议通过/;

/** 决策树路径条数上限（与产品约定一致） */
export const MAX_PROJECTION_BRANCHES = 4;
export const MIN_PROJECTION_BRANCHES = 2;

const GENERIC_BLEND_PATH_NAME =
  /折中|妥协|中间路线|折中方案|双城折中|\/.*折中|折中或分期|折中试点|试点折中|「.*」\+「.*」折中|\+「.*」折中/;

/** 路径名不应包含议会聊天记录、派系标签、重复议题等 */
const INVALID_BRANCH_NAME =
  /你[:：]|激进派|保守派|未来派|主持人|导师|系统[:：]|综合前面|建议折中|降维优势|都有优势|别\.{2,}|还是|要不要|该不该|…{2,}/;

/** 主持人/兜底套话，不应出现在单条路径详情里 */
const GENERIC_HOST_BOILERPLATE =
  /综合前面发言|结合前面发言|结合前面各方发言|结合讨论：|建议折中|折中或分期|小步试点并设止损|分歧主要在节奏与风险|本周试点[\s→\-]*两周复盘|一月固化/g;

const MAJOR_CITIES = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "成都",
  "西安",
  "南京",
  "苏州",
  "武汉",
  "天津",
  "重庆",
  "厦门",
  "青岛",
];

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

/** 从「吃 A 还是喝 B」「去北京还是西安」等句式抽出两侧选项（非仅城市） */
export function splitEitherOrFromText(raw: string): { optionA: string; optionB: string } | null {
  const t = raw.replace(/\s+/g, " ").trim();
  const idx = t.indexOf("还是");
  if (idx < 1) return null;
  let left = t.slice(0, idx).trim();
  let right = t.slice(idx + 2).trim();
  if (!left || !right) return null;
  right = cleanEitherOrTail(right);
  left = cleanEitherOrHead(left);
  if (left.length < 1 || right.length < 1) return null;
  if (left.length > 42 || right.length > 42) return null;
  return { optionA: clip(left, 24), optionB: clip(right, 24) };
}

function cleanEitherOrTail(s: string): string {
  let x = s.trim();
  const punct = x.search(/[，,。、；;]/);
  if (punct >= 2) x = x.slice(0, punct).trim();
  x = x.replace(/和(以前|以往|过去|平时|昨晚|昨天).*$/, "").trim();
  x = x.replace(/跟(以前|以往|过去).*$/, "").trim();
  x = x.replace(/的问题.*$/u, "").trim();
  x = x.replace(/一样(?:的)?(?:问题|选择|纠结)?$/u, "").trim();
  x = x.replace(/吗[\s?？]*$/u, "").trim();
  return x;
}

function cleanEitherOrHead(s: string): string {
  let x = s.trim();
  x = x
    .replace(/^(请问|想问|我想问|不知道|该不该|要不要|是|到底|究竟|我又|我又想)+/u, "")
    .trim();
  x = x.replace(/^(今天|今晚|今天晚上|晚上|今早|早上|中午|下午)+/u, "").trim();
  return x;
}

function stripQuestionPrefix(raw: string): string {
  return raw
    .replace(/^[\s，,。.!！?？]*/u, "")
    .replace(/^(请问|我想问|想问|我在纠结|我纠结|纠结|我在考虑|我考虑|在考虑|考虑|到底|究竟|不知道|不确定)+/u, "")
    .replace(/^[\s，,。.!！?？]*/u, "")
    .trim();
}

function cleanDecisionAction(action: string): string {
  return action
    .replace(/^[\s，,。.!！?？]*(要不要|该不该|应不应该|是否|需不需要|能不能|可不可以)/u, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[吗呢吧呀啊嘛呗][\s?？!！。,.，]*$/u, "")
    .replace(/[\s?？!！。,.，；;：:]+$/u, "")
    .trim();
}

/** 提取「要不要X / 该不该X / 买不买X」中的动作 X，用于生成明确的做/不做分支 */
function extractBinaryDecisionAction(raw: string): string | null {
  const t = stripQuestionPrefix(raw.replace(/\s+/g, " ").trim());
  if (!t) return null;

  const yn = t.match(/(?:要不要|该不该|应不应该|是否|需不需要|能不能|可不可以)(.+)$/u);
  if (yn?.[1]) {
    const action = cleanDecisionAction(yn[1]);
    return action.length >= 2 ? clip(action, 28) : null;
  }

  // 处理「买不买学区房 / 去不去北京」这类 A不A 结构
  const aNotA = t.match(/^([\u4e00-\u9fa5A-Za-z]{1,3})不\1([\u4e00-\u9fa5A-Za-z0-9_-]{1,28})/u);
  if (aNotA) {
    const action = cleanDecisionAction(`${aNotA[1]}${aNotA[2]}`);
    return action.length >= 2 ? clip(action, 28) : null;
  }

  return null;
}

/** 英文议题：Should I … / Should we … */
function extractEnglishDecisionCore(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  const m = t.match(/^should (?:i|we)\s+(.+)$/i);
  if (!m?.[1]) return null;
  const rest = m[1].replace(/[?？!.。]+$/g, "").trim();
  return rest.length >= 3 ? clip(rest, 36) : null;
}

/**
 * 从主题与讨论摘录中抽出「核心决策语」，用于模板路径命名与决策树节点要点（避免泛化「积极行动」）。
 */
export function extractCoreDecisionPhrase(topic: string, hostRef: string): string {
  const blob = `${topic}\n${hostRef}`;
  const core =
    extractBinaryDecisionAction(topic) ??
    extractBinaryDecisionAction(hostRef) ??
    extractBinaryDecisionAction(blob) ??
    extractEnglishDecisionCore(topic) ??
    extractEnglishDecisionCore(hostRef) ??
    extractEnglishDecisionCore(blob);
  if (core) return core;
  let t = stripQuestionPrefix(topic.replace(/\s+/g, " ").trim());
  t = t.replace(/^(关于|针对)\s*/u, "").trim();
  if (t.length >= 2) return clip(t, 28);
  return clip(topic.replace(/\s+/g, " "), 20) || "该决策";
}

/** 三条路径共用的决策树节点：事件 / 成本 / 情绪要点，文案锚定主题核心语 */
function templateDistilledNodes(
  suffix: string,
  tone: "push" | "steady" | "blend",
  topicShort: string,
  core: string,
): GroundedBranch["nodes"] {
  const c = clip(core, 14);
  const t = clip(topicShort, 16);
  if (tone === "push") {
    return [
      { id: `td-${suffix}-e`, type: "event", label: `关键动作：${c}`, sentiment: "neutral", x: 0, y: 0 },
      { id: `td-${suffix}-f`, type: "finance", label: `成本/投入·${t}`, sentiment: "neutral", x: 0, y: 0 },
      { id: `td-${suffix}-m`, type: "emotion", label: "高压·高回报预期", sentiment: "neutral", x: 0, y: 0 },
    ];
  }
  if (tone === "steady") {
    return [
      { id: `td-${suffix}-e`, type: "event", label: `先稳住：不强行${c}`, sentiment: "neutral", x: 0, y: 0 },
      { id: `td-${suffix}-f`, type: "finance", label: `控制支出·${t}`, sentiment: "positive", x: 0, y: 0 },
      { id: `td-${suffix}-m`, type: "emotion", label: "压力较低·可复盘", sentiment: "positive", x: 0, y: 0 },
    ];
  }
  return [
    { id: `td-${suffix}-e`, type: "event", label: `试点：小步验证${c}`, sentiment: "neutral", x: 0, y: 0 },
    { id: `td-${suffix}-f`, type: "finance", label: `分段投入·设上限`, sentiment: "neutral", x: 0, y: 0 },
    { id: `td-${suffix}-m`, type: "emotion", label: "可进可退·缓冲", sentiment: "positive", x: 0, y: 0 },
  ];
}

function optionMentionedInText(text: string, opt: string): boolean {
  const u = text.replace(/\s+/g, "");
  if (u.includes(opt.replace(/\s+/g, ""))) return true;
  if (opt.length >= 4) {
    const tail = opt.slice(-4);
    if (tail.length >= 2 && u.includes(tail)) return true;
  }
  return false;
}

/** 主题或主持人里若存在「A还是B」，用于校验模型是否两边都落到文案里 */
export function eitherOrPairFromTopicOrHost(topic: string, hostOrDigest: string): { optionA: string; optionB: string } | null {
  return splitEitherOrFromText(topic) ?? splitEitherOrFromText(hostOrDigest) ?? splitEitherOrFromText(`${topic}\n${hostOrDigest}`);
}

export function branchesMissEitherOrAnchors(
  branches: Array<{ name: string; description: string }>,
  pair: { optionA: string; optionB: string },
): boolean {
  const union = branches.map((b) => `${b.name}${b.description}`).join("");
  return !optionMentionedInText(union, pair.optionA) || !optionMentionedInText(union, pair.optionB);
}

function orderedCitiesInTopic(text: string): string[] {
  const hits: { c: string; i: number }[] = [];
  for (const c of MAJOR_CITIES) {
    const i = text.indexOf(c);
    if (i >= 0) hits.push({ c, i });
  }
  hits.sort((a, b) => a.i - b.i);
  const out: string[] = [];
  for (const h of hits) {
    if (!out.includes(h.c)) out.push(h.c);
  }
  return out;
}

function isPersonalLifeBlob(blob: string): boolean {
  return /工作|生活|城市|买房|结婚|读书|留学|考研|跳槽|分手|出国|去留|北京|上海|西安|广州|深圳|杭州|成都/.test(blob);
}

export function extractHostSummary(messages: GroundedCouncilMsg[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const name = (messages[i].name ?? "").trim();
    if (name === "主持人") {
      const c = (messages[i].content ?? "").trim();
      if (c) return clip(c, 1400);
    }
  }
  return "";
}

function lastFactionLine(messages: GroundedCouncilMsg[], factionName: string): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if ((messages[i].name ?? "").trim() === factionName) {
      const c = (messages[i].content ?? "").trim();
      if (c) return clip(c, 280);
    }
  }
  return "";
}

function opPair(support: number, opinion: string) {
  return { support, opinion };
}

/**
 * 三派系简短意见：按议题域类型 × 节奏生成具体建议，锚定话题关键词。
 * pathFocus 为本条路径的标签（选项名/城市/节奏名）。
 */
function opinionsForPath(
  topicShort: string,
  pathFocus: string,
  tone: "push" | "steady" | "blend",
  ctx: { foodish?: boolean; blendPeer?: string; cityMode?: boolean },
): GroundedBranch["opinions"] {
  const t = clip(topicShort.replace(/\s+/g, " "), 40);
  const p = clip(pathFocus, 16);
  const food = ctx.foodish ?? false;
  const blendPeer = ctx.blendPeer ? clip(ctx.blendPeer, 20) : "";
  const defaultSupport: Record<FactionKey, Record<"push" | "steady" | "blend", number>> = {
    radical: { push: 84, steady: 34, blend: 58 },
    future: { push: 68, steady: 72, blend: 86 },
    conservative: { push: 42, steady: 88, blend: 76 },
  };
  const foodSupport: Record<FactionKey, Record<"push" | "steady" | "blend", number>> = {
    radical: { push: 82, steady: 36, blend: 58 },
    future: { push: 66, steady: 74, blend: 86 },
    conservative: { push: 44, steady: 88, blend: 76 },
  };

  // 饮食类议题保持原有简单逻辑（食物相关的话题不需要 domain 感知）
  if (food) {
    const sup = foodSupport;
    if (tone === "push") {
      return {
        radical: opPair(sup.radical.push, `激进派：想选「${p}」就别久拖——适量，别影响休息和肠胃。`),
        future: opPair(sup.future.push, `未来派：隔天若有要事，「${p}」点到为止，留状态。`),
        conservative: opPair(sup.conservative.push, `保守派：太晚或胃不舒服就减量「${p}」，别硬撑。`),
      };
    }
    if (tone === "steady") {
      return {
        radical: opPair(sup.radical.steady, `激进派：怕「${p}」太寡淡就加点搭配，别又报复性乱吃。`),
        future: opPair(sup.future.steady, `未来派：「${p}」更利身体与作息时，值得优先。`),
        conservative: opPair(sup.conservative.steady, `保守派：今晚「${p}」最省心、最稳。`),
      };
    }
    return {
      radical: opPair(sup.radical.blend, `激进派：折中可以，今晚定主调，别越吃越杂。`),
      future: opPair(sup.future.blend, `未来派：先试折中方案，感受再选更偏哪一侧。`),
      conservative: opPair(sup.conservative.blend, `保守派：控制总量，盯紧肠胃与睡眠。`),
    };
  }

  // 检测域类型，使用领域感知模板
  const kind = detectDomainKind(`${t}\n${p}`);
  const templates = RICH_OPINIONS[kind]?.[tone] ?? RICH_OPINIONS.generic[tone];
  const sup = defaultSupport;

  // 注入话题锚点（{focus}=路径标签, {topic}=议题），确保意见提到具体话题关键词
  const radicalText = templates.radical
    .replace(/\{focus\}/g, p)
    .replace(/\{topic\}/g, t);
  let futureText = templates.future
    .replace(/\{focus\}/g, p)
    .replace(/\{topic\}/g, t);
  let conservativeText = templates.conservative
    .replace(/\{focus\}/g, p)
    .replace(/\{topic\}/g, t);

  // 确保全文话题关键词一定出现在某条意见中（用于 off-topic 检测锚定）
  if (!radicalText.includes(t) && !futureText.includes(t) && !conservativeText.includes(t)) {
    conservativeText = `${conservativeText}（围绕「${t}」）`;
  }

  // 为 blend 城市/选项模式注入两侧名称
  if (blendPeer && (ctx.cityMode || tone === "blend")) {
    futureText = futureText.replace(/之间/gu, `（${blendPeer}）之间`);
  }

  return {
    radical: opPair(sup.radical[tone], radicalText),
    future: opPair(sup.future[tone], futureText),
    conservative: opPair(sup.conservative[tone], conservativeText),
  };
}

function eitherOrTripleBranches(topic: string, hostRef: string, optA: string, optB: string): GroundedBranch[] {
  const topicShort = clip(topic.replace(/\s+/g, " "), 52);
  const intro = hostRef.trim() ? `结合讨论：${clip(hostRef, 200)}。` : "";
  const foodish = /吃|喝|粥|烫|饭|面|夜宵|宵夜|外卖|辣|清淡|饿|口味|晚餐|火锅|烧烤/.test(
    `${optA}${optB}${topicShort}`,
  );

  const descA = foodish
    ? `${intro}今晚选「${optA}」：口味满足感更强，但油盐辣与肠胃负担可能更高，对应「${topicShort}」里更「过瘾」的一侧。`
    : `${intro}主选「${optA}」：在「${topicShort}」中押这一侧，收益与代价随该选项倾斜。`;

  const descB = foodish
    ? `${intro}今晚选「${optB}」：更温和、身体负担通常更小，但可能少了一点即时满足；对应「${topicShort}」里更稳的一侧。`
    : `${intro}主选「${optB}」：在「${topicShort}」中押另一侧，节奏与风险轮廓会不同。`;

  const descMix = foodish
    ? `${intro}折中：如麻辣烫少油少辣、小份；或粥配清淡小菜/加蛋白；先垫一口再决定——在「${optA}」与「${optB}」之间换平衡。`
    : `${intro}折中或分期：小步试水、设截止再收敛，避免在「${optA}」与「${optB}」间无限拖延。`;

  const labelA = clip(optA, 12);
  const labelB = clip(optB, 12);

  return [
    {
      id: "grounded-either-a",
      name: `选「${labelA}」`,
      probability: 0.4,
      riskScore: foodish ? 55 : 58,
      benefitScore: foodish ? 78 : 76,
      emotionForecast: "excited",
      description: descA,
      nodes: [
        { id: "eo-a1", type: "event", label: foodish ? "开吃" : "落实A", sentiment: "neutral", x: 0, y: 0 },
        { id: "eo-a2", type: "finance", label: foodish ? "外卖/店" : "成本", sentiment: "neutral", x: 0, y: 0 },
        { id: "eo-a3", type: "emotion", label: foodish ? "过瘾" : "投入", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: opinionsForPath(topicShort, labelA, "push", { foodish }),
    },
    {
      id: "grounded-either-b",
      name: `选「${labelB}」`,
      probability: 0.38,
      riskScore: foodish ? 28 : 40,
      benefitScore: foodish ? 64 : 66,
      emotionForecast: "calm",
      description: descB,
      nodes: [
        { id: "eo-b1", type: "event", label: foodish ? "清淡一餐" : "落实B", sentiment: "neutral", x: 0, y: 0 },
        { id: "eo-b2", type: "finance", label: foodish ? "简单省事" : "可控", sentiment: "positive", x: 0, y: 0 },
        { id: "eo-b3", type: "emotion", label: "更稳", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: opinionsForPath(topicShort, labelB, "steady", { foodish }),
    },
    {
      id: "grounded-either-mix",
      name: `「${labelA}」+「${labelB}」折中`,
      probability: 0.3,
      riskScore: 45,
      benefitScore: 74,
      emotionForecast: "happy",
      description: descMix,
      nodes: [
        { id: "eo-m1", type: "event", label: "搭配/减量", sentiment: "neutral", x: 0, y: 0 },
        { id: "eo-m2", type: "finance", label: "可控花费", sentiment: "neutral", x: 0, y: 0 },
        { id: "eo-m3", type: "emotion", label: "平衡", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: opinionsForPath(topicShort, "折中", "blend", {
        foodish,
        blendPeer: `「${labelA}」与「${labelB}」`,
      }),
    },
  ];
}

function binaryDecisionTripleBranches(topic: string, hostRef: string, action: string): GroundedBranch[] {
  const topicShort = clip(topic.replace(/\s+/g, " "), 52);
  const intro = hostRef.trim() ? `结合讨论：${clip(hostRef, 200)}。` : "";
  const act = clip(action, 16);
  const kind = detectDomainKind(`${topic}\n${hostRef}\n${action}`);

  const profile: Record<
    DomainKind,
    {
      pushName: string;
      steadyName: string;
      blendName: string;
      pushDesc: string;
      steadyDesc: string;
      blendDesc: string;
    }
  > = {
    career: {
      pushName: `主动推进「${act}」`,
      steadyName: `留在现状观察「${act}」`,
      blendName: `低风险试跑「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，主动推进「${action}」：投递/面试/谈判等动作同步展开，反馈快但波动更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先留在现状观察「${action}」：补齐岗位、现金流与健康信息，风险更稳但窗口可能收窄。`,
      blendDesc: `${intro}围绕「${topicShort}」，先做低风险试跑（简历、作品集、人脉试探），设复盘日后再决定是否全面推进「${action}」。`,
    },
    relationship: {
      pushName: `正面沟通「${act}」`,
      steadyName: `暂缓升级「${act}」`,
      blendName: `分阶段验证「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，把「${action}」落到一次明确沟通：目标、边界、底线一次说清，推进快但情绪波动更大。`,
      steadyDesc: `${intro}围绕「${topicShort}」，暂缓升级「${action}」：先给彼此空间与时间观察一致性，冲突更少但悬而未决风险更高。`,
      blendDesc: `${intro}围绕「${topicShort}」，对「${action}」做分阶段验证：先看关键行为指标与期限，再决定升级投入或调整方向。`,
    },
    finance: {
      pushName: `分批执行「${act}」`,
      steadyName: `保留现金暂缓「${act}」`,
      blendName: `小额验证「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，分批执行「${action}」并设置规则（预算上限、止损/止盈），反馈快但回撤也更明显。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先保留现金暂缓「${action}」：确定性更高，但可能错过短期机会。`,
      blendDesc: `${intro}围绕「${topicShort}」，先用小额/试用验证「${action}」的真实收益曲线，达标再扩大投入。`,
    },
    study: {
      pushName: `全力投入「${act}」`,
      steadyName: `延后投入「${act}」`,
      blendName: `试学试跑「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，全力投入「${action}」并拉齐周计划，进展最快但负荷更大。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先延后「${action}」，打稳时间与状态基本盘，风险更可控但速度较慢。`,
      blendDesc: `${intro}围绕「${topicShort}」，先做 2～3 周试学试跑，再决定是否升级到全量投入「${action}」。`,
    },
    health: {
      pushName: `立刻干预「${act}」`,
      steadyName: `先休整再看「${act}」`,
      blendName: `习惯化推进「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，立刻干预「${action}」：今天就执行最小可行动作，止损快但执行压力更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先休整再看「${action}」：先恢复到可决策状态，降低误判。`,
      blendDesc: `${intro}围绕「${topicShort}」，把「${action}」做成可持续习惯（触发器+频率+复盘），稳步推进。`,
    },
    move: {
      pushName: `推进落地「${act}」`,
      steadyName: `暂留原地评估「${act}」`,
      blendName: `过渡试点「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，推进落地「${action}」：资源切换更快，但适应与成本压力更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先暂留原地评估「${action}」：先稳现金流与生活秩序，降低风险。`,
      blendDesc: `${intro}围绕「${topicShort}」，先做短租/远程/双城过渡试点，再决定是否全面迁移推进「${action}」。`,
    },
    buy: {
      pushName: `立即决策「${act}」`,
      steadyName: `先不下单「${act}」`,
      blendName: `试用后再定「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，立即决策「${action}」：立刻获得使用反馈，但后悔成本更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先不下单「${action}」：先比较替代方案与后续支出，更稳但可能错过优惠窗口。`,
      blendDesc: `${intro}围绕「${topicShort}」，先试用/租借/小规格验证「${action}」，满意再升级。`,
    },
    startup: {
      pushName: `快速上线「${act}」`,
      steadyName: `先验证「${act}」`,
      blendName: `小范围试点「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，快速上线「${action}」获取真实用户反馈，进展快但资源消耗更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先验证需求与商业闭环再推进「${action}」，风险更可控。`,
      blendDesc: `${intro}围绕「${topicShort}」，先在小范围试点「${action}」，达成关键指标后再扩大投入。`,
    },
    travel: {
      pushName: `按计划出发「${act}」`,
      steadyName: `延后「${act}」`,
      blendName: `轻量版执行「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，按计划出发执行「${action}」，体验收益高但改签与超支风险更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先延后「${action}」，等待预算与时间更匹配，风险较低。`,
      blendDesc: `${intro}围绕「${topicShort}」，先做轻量版方案执行「${action}」（短途/缩时/降预算），平衡体验与成本。`,
    },
    parenting: {
      pushName: `立即执行「${act}」`,
      steadyName: `先观察「${act}」`,
      blendName: `分步试行「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，立即执行「${action}」并快速观察孩子反馈，推进快但磨合成本更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先观察孩子节奏与家庭承受度，再决定是否推进「${action}」。`,
      blendDesc: `${intro}围绕「${topicShort}」，分步试行「${action}」并按周复盘，再决定是否扩大执行。`,
    },
    legal: {
      pushName: `依法推进「${act}」`,
      steadyName: `先协商「${act}」`,
      blendName: `协商+备诉「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，依法推进「${action}」路径（证据、函件、程序），止损明确但时间成本高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先协商处理「${action}」，成本较低但执行约束力可能不足。`,
      blendDesc: `${intro}围绕「${topicShort}」，协商与备诉并行推进「${action}」，保留转入正式流程的主动权。`,
    },
    content: {
      pushName: `高频产出「${act}」`,
      steadyName: `精品化「${act}」`,
      blendName: `双轨试验「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，高频产出推进「${action}」，增长潜力高但可能透支。`,
      steadyDesc: `${intro}围绕「${topicShort}」，转向精品化推进「${action}」，质量稳定但起量更慢。`,
      blendDesc: `${intro}围绕「${topicShort}」，采用双轨试验推进「${action}」，按数据复盘后再收敛策略。`,
    },
    social: {
      pushName: `主动拓展「${act}」`,
      steadyName: `维护核心关系「${act}」`,
      blendName: `节奏化经营「${act}」`,
      pushDesc: `${intro}围绕「${topicShort}」，主动拓展推进「${action}」，机会更多但时间投入更高。`,
      steadyDesc: `${intro}围绕「${topicShort}」，先维护核心关系再推进「${action}」，节奏更稳。`,
      blendDesc: `${intro}围绕「${topicShort}」，按固定节奏做维护+拓展组合动作推进「${action}」。`,
    },
    generic: {
      pushName: `推进「${act}」`,
      steadyName: `暂缓「${act}」`,
      blendName: `分步验证「${act}」`,
      pushDesc: `${intro}主选推进「${action}」：直接投入并换取真实反馈，对「${topicShort}」推进最快，但短期波动更大。`,
      steadyDesc: `${intro}主选暂缓「${action}」：先守住现状并补信息，风险更可控，但可能错过窗口期。`,
      blendDesc: `${intro}折中方案：围绕「${action}」先做低成本试点，设定触发条件后再决定全面推进或继续观望。`,
    },
  };
  const p = profile[kind];

  return [
    {
      id: "grounded-yes-action",
      name: p.pushName,
      probability: 0.4,
      riskScore: 56,
      benefitScore: 80,
      emotionForecast: "excited",
      description: p.pushDesc,
      nodes: templateDistilledNodes("yn-yes", "push", topicShort, action),
      opinions: opinionsForPath(topicShort, p.pushName, "push", {}),
    },
    {
      id: "grounded-no-action",
      name: p.steadyName,
      probability: 0.34,
      riskScore: 34,
      benefitScore: 62,
      emotionForecast: "calm",
      description: p.steadyDesc,
      nodes: templateDistilledNodes("yn-no", "steady", topicShort, action),
      opinions: opinionsForPath(topicShort, p.steadyName, "steady", {}),
    },
    {
      id: "grounded-trial-action",
      name: p.blendName,
      probability: 0.32,
      riskScore: 46,
      benefitScore: 74,
      emotionForecast: "happy",
      description: p.blendDesc,
      nodes: templateDistilledNodes("yn-mix", "blend", topicShort, action),
      opinions: opinionsForPath(topicShort, p.blendName, "blend", {
        blendPeer: `「${p.pushName}」与「${p.steadyName}」`,
      }),
    },
  ];
}

/** 二选一「还是」优先于单纯双城；无「还是」时再尝试两座城市锚点 */
export function getStructuredChoiceBranches(displayTopic: string, hostRef: string): GroundedBranch[] | null {
  const topic = (displayTopic ?? "").trim();
  const host = (hostRef ?? "").trim();
  const blob = `${topic}\n${host}`;
  const pair = splitEitherOrFromText(topic) ?? splitEitherOrFromText(host) ?? splitEitherOrFromText(blob);
  if (pair) return eitherOrTripleBranches(topic, host, pair.optionA, pair.optionB);
  const binaryAction =
    extractBinaryDecisionAction(topic) ?? extractBinaryDecisionAction(host) ?? extractBinaryDecisionAction(blob);
  if (binaryAction) return binaryDecisionTripleBranches(topic, host, binaryAction);
  const cities = orderedCitiesInTopic(blob);
  if (cities.length >= 2) return cityTripleBranches(topic, host, cities[0], cities[1]);
  return null;
}

function hostOrFactionDigest(messages: GroundedCouncilMsg[], topic: string): string {
  const host = extractHostSummary(messages);
  if (host) return host;
  const r = lastFactionLine(messages, "激进派");
  const c = lastFactionLine(messages, "保守派");
  const f = lastFactionLine(messages, "未来派");
  if (!r && !c && !f) return "";
  return [
    "（尚无主持人收束，以下为三派最近观点摘录，供推演锚定）",
    r ? `激进派：${r}` : "",
    c ? `保守派：${c}` : "",
    f ? `未来派：${f}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function cityTripleBranches(topic: string, hostRef: string, cA: string, cB: string): GroundedBranch[] {
  const topicShort = clip(topic.replace(/\s+/g, " "), 48);
  const intro = hostRef.trim() ? `结合主持人归纳：${clip(hostRef, 200)}。` : "";
  return [
    {
      id: "grounded-city-a",
      name: `侧重${cA}`,
      probability: 0.42,
      riskScore: 58,
      benefitScore: 80,
      emotionForecast: "excited",
      description: `${intro}若优先落地「${cA}」：资源与机会面向该城倾斜，适应成本更高，但与「${topicShort}」直接对应。`,
      nodes: [
        { id: "gca-1", type: "event", label: `落地${cA}`, sentiment: "positive", x: 0, y: 0 },
        { id: "gca-2", type: "finance", label: "机会成本", sentiment: "neutral", x: 0, y: 0 },
        { id: "gca-3", type: "emotion", label: "高唤醒", sentiment: "neutral", x: 0, y: 0 },
      ],
      opinions: {
        radical: opPair(86, `激进派：对「${topicShort}」先占${cA}，90 天内用真实体感定调。`),
        future: opPair(72, `未来派：看 3～5 年天花板与迁移成本，${cA}能否承载复利。`),
        conservative: opPair(46, `保守派：押${cA}前锁定现金流与试错边界，避免一次押满。`),
      },
    },
    {
      id: "grounded-city-b",
      name: `侧重${cB}`,
      probability: 0.36,
      riskScore: 40,
      benefitScore: 68,
      emotionForecast: "calm",
      description: `${intro}若优先稳住「${cB}」：节奏更可控、熟悉度高，可能牺牲部分外部密度，仍紧扣「${topicShort}」。`,
      nodes: [
        { id: "gcb-1", type: "event", label: `扎根${cB}`, sentiment: "neutral", x: 0, y: 0 },
        { id: "gcb-2", type: "finance", label: "支出可控", sentiment: "positive", x: 0, y: 0 },
        { id: "gcb-3", type: "emotion", label: "更安心", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: {
        radical: opPair(34, `激进派：久留${cB}怕钝化冲劲，若要稳，可用出差/远程补机会。`),
        future: opPair(66, `未来派：${cB}与目标一致可深耕；否则写清「再评估」日期。`),
        conservative: opPair(90, `保守派：先守基本盘与生活秩序，再谈增量。`),
      },
    },
    {
      id: "grounded-city-mix",
      name: `${cA}/${cB}折中`,
      probability: 0.28,
      riskScore: 50,
      benefitScore: 74,
      emotionForecast: "happy",
      description: `${intro}折中：过渡、远程或双城试点，在${cA}与${cB}之间换时间与信息，对应「${topicShort}」的中间解。`,
      nodes: [
        { id: "gcm-1", type: "event", label: "过渡安排", sentiment: "neutral", x: 0, y: 0 },
        { id: "gcm-2", type: "finance", label: "成本分摊", sentiment: "neutral", x: 0, y: 0 },
        { id: "gcm-3", type: "emotion", label: "缓冲期", sentiment: "positive", x: 0, y: 0 },
      ],
      opinions: opinionsForPath(topicShort, "双城折中", "blend", {
        cityMode: true,
        blendPeer: `「${cA}」与「${cB}」`,
      }),
    },
  ];
}

/**
 * 结构化句型都无法命中时的兜底模板：至少 3 条互斥取向，路径名与决策树节点均嵌入「核心决策语」。
 */
function coreTripleBranches(topic: string, hostRef: string): GroundedBranch[] {
  const topicShort = clip(topic.replace(/\s+/g, " "), 52);
  const core = extractCoreDecisionPhrase(topic, hostRef);
  const coreLabel = clip(core, 14);
  const intro = hostRef.trim() ? `${clip(hostRef, 220)}。` : "";
  const pathWord = clip(core, 12);

  const descPush = buildRichDescription({
    topic, topicShort, core, option: coreLabel, tone: "push", intro: intro || undefined,
  });
  const descSteady = buildRichDescription({
    topic, topicShort, core, option: coreLabel, tone: "steady", intro: intro || undefined,
  });
  const descBlend = buildRichDescription({
    topic, topicShort, core, option: coreLabel, tone: "blend", intro: intro || undefined,
  });

  return [
    {
      id: "tpl-core-push",
      name: `推进「${coreLabel}」`,
      probability: 0.4,
      riskScore: 62,
      benefitScore: 82,
      emotionForecast: "excited",
      description: descPush,
      nodes: templateDistilledNodes("core-push", "push", topicShort, core),
      opinions: opinionsForPath(topicShort, `推进${pathWord}`, "push", {}),
    },
    {
      id: "tpl-core-hold",
      name: `暂缓「${coreLabel}」`,
      probability: 0.35,
      riskScore: 34,
      benefitScore: 62,
      emotionForecast: "calm",
      description: descSteady,
      nodes: templateDistilledNodes("core-hold", "steady", topicShort, core),
      opinions: opinionsForPath(topicShort, `暂缓${pathWord}`, "steady", {}),
    },
    {
      id: "tpl-core-pilot",
      name: `小步试「${coreLabel}」`,
      probability: 0.32,
      riskScore: 48,
      benefitScore: 76,
      emotionForecast: "happy",
      description: descBlend,
      nodes: templateDistilledNodes("core-pilot", "blend", topicShort, core),
      opinions: opinionsForPath(topicShort, `试点${pathWord}`, "blend", {
        blendPeer: `「推进${pathWord}」与「暂缓${pathWord}」`,
      }),
    },
  ];
}

type DomainKind =
  | "career"
  | "relationship"
  | "finance"
  | "study"
  | "health"
  | "move"
  | "buy"
  | "startup"
  | "travel"
  | "parenting"
  | "legal"
  | "content"
  | "social"
  | "generic";

function detectDomainKind(blob: string): DomainKind {
  const t = blob.replace(/\s+/g, "");
  if (/跳槽|辞职|离职|offer|面试|升职|加薪|转岗|创业|合伙|老板|团队|同事|项目|职业|工作/.test(t)) return "career";
  if (/分手|复合|表白|暧昧|恋爱|对象|男朋友|女朋友|伴侣|婚|离婚|相亲|父母|家庭|关系|沟通/.test(t))
    return "relationship";
  if (/投资|理财|基金|股票|债券|定投|收益|亏|回撤|风险|现金流|负债|贷款|利率|预算|存款/.test(t)) return "finance";
  if (/考研|读研|读博|留学|申请|论文|考试|备考|学习|课程|专业|学校|转专业/.test(t)) return "study";
  if (/失眠|焦虑|抑郁|情绪|压力|运动|锻炼|减肥|增肌|饮食|熬夜|胃|头痛|健康|冥想/.test(t)) return "health";
  if (/公司注册|营业执照|融资|天使轮|a轮|mvp|商业模式|获客|增长|创业方向|创业项目/.test(t)) return "startup";
  if (/旅行|旅游|出行|机票|酒店|行程|签证|自由行|跟团|目的地|度假|自驾/.test(t)) return "travel";
  if (/孩子|小孩|育儿|带娃|亲子|幼儿园|小学|家长|教育方式|陪伴/.test(t)) return "parenting";
  if (/合同|仲裁|诉讼|起诉|律师|法务|违法|侵权|赔偿|协议|条款|合规/.test(t)) return "legal";
  if (/自媒体|短视频|公众号|视频号|小红书|b站|直播|涨粉|变现|选题|账号/.test(t)) return "content";
  if (/朋友|社交|人脉|圈子|聚会|邀约|同学会|同事关系|维护关系|破冰/.test(t)) return "social";
  if (/搬家|租房|买房|房子|通勤|户口|落户|城市|迁移|定居|回老家|去留/.test(t)) return "move";
  if (/买不买|要不要买|下单|购买|换机|电脑|手机|相机|车|装修|家电/.test(t)) return "buy";
  return "generic";
}

function domainTripleBranches(topic: string, hostRef: string): GroundedBranch[] {
  const topicShort = clip(topic.replace(/\s+/g, " "), 52);
  const core = extractCoreDecisionPhrase(topic, hostRef);
  const coreLabel = clip(core, 14);
  const intro = hostRef.trim() ? `${clip(hostRef, 220)}。` : "";
  const kind = detectDomainKind(`${topic}\n${hostRef}`);

  const mk = (suffix: string, name: string, tone: "push" | "steady" | "blend", risk: number, benefit: number, emo: string, desc: string) =>
    ({
      id: `dom-${kind}-${suffix}`,
      name,
      probability: 0.34,
      riskScore: risk,
      benefitScore: benefit,
      emotionForecast: emo,
      description: desc,
      nodes: templateDistilledNodes(`dom-${kind}-${suffix}`, tone, topicShort, core),
      opinions: opinionsForPath(topicShort, name.replace(/[「」"]/g, ""), tone, {
        blendPeer: `「${coreLabel}」不同路径`,
      }),
    }) satisfies GroundedBranch;

  if (kind === "career") {
    return [
      mk(
        "switch",
        `推进：主动变更「${coreLabel}」`,
        "push",
        64,
        84,
        "excited",
        `${intro}围绕「${topicShort}」，采取更主动的职业动作（如投递/面试/谈判/转岗）来推进「${core}」。优点是反馈更快；代价是短期不确定性更高。`,
      ),
      mk(
        "stabilize",
        `稳住：先保留「${coreLabel}」`,
        "steady",
        36,
        64,
        "calm",
        `${intro}围绕「${topicShort}」，先保留当前安排并补信息（盘点能力、市场、现金流、健康）。优点是风险可控；缺点是窗口期可能变窄。`,
      ),
      mk(
        "prepare",
        `折中：为「${coreLabel}」做准备金`,
        "blend",
        48,
        76,
        "happy",
        `${intro}围绕「${topicShort}」，先做低风险试点：简历/作品集/人脉/小项目/旁路收入，设 2～4 周复盘点后再决定是否全面推进「${core}」。`,
      ),
    ];
  }

  if (kind === "relationship") {
    return [
      mk(
        "talk",
        `推进：直面沟通「${coreLabel}」`,
        "push",
        58,
        82,
        "anxious",
        `${intro}围绕「${topicShort}」，把「${core}」落到一次明确沟通：目标、边界、底线、下一步。优点是能快速止损/止拖；缺点是情绪波动更大。`,
      ),
      mk(
        "pause",
        `稳住：先暂停「${coreLabel}」`,
        "steady",
        34,
        62,
        "calm",
        `${intro}围绕「${topicShort}」，先暂停高烈度互动，拉开一点时间与空间，观察一致性与现实约束。优点是降低冲突；缺点是容易继续悬而未决。`,
      ),
      mk(
        "steps",
        `折中：小步验证「${coreLabel}」`,
        "blend",
        44,
        74,
        "happy",
        `${intro}围绕「${topicShort}」，用小步验证替代“全有或全无”：先定义 1～2 个可观察行为指标与期限，达标再升级投入，不达标就调整方向。`,
      ),
    ];
  }

  if (kind === "finance" || kind === "buy") {
    return [
      mk(
        "commit",
        `推进：执行「${coreLabel}」`,
        "push",
        kind === "finance" ? 66 : 60,
        kind === "finance" ? 82 : 78,
        "excited",
        `${intro}围绕「${topicShort}」，执行「${core}」并以规则控制风险：预算上限、止损/止盈、分批/分期。优点是行动带来反馈；缺点是回撤与后悔成本更高。`,
      ),
      mk(
        "holdcash",
        `稳住：先不做「${coreLabel}」`,
        "steady",
        30,
        60,
        "calm",
        `${intro}围绕「${topicShort}」，先不做「${core}」，保留现金流与确定性，补齐信息（价格、替代品、机会成本、后续支出）。优点是稳；缺点是可能错过时机。`,
      ),
      mk(
        "trial",
        `折中：小额试「${coreLabel}」`,
        "blend",
        44,
        74,
        "happy",
        `${intro}围绕「${topicShort}」，先以小额/二手/短租/试用/试投替代一次押注，设定触发条件（价格、使用频率、收益曲线）后再决定扩大。`,
      ),
    ];
  }

  if (kind === "study") {
    return [
      mk(
        "full",
        `推进：全力投入「${coreLabel}」`,
        "push",
        62,
        84,
        "excited",
        `${intro}围绕「${topicShort}」，把「${core}」落到可执行计划：目标院校/项目、科目安排、周节奏与模拟检验。优点是进展快；缺点是压力更高。`,
      ),
      mk(
        "defer",
        `稳住：延后「${coreLabel}」`,
        "steady",
        34,
        62,
        "calm",
        `${intro}围绕「${topicShort}」，先延后「${core}」，把基础盘（健康/财务/时间块）打稳，再决定投入窗口。优点是可持续；缺点是进度变慢。`,
      ),
      mk(
        "probe",
        `折中：试学/试跑「${coreLabel}」`,
        "blend",
        46,
        76,
        "happy",
        `${intro}围绕「${topicShort}」，先做 2～3 周“试跑”：小规模复习/选课/旁听/做题，记录投入产出与兴趣强度，再决定是否升级投入。`,
      ),
    ];
  }

  if (kind === "health") {
    return [
      mk(
        "intervene",
        `推进：立刻干预「${coreLabel}」`,
        "push",
        54,
        80,
        "happy",
        `${intro}围绕「${topicShort}」，先把「${core}」拆成 1～2 个今天就能做的动作（运动/作息/饮食/就医/冥想），用“最小可行改变”快速止损。`,
      ),
      mk(
        "rest",
        `稳住：先休整「${coreLabel}」`,
        "steady",
        28,
        62,
        "calm",
        `${intro}围绕「${topicShort}」，先让身体与情绪恢复到可决策状态：睡眠、补水、降低刺激，避免在低状态下对「${core}」做不可逆决定。`,
      ),
      mk(
        "routine",
        `折中：建立习惯「${coreLabel}」`,
        "blend",
        40,
        74,
        "happy",
        `${intro}围绕「${topicShort}」，用可持续习惯代替一口气猛改：固定时间块、触发器、可量化目标与复盘点，让「${core}」逐步落地。`,
      ),
    ];
  }

  if (kind === "startup") {
    return [
      mk(
        "launch",
        `推进：快速上线「${coreLabel}」`,
        "push",
        68,
        86,
        "excited",
        `${intro}围绕「${topicShort}」，把「${core}」尽快落到 MVP 与真实用户验证：反馈最快，但资源消耗与试错成本更高。`,
      ),
      mk(
        "validate",
        `稳住：先验证再扩张「${coreLabel}」`,
        "steady",
        38,
        66,
        "calm",
        `${intro}围绕「${topicShort}」，先做需求与单元经济验证（访谈、灰度、留存），风险更可控，但增长速度较慢。`,
      ),
      mk(
        "pilot",
        `折中：小范围试点「${coreLabel}」`,
        "blend",
        50,
        78,
        "happy",
        `${intro}围绕「${topicShort}」，先在小范围跑通闭环（一个人群/一个渠道/一个场景），设里程碑后再扩大投入。`,
      ),
    ];
  }

  if (kind === "travel") {
    return [
      mk(
        "go",
        `推进：按计划出发「${coreLabel}」`,
        "push",
        52,
        80,
        "excited",
        `${intro}围绕「${topicShort}」，按计划推进出行（机酒、行程、预算）并尽快锁定资源，体验收益高但改签与超支风险更大。`,
      ),
      mk(
        "delay",
        `稳住：延后「${coreLabel}」`,
        "steady",
        30,
        60,
        "calm",
        `${intro}围绕「${topicShort}」，先延后出行，等待时间/预算/同行条件更匹配，风险低但可能错过窗口。`,
      ),
      mk(
        "lite",
        `折中：轻量版「${coreLabel}」`,
        "blend",
        42,
        74,
        "happy",
        `${intro}围绕「${topicShort}」，先做轻量版方案（短途、缩天数、降预算），保留体验同时控制投入。`,
      ),
    ];
  }

  if (kind === "parenting") {
    return [
      mk(
        "act",
        `推进：立即执行「${coreLabel}」`,
        "push",
        56,
        82,
        "happy",
        `${intro}围绕「${topicShort}」，尽快执行新的育儿/教育安排，快速看到行为反馈，但家庭磨合成本更高。`,
      ),
      mk(
        "observe",
        `稳住：先观察「${coreLabel}」`,
        "steady",
        32,
        62,
        "calm",
        `${intro}围绕「${topicShort}」，先观察孩子节奏与家庭承受度，再调整方案，冲突更少但见效更慢。`,
      ),
      mk(
        "step",
        `折中：分龄试行「${coreLabel}」`,
        "blend",
        44,
        76,
        "happy",
        `${intro}围绕「${topicShort}」，按周分步试行并记录反馈（情绪、作息、学习效果），再决定是否全面执行。`,
      ),
    ];
  }

  if (kind === "legal") {
    return [
      mk(
        "enforce",
        `推进：依法推进「${coreLabel}」`,
        "push",
        62,
        78,
        "anxious",
        `${intro}围绕「${topicShort}」，尽快走法律/合规路径（证据、函件、仲裁/诉讼），止损明确但时间与精力成本高。`,
      ),
      mk(
        "negotiate",
        `稳住：先协商「${coreLabel}」`,
        "steady",
        36,
        64,
        "calm",
        `${intro}围绕「${topicShort}」，先通过协商与补充协议解决，成本较低但执行力与约束力可能不足。`,
      ),
      mk(
        "hybrid",
        `折中：协商+备诉「${coreLabel}」`,
        "blend",
        48,
        74,
        "happy",
        `${intro}围绕「${topicShort}」，一边协商一边备齐证据与法务预案，保留转入正式流程的主动权。`,
      ),
    ];
  }

  if (kind === "content") {
    return [
      mk(
        "publish",
        `推进：高频产出「${coreLabel}」`,
        "push",
        58,
        84,
        "excited",
        `${intro}围绕「${topicShort}」，高频发布并快速迭代选题/封面/脚本，增长潜力高但容易透支。`,
      ),
      mk(
        "quality",
        `稳住：精品化「${coreLabel}」`,
        "steady",
        34,
        66,
        "calm",
        `${intro}围绕「${topicShort}」，降低频率转向精品内容与品牌一致性，质量稳定但起量更慢。`,
      ),
      mk(
        "matrix",
        `折中：双轨试验「${coreLabel}」`,
        "blend",
        46,
        78,
        "happy",
        `${intro}围绕「${topicShort}」，主账号做稳定内容，副线做爆款实验，按数据复盘再收敛到最优策略。`,
      ),
    ];
  }

  if (kind === "social") {
    return [
      mk(
        "expand",
        `推进：主动拓展「${coreLabel}」`,
        "push",
        50,
        80,
        "excited",
        `${intro}围绕「${topicShort}」，主动发起连接（邀约、合作、介绍）快速拓展人脉，机会多但时间成本更高。`,
      ),
      mk(
        "maintain",
        `稳住：维护核心关系「${coreLabel}」`,
        "steady",
        28,
        62,
        "calm",
        `${intro}围绕「${topicShort}」，优先维护少量高质量关系，节奏可控但新机会增速较慢。`,
      ),
      mk(
        "rhythm",
        `折中：节奏化经营「${coreLabel}」`,
        "blend",
        40,
        74,
        "happy",
        `${intro}围绕「${topicShort}」，按固定节奏做“维护+拓展”组合动作，兼顾稳定与增量。`,
      ),
    ];
  }

  if (kind === "move") {
    return [
      mk(
        "move",
        `推进：迁移/落地「${coreLabel}」`,
        "push",
        64,
        82,
        "excited",
        `${intro}围绕「${topicShort}」，把「${core}」推进到可落地：目标片区/预算/通勤、时间表、关键资源。优点是密度更高；缺点是适应成本更大。`,
      ),
      mk(
        "stay",
        `稳住：先不动「${coreLabel}」`,
        "steady",
        34,
        64,
        "calm",
        `${intro}围绕「${topicShort}」，先维持现状，把不确定性压下来（工作、现金流、家庭支持），再择机推进「${core}」。`,
      ),
      mk(
        "pilot",
        `折中：双城/短租试点「${coreLabel}」`,
        "blend",
        50,
        74,
        "happy",
        `${intro}围绕「${topicShort}」，用短租、出差、远程或双城过渡获取真实体感，再决定是否全面迁移。`,
      ),
    ];
  }

  return coreTripleBranches(topic, hostRef);
}

function dedupeOptions(opts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of opts) {
    const k = o.replace(/\s+/g, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

/** 从「A还是B」「A、B还是C」等句式抽出 2～4 个互斥选项 */
function extractMultiOptionsFromText(raw: string): string[] | null {
  const t = stripQuestionPrefix(raw.replace(/\s+/g, " ").trim());
  if (!t.includes("还是")) return null;

  if ((t.match(/还是/g) ?? []).length >= 2) {
    const parts = t
      .split("还是")
      .map((p) => cleanEitherOrHead(cleanEitherOrTail(p.trim())))
      .filter(Boolean);
    if (parts.length >= 2) {
      parts[0] = cleanEitherOrHead(stripQuestionPrefix(parts[0]));
      const deduped = dedupeOptions(parts.map((p) => clip(p, 24)));
      return deduped.length >= 2 ? deduped : null;
    }
  }

  const lastIdx = t.lastIndexOf("还是");
  if (lastIdx < 1) return null;
  const left = t.slice(0, lastIdx);
  const right = cleanEitherOrHead(cleanEitherOrTail(t.slice(lastIdx + 2)));
  const leftParts = left
    .split(/[、,，/|以及和与]/)
    .map((p) => cleanEitherOrHead(p.trim()))
    .filter(Boolean);
  const options = dedupeOptions([...leftParts, right].map((p) => clip(p, 24)).filter(Boolean));
  if (options.length >= 2) return options;

  const pair = splitEitherOrFromText(t);
  return pair ? [pair.optionA, pair.optionB] : null;
}

/** 从「A还是B」等句式抽出并对齐语义（如 去西安 / 北京工作 → 去西安工作 / 去北京工作） */
function inferSharedTailFromTopic(topic: string, a: string, b: string): string {
  const tails = ["工作", "定居", "发展", "落户", "生活", "就业", "读书", "读研", "创业"];
  for (const tail of tails) {
    if (!topic.includes(tail)) continue;
    if (!a.includes(tail) || !b.includes(tail)) return tail;
  }
  return "";
}

function cityInText(s: string): string | null {
  for (const c of MAJOR_CITIES) {
    if (s.includes(c)) return c;
  }
  return null;
}

function parallelizeEitherOrOptions(a: string, b: string, topic: string): string[] {
  const left = a.trim();
  const right = b.trim();
  const tail = inferSharedTailFromTopic(topic, left, right);

  const normOne = (side: string): string => {
    let x = side.replace(/\s+/g, "");
    const city = cityInText(x);

    if (tail && !x.includes(tail)) {
      if (/^(去|在|到|回)/.test(x)) x = `${x}${tail}`;
      else if (city) x = `去${city}${tail}`;
      else x = `${x}${tail}`;
    }

    if (city && !/^(去|在|到|回)/.test(x)) {
      if (x.startsWith(city)) x = `去${x}`;
      else if (x.includes(city)) x = `去${x}`;
    }

    return clip(x, 24);
  };

  return dedupeOptions([normOne(left), normOne(right)]);
}

function normalizeMultiOptions(opts: string[], topic: string): string[] {
  if (opts.length === 2) return parallelizeEitherOrOptions(opts[0], opts[1], topic);
  return dedupeOptions(opts.map((o) => clip(o.replace(/\s+/g, ""), 24)));
}

function actionTailFromTopic(topic: string): string {
  return ["工作", "定居", "发展", "落户", "生活", "就业", "读书", "读研", "创业"].find((t) => topic.includes(t)) ?? "";
}

function labelCityOptions(cities: string[], topic: string): string[] {
  const tail = actionTailFromTopic(topic);
  return cities.slice(0, MAX_PROJECTION_BRANCHES).map((c) => {
    if (tail) return clip(`去${c}${tail}`, 24);
    return clip(`去${c}`, 24);
  });
}

/** 按 canonical 选项名对齐分支（避免 LLM 输出「选去西安」这类不对称命名） */
export function alignBranchNamesToCanonical<T extends { name: string; description?: string }>(
  branches: T[],
  canonical: string[],
  topic: string,
): T[] {
  if (branches.length !== canonical.length || canonical.length < MIN_PROJECTION_BRANCHES) {
    return branches.map((b) => ({
      ...b,
      description: sanitizeBranchDescription(b.description ?? "", b.name, topic),
    }));
  }
  const used = new Set<number>();
  return branches.map((b) => {
    const pack = b.name.replace(/\s+/g, "");
    let pick = -1;
    for (let i = 0; i < canonical.length; i++) {
      if (used.has(i)) continue;
      const c = canonical[i].replace(/\s+/g, "");
      const city = MAJOR_CITIES.find((mc) => pack.includes(mc) && c.includes(mc));
      if (city || c.includes(pack.slice(-4)) || pack.includes(c.slice(-4))) {
        pick = i;
        break;
      }
    }
    if (pick < 0) pick = [...Array(canonical.length).keys()].find((i) => !used.has(i)) ?? 0;
    used.add(pick);
    const name = formatOptionBranchName(canonical[pick]);
    return {
      ...b,
      name,
      description: sanitizeBranchDescription(b.description ?? "", name, topic),
    };
  });
}

/** 从主持人单行摘要提取（禁止用整段议会聊天记录解析选项） */
function hostRefForOptionParsing(hostRef: string): string {
  const line = hostRef
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^主持人[：:]/.test(l))
    ?.replace(/^主持人[：:]\s*/, "")
    .trim();
  return line ? clip(line, 160) : "";
}

/** 路径名是否像「可执行的决策结果」（而非聊天摘录） */
export function isValidBranchName(name: string, topic: string): boolean {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (n.length < 2 || n.length > 28) return false;
  if (INVALID_BRANCH_NAME.test(n)) return false;
  if (/[:：].*[:：]/.test(n)) return false;
  const topicNorm = topic.replace(/\s+/g, "");
  const nameNorm = n.replace(/\s+/g, "");
  if (topicNorm.length >= 4 && nameNorm.includes(topicNorm) && nameNorm.length > topicNorm.length + 10) {
    return false;
  }
  return true;
}

function isValidBranchDescription(desc: string, topic: string): boolean {
  const d = (desc ?? "").replace(/\s+/g, " ").trim();
  if (d.length < 12 || d.length > 480) return false;
  if (INVALID_BRANCH_NAME.test(d)) return false;
  if (GENERIC_HOST_BOILERPLATE.test(d)) return false;
  if (GENERIC_BLEND_PATH_NAME.test(d) && !/折中|妥协/.test(topic)) return false;
  return true;
}

function binaryDecisionOptions(action: string): string[] {
  const act = clip(action.trim(), 22);
  if (/^去/.test(act)) {
    return [act, clip(`不${act}`, 22)];
  }
  return [act, clip(`暂不${act}`, 22)];
}

/** 仅从一段文本解析互斥选项（不拼接 host 聊天记录） */
function parseDecisionOptionsFromText(text: string, topicContext: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];

  const multi = extractMultiOptionsFromText(t);
  if (multi && multi.length >= 2) {
    return normalizeMultiOptions(multi, topicContext).slice(0, MAX_PROJECTION_BRANCHES);
  }

  const pair = splitEitherOrFromText(t);
  if (pair) {
    return parallelizeEitherOrOptions(pair.optionA, pair.optionB, topicContext);
  }

  const cities = orderedCitiesInTopic(t);
  if (cities.length >= 2 && !t.includes("还是")) {
    return labelCityOptions(cities, topicContext);
  }

  const binary = extractBinaryDecisionAction(t);
  if (binary) {
    return binaryDecisionOptions(binary);
  }

  const en = extractEnglishDecisionCore(t);
  if (en) {
    return [`Proceed with ${clip(en, 22)}`, `Hold off on ${clip(en, 22)}`];
  }

  return [];
}

/** 根据议题与会话摘录，解析 2～4 条「可执行的决策结果」选项（非固定 push/steady/blend 骨架） */
export function extractDecisionOptionsFromTopic(topic: string, hostRef = ""): string[] {
  const topicTrim = (topic ?? "").trim();
  const fromTopic = parseDecisionOptionsFromText(topicTrim, topicTrim);
  if (fromTopic.length >= MIN_PROJECTION_BRANCHES) return fromTopic;

  const hostLine = hostRefForOptionParsing(hostRef);
  if (hostLine && hostLine !== topicTrim) {
    const fromHost = parseDecisionOptionsFromText(hostLine, topicTrim);
    if (fromHost.length >= MIN_PROJECTION_BRANCHES) return fromHost;
  }

  return [];
}

function branchToneForIndex(index: number, total: number): "push" | "steady" | "blend" {
  if (total <= 1) return "push";
  if (index === 0) return "push";
  if (index === total - 1) return "steady";
  return "blend";
}

function formatOptionBranchName(option: string): string {
  return clip(option.replace(/\s+/g, ""), 22);
}

function slugForOption(option: string, index: number): string {
  const slug = option.replace(/\s+/g, "").slice(0, 10).replace(/[^\w\u4e00-\u9fa5-]/g, "") || `opt${index}`;
  return `dyn-${index}-${slug}`;
}

/** 根据议题解析应生成的路径条数上限（二选一 = 2，多选最多 4） */
export function getTopicBranchLimit(topic: string, _hostRef = ""): number {
  const opts = extractDecisionOptionsFromTopic(topic, "");
  if (opts.length >= MIN_PROJECTION_BRANCHES) {
    return Math.min(opts.length, MAX_PROJECTION_BRANCHES);
  }
  return MAX_PROJECTION_BRANCHES;
}

/** 去掉路径详情里误粘贴的主持人折中套话，过短则重写为议题向说明 */
export function sanitizeBranchDescription(desc: string, branchName: string, topic: string): string {
  const original = (desc ?? "").replace(/\s+/g, " ").trim();
  let t = original.replace(GENERIC_HOST_BOILERPLATE, " ").replace(/\s+/g, " ").trim();
  if (GENERIC_BLEND_PATH_NAME.test(t) && !/折中|妥协/.test(topic)) {
    t = t.replace(GENERIC_BLEND_PATH_NAME, " ").replace(/\s+/g, " ").trim();
  }
  const hadBoilerplate =
    GENERIC_HOST_BOILERPLATE.test(original) ||
    (GENERIC_BLEND_PATH_NAME.test(original) && !/折中|妥协/.test(topic));
  if (!t || (hadBoilerplate && t.length < 24)) {
    const label = clip(branchName.replace(/[「」"]/g, ""), 20);
    const subj = clip(topic.replace(/\s+/g, " "), 36);
    return `选择「${label}」：对「${subj}」走这一步会直接改变时间、精力与情绪走向——确认得失再定，不靠想象做决定。`;
  }
  return clip(t, 480);
}

// ─── 富描述生成器：按域类型 × 节奏查找具体模板 ──────────────────────────────

const RICH_DESC: Record<
  DomainKind,
  Record<"push" | "steady" | "blend", string>
> = {
  career: {
    push: "主动推进「{core}」：投递/面试/谈判同步展开——反馈快、机会多，但短期不确定性高，心力消耗最大。",
    steady: "先保留现状观察「{core}」：补齐岗位、市场与现金流信息再动——风险最可控，但窗口可能收窄或越等越纠结。",
    blend: "为「{core}」做准备金：简历/作品集/人脉小步试点，定复盘点后再决定是否全力推进——进可攻退可守。",
  },
  relationship: {
    push: "正面沟通「{core}」：目标、边界、底线一次说清——推进快但情绪波动更大，适合憋不住、需要止损的阶段。",
    steady: "暂缓升级「{core}」：先给彼此时间与空间观察一致性——冲突更少，但悬而未决可能更耗心力。",
    blend: "小步验证「{core}」：先定义 1-2 个可观察行为指标与期限，达标再升级投入——不全有或全无，给自己留后路。",
  },
  finance: {
    push: "执行「{core}」并设规则控制风险：预算上限、止损/止盈、分批投入——行动带来反馈，但回撤与后悔成本更高。",
    steady: "先不做「{core}」：保留现金流与确定性，补齐信息后再判断——最稳，但可能错过时机或越等越焦虑。",
    blend: "小额/试用/试投替代一次押注：先看真实收益曲线，达标再扩大——兼顾体验与安全，不为冲动买单。",
  },
  study: {
    push: "全力投入「{core}」：目标院校/科目安排、周节奏与模拟检验——进展最快，但压力与时间成本也最高。",
    steady: "先延后「{core}」：把基础盘（健康/财务/时间块）打稳再投入——更可持续，但进度会慢、机会窗可能过。",
    blend: "试学 2-3 周「{core}」：小规模复习/选课/旁听，记录投入产出与兴趣强度再决定——不盲目冲也不无限拖。",
  },
  health: {
    push: "立刻干预「{core}」：拆成 1-2 个今天就能做的动作（运动/作息/饮食/就医）——快速止损，但执行压力更高。",
    steady: "先休整再看「{core}」：恢复睡眠与可决策状态再判断——降低误判风险，但症状可能持续或加重。",
    blend: "用可持续习惯替代一口气猛改：固定时间块、触发器、复盘点——让「{core}」逐步落地不反弹。",
  },
  move: {
    push: "推进落地「{core}」：目标片区/预算/通勤同步推进——资源切换更快，但适应与成本压力也更高。",
    steady: "先暂留原地评估「{core}」：稳现金流与生活秩序，补信息后再择机——风险最低，但密度与机会少。",
    blend: "短租/远程/双城过渡试点：先拿真实体感再决定是否全面迁移——不一步到位，也不原地踏步。",
  },
  buy: {
    push: "立即决策「{core}」：尽快获得使用体验与反馈——爽快但后悔成本更高，适合价格不敏感的阶段。",
    steady: "先不下单「{core}」：比较替代方案、后续支出与使用频率再定——稳，但可能错过优惠或越比越累。",
    blend: "试用/租借/小规格验证「{core}」：满意再升级——按真实体验决定，不靠想象下单。",
  },
  startup: {
    push: "快速上线「{core}」：尽快落 MVP 与真实用户验证——反馈最快，但资源消耗与试错成本更高。",
    steady: "先验证需求与单元经济再推进「{core}」：风险更可控，但增长速度较慢、窗口可能被抢。",
    blend: "小范围跑通闭环「{core}」：一个人群/渠道/场景先跑通，设里程碑再扩大——不盲目烧钱。",
  },
  travel: {
    push: "按计划出发「{core}」：机酒/行程/预算尽快锁定——体验收益高，但改签与超支风险更大。",
    steady: "先延后「{core}」：等待时间/预算/同行条件更匹配再走——风险低，但可能错过最佳窗口。",
    blend: "轻量版方案「{core}」：短途/缩天数/降预算——保留体验同时控制投入，小满足也不错。",
  },
  parenting: {
    push: "立即执行「{core}」：快速观察孩子反馈与适应性——推进快但家庭磨合成本更高，适合有紧急需求的阶段。",
    steady: "先观察「{core}」：摸清孩子节奏与家庭承受度再定方案——冲突更少，但见效更慢。",
    blend: "分步试行「{core}」：按周记录反馈（情绪/作息/效果）再决定是否全面执行——不急着一步到位。",
  },
  legal: {
    push: "依法推进「{core}」：证据、函件、仲裁/诉讼按程序走——止损明确但时间与精力成本高。",
    steady: "先协商处理「{core}」：通过沟通与补充协议解决——成本低但执行约束力可能不足。",
    blend: "协商与备诉并行推进「{core}」：争取协商解决同时备齐证据与法务预案——保留主动权。",
  },
  content: {
    push: "高频产出「{core}」：快速迭代选题/封面/脚本——增长潜力高，但容易透支、内容质量可能下滑。",
    steady: "转向精品化「{core}」：降低频率、提升单条质量与品牌一致性——质量稳定，但起量更慢。",
    blend: "双轨试验「{core}」：主号稳内容、副线做爆款实验，按数据复盘收敛策略——兼顾稳定与增长。",
  },
  social: {
    push: "主动拓展「{core}」：发起连接（邀约/合作/介绍）快速扩大圈子——机会多但时间与心力成本更高。",
    steady: "优先维护核心关系「{core}」：少量高质量连接深耕——节奏可控，但新机会增速较慢。",
    blend: "节奏化经营「{core}」：固定节奏做维护+拓展组合动作——兼顾稳定与增量，不冷落也不透支。",
  },
  generic: {
    push: "聚焦「{core}」快速推进：直接投入并换取真实反馈——进展最快，但短期波动与压力也最大，适合不试不甘心的阶段。",
    steady: "暂缓「{core}」守住现状：先补信息、稳基本盘——风险最可控，但窗口可能关闭或越等越纠结。",
    blend: "对「{core}」小步试点：控制投入与截止日，拿到真实反馈后再定全部投入还是果断收手——进可攻退可守。",
  },
};

// ─── 领域感知派系意见模板（与 RICH_DESC 同构，按 DomainKind × tone） ──────────

type FactionKey = "radical" | "future" | "conservative";

const RICH_OPINIONS: Record<
  DomainKind,
  Record<"push" | "steady" | "blend", Record<FactionKey, string>>
> = {
  career: {
    push: {
      radical: "激进派：快速投简历、约面试、同步谈 offer——用最短时间拿真实反馈，别在想象里犹豫。",
      future: "未来派：投岗位前先看公司 3-5 年天花板与技能复利，这步影响的不只是下一份工作。",
      conservative: "保守派：锁定目标后设两周冲刺期，超期没进展就回调——别一次押满。",
    },
    steady: {
      radical: "激进派：一直观望会钝化竞争力——至少每月更新简历、关注市场动向，别被动沉底。",
      future: "未来派：留下来积累沉淀不是坏事，但写清「再评估」时间节点，别无限期耗着。",
      conservative: "保守派：先补齐现金流、健康与合同细节，动之前确保安全垫够厚。",
    },
    blend: {
      radical: "激进派：简历/作品集/人脉同步推进，设截止日到期必须有结论——不悬着。",
      future: "未来派：在现岗位和外部机会间试点兼职/咨询/旁路收入，用结果代替空想。",
      conservative: "保守派：每一步写清投入上限与退出条件，不在中间状态消耗太久。",
    },
  },
  relationship: {
    push: {
      radical: "激进派：直接约一次正式沟通——目标、底线、下一步摊开说，长痛不如短痛。",
      future: "未来派：沟通前先想清楚这段关系 3 年后对你的意义，别只解决眼前矛盾。",
      conservative: "保守派：摊牌前备好情绪缓冲与边界话术，避免情绪上头把路堵死。",
    },
    steady: {
      radical: "激进派：暂停沟通如果拖太久就是消耗——设一个观察期，超期必须给结论。",
      future: "未来派：给自己空间没错，但拉长时间线看行为一致性比看单次对话更准。",
      conservative: "保守派：先恢复自身状态再谈关系，低能量时刻做的决定容易日后后悔。",
    },
    blend: {
      radical: "激进派：先定 1-2 个可观察行为指标（回应速度、主动度），再决定升温还是收手。",
      future: "未来派：用小步试探替代全有或全无，每次互动后复盘是否符合你的长期需求。",
      conservative: "保守派：试探前先明确你绝对不能接受的红线，达标才升级，不达标记得撤。",
    },
  },
  finance: {
    push: {
      radical: "激进派：分批执行并设止损止盈——只有真实交易能检验策略，纸上谈兵没用。",
      future: "未来派：这笔投入在 3 年后回头看是资产还是开销？想清楚再下注。",
      conservative: "保守派：单笔不超过可投资产 10%，设好止损线，纪律比方向更重要。",
    },
    steady: {
      radical: "激进派：持币观望太久会错过周期——至少定好触发条件，到点就执行。",
      future: "未来派：现在不动的每一块钱都在被通胀吃掉——找最稳的现金替代品先放着。",
      conservative: "保守派：保持高流动性没错，但至少要跑赢通胀，否则也是在亏。",
    },
    blend: {
      radical: "激进派：先用小额试水真实收益曲线，别让「研究」变成「拖延」。",
      future: "未来派：试投同时列好如果判断错了的补救方案，两头都不耽误。",
      conservative: "保守派：小额试投也要设最大回撤上限，亏到红线就停。",
    },
  },
  study: {
    push: {
      radical: "激进派：定好目标院校/科目和每周最低学习量——先动起来，别在计划里耗光冲劲。",
      future: "未来派：选方向时拉长到 5 年看回报——热门不等于适合你，技能迁移性更关键。",
      conservative: "保守派：全力投入前先确认身体状况和时间块够不够支撑——别拼到一半崩了。",
    },
    steady: {
      radical: "激进派：延迟太久容易彻底放弃——设一个最晚启动日，过期必须做决定。",
      future: "未来派：把基础盘（健康、财务、时间）打稳再投入是对的，但窗口期也不会等你。",
      conservative: "保守派：先把手头的事清干净再开新坑，别两头都半桶水。",
    },
    blend: {
      radical: "激进派：先试 2-3 周小规模学习，看真实投入产出再定——不靠想象评估难度。",
      future: "未来派：试跑阶段重点观察兴趣能否持续——短期热情和长期坚持是两回事。",
      conservative: "保守派：试学期间设每周上限（时间+费用），超支就重新评估。",
    },
  },
  health: {
    push: {
      radical: "激进派：今天就开始做 1 个最小动作（散步/早睡/少糖），别等「准备好了」。",
      future: "未来派：这步能让你 3 年后的身体状态完全不同——现在不动，以后要花更多代价。",
      conservative: "保守派：动之前先确认有没有隐藏伤病或禁忌，盲目猛冲反而容易出问题。",
    },
    steady: {
      radical: "激进派：一直休息解决不了根本问题——设一个恢复期截止日，到点必须启动。",
      future: "未来派：休整是为了更可持续地前进，不是回避——休整≠放弃。",
      conservative: "保守派：先睡够、吃好、把心态稳下来，低状态下做的任何决定都不可靠。",
    },
    blend: {
      radical: "激进派：固定时间块做固定动作，别靠意志力——习惯化了才算真正落地。",
      future: "未来派：选一个能坚持 10 年的方式，而不是两周就放弃的猛药。",
      conservative: "保守派：从小到不可能失败的量开始，宁可慢一点也别一口气搞垮。",
    },
  },
  move: {
    push: {
      radical: "激进派：尽快实地踩点、算清通勤与预算——真实体感比网上看一百篇帖子有用。",
      future: "未来派：这一搬影响 3-5 年生活半径与职业密度——不只是换张床，是换种活法。",
      conservative: "保守派：动之前先做最坏打算：如果那边不如预期，退路是什么？",
    },
    steady: {
      radical: "激进派：一直「评估」下去就永远动不了——设一个最晚决策日，过期必须选一边。",
      future: "未来派：留下意味着放弃那边的密度与机会——这个代价你确认能接受吗？",
      conservative: "保守派：先稳现金流与当前生活秩序，动之前确保新城市有至少 3 个月缓冲金。",
    },
    blend: {
      radical: "激进派：短租/出差先试住两周，别在键盘上决定生活——真实感受会打脸所有预设。",
      future: "未来派：双城过渡不是长久之计——设一个最终落脚时间点，避免长期分裂消耗。",
      conservative: "保守派：过渡期间设预算和时间上限，超支就收——别让试点变成新的拖延。",
    },
  },
  buy: {
    push: {
      radical: "激进派：下单前确认使用频率——用「每次使用成本」替代「总价」判断值不值。",
      future: "未来派：这笔消费 1 年后回头看是资产还是负担？冲动满足感和长期价值要分清。",
      conservative: "保守派：设一个冷静期（≥24h），高单价商品别在情绪高点决定。",
    },
    steady: {
      radical: "激进派：一直不买有时候反而更费钱——算清替代方案的实际成本再定。",
      future: "未来派：省下钱是手段不是目的——如果这个东西能提升你每天的生活质量，值得花。",
      conservative: "保守派：先比价 3 家、算清后续费用（维护/配件/耗材）再定。",
    },
    blend: {
      radical: "激进派：先租/借/买小规格试用，真实体验后决定——别靠想象和测评下判断。",
      future: "未来派：试用时留意使用频率和真实满意度——数据不会骗你。",
      conservative: "保守派：试用期间设好期限，到期必须决定——别让试用变成变相拖延。",
    },
  },
  travel: {
    push: {
      radical: "激进派：机票酒店越拖越贵——尽早锁定核心资源，其余可以灵活调整。",
      future: "未来派：此行是否和你的长期目标一致？放松≠逃避，确认出发的动机。",
      conservative: "保守派：出发前确认预算含 20% 弹性——行程总有意料之外。",
    },
    steady: {
      radical: "激进派：一直等着就永远走不了——定一个最晚订票日，过期不等。",
      future: "未来派：有些窗口（季节/假期/优惠）错过就没了——权衡等待成本和错过成本。",
      conservative: "保守派：等预算、时间、同伴全齐再动——缺一项就减配方案，别无限延期。",
    },
    blend: {
      radical: "激进派：短途/缩天数也能换环境——不求完美旅行，先走出去再说。",
      future: "未来派：轻量版也能积累体验和回忆——品质不完全等于时长和预算。",
      conservative: "保守派：轻量出行前确认关键底线（安全/健康/通讯），其余从简。",
    },
  },
  startup: {
    push: {
      radical: "激进派：MVP 两周内上线拿真实用户反馈——速度是你此刻最大的优势，别在打磨里耗死。",
      future: "未来派：上线前先确认这个方向 3 年后市场规模是否够大——别在萎缩赛道里拼命。",
      conservative: "保守派：设好烧钱上限和止损节点——跑起来的同时别把退路烧光。",
    },
    steady: {
      radical: "激进派：过度验证容易错过窗口——市场不会等你完美了才开跑。",
      future: "未来派：验证阶段收集的不只是数据，还有你对赛道真实体感——认真对待每一条反馈。",
      conservative: "保守派：先确认目标用户的付费意愿和留存——虚荣指标好看没用。",
    },
    blend: {
      radical: "激进派：小范围跑通闭环再扩大——不用一开始就做所有人，先做一群人。",
      future: "未来派：试点时关注可复制性——一个渠道/人群跑通后能不能规模化？",
      conservative: "保守派：试点阶段设明确里程碑与预算上限，达标才进下一轮。",
    },
  },
  parenting: {
    push: {
      radical: "激进派：尽快执行并密切观察孩子反馈——真实反馈比计划和理论更有用。",
      future: "未来派：这步影响孩子的成长节奏与安全感——短痛长通，别只求眼前平静。",
      conservative: "保守派：执行前确认全家人（包括老人）的态度与底线——家人不齐力，方案再好也难落地。",
    },
    steady: {
      radical: "激进派：观察太久会错过干预窗口——设一个观察截止日，到期必须有结论。",
      future: "未来派：孩子的节奏比大人的计划更重要——观察期里认真记录，别凭印象做决定。",
      conservative: "保守派：先摸清孩子的真实需求与家庭承受力，方案不匹配比不做更糟。",
    },
    blend: {
      radical: "激进派：按周分步试、记录反馈（情绪/作息/效果），数据够了就定——别一直试。",
      future: "未来派：试行期关注的不只是效果，还有孩子和全家人的情绪消耗——可持续性更重要。",
      conservative: "保守派：试行方案必须有「中止条件」——孩子出现明显抗拒或异常时立刻停。",
    },
  },
  legal: {
    push: {
      radical: "激进派：证据、函件、程序同步走——法律路径慢但止损明确，别在拖延里损失扩大。",
      future: "未来派：推进前评估整个流程的时间、金钱与情绪成本——法律战周期很长，做好心理准备。",
      conservative: "保守派：每一个动作都留书面记录——程序正义比一时爽快更重要。",
    },
    steady: {
      radical: "激进派：协商如果对方无诚意就是浪费时间——设谈判期限，超期马上转正式路径。",
      future: "未来派：协商成本低但执行力弱——如果对方有违约前科，别抱太大期待。",
      conservative: "保守派：协商是首选但不是唯一选项——背后备好证据与法务预案，随时能升级。",
    },
    blend: {
      radical: "激进派：协商与备诉同步进行——一边争取和解一边保留主动权，对方不认真就升级。",
      future: "未来派：两条腿走路时更要控制总成本——别在两边都投入不足导致都悬着。",
      conservative: "保守派：各阶段写清升级条件与截止时间——什么情况下从协商切换到诉讼，提前定好。",
    },
  },
  content: {
    push: {
      radical: "激进派：高频产出、快速迭代——内容这行只有量变才能引发质变，别想着一篇封神。",
      future: "未来派：选赛道时看准 3 年后的内容趋势——现在火的 3 年后未必还在风口。",
      conservative: "保守派：高频产出也要有底线——不碰红线、不抄爆款、不烧口碑。",
    },
    steady: {
      radical: "激进派：精品化如果太慢就会被流量淘汰——至少保证一个稳定输出节奏。",
      future: "未来派：品牌积累比单篇爆款更有复利——质量是长期资产，别为了量牺牲辨识度。",
      conservative: "保守派：先打磨一套可复用的创作流程与模板——稳定输出比偶尔爆发更靠谱。",
    },
    blend: {
      radical: "激进派：主号稳品质、副线跑实验——按数据复盘，哪边划算倾斜哪边。",
      future: "未来派：双轨运行期间重点观察观众的真实偏好——数据比直觉更能指引方向。",
      conservative: "保守派：实验内容设好预算和频率上限——别让副线吃掉主线的精力。",
    },
  },
  social: {
    push: {
      radical: "激进派：主动邀约、合作、介绍——机会是聊出来的，等着不会有人敲你的门。",
      future: "未来派：拓展人脉时重质量而非数量——一个关键连接可能比一百条微信好友值钱。",
      conservative: "保守派：拓展前先确认精力边界——社交耗心神，别为了认识人把自己掏空。",
    },
    steady: {
      radical: "激进派：只维护不拓展会让人脉圈慢慢萎缩——至少每月认识一个新的人。",
      future: "未来派：深耕少数高质量关系比泛泛之交更有长期价值——选对人比认识多人更关键。",
      conservative: "保守派：维护现有关系前先分清哪些是真正重要的——不是所有人都值得你花时间。",
    },
    blend: {
      radical: "激进派：固定节奏维护+拓展并行——不冷落老朋友也不错过新机会。",
      future: "未来派：用周/月为节奏单位——维护是基本功，拓展是生长点，比例自己调。",
      conservative: "保守派：设好每周社交时间上限——过线就停，别让社交挤掉休息和其他重要事。",
    },
  },
  generic: {
    push: {
      radical: "激进派：押「{focus}」先落最小行动拿到反馈——别等「准备好」，真实结果比计划更能帮你判断。",
      future: "未来派：想清楚「{focus}」这一步 3 年后回头看是资产还是弯路——对「{topic}」眼光放长再下注。",
      conservative: "保守派：动「{focus}」前写清底线、止损与资源上限——对「{topic}」激情过后剩下的就是纪律。",
    },
    steady: {
      radical: "激进派：一直按兵不动本身就是一种选择——确认「{focus}」这个选择的代价你能承受。",
      future: "未来派：稳是手段不是目的——对「{topic}」设一个「再评估」日期，到期必须给结论。",
      conservative: "保守派：暂缓「{focus}」没错，但要区分「真稳定」和「假安全」——别用稳当借口。",
    },
    blend: {
      radical: "激进派：对「{focus}」小步试可以，但必须有过线就决定的条件——试太久等于没试。",
      future: "未来派：分阶段验证「{focus}」不是无限试——对「{topic}」每个阶段设明确指标和时间，一步步收敛。",
      conservative: "保守派：每段试水「{focus}」都写清投入上限与退出条件，不到底牌不翻。",
    },
  },
};

/** 按域类型与节奏生成 2-3 句简洁描述：锚定议题关键词，直接说明收益、风险与情绪影响 */
function buildRichDescription(params: {
  topic: string;
  topicShort: string;
  core: string;
  option: string;
  tone: "push" | "steady" | "blend";
  intro?: string;
  isFoodish?: boolean;
}): string {
  const { topic, topicShort, core, option, tone, intro, isFoodish } = params;
  const kind = detectDomainKind(`${topic}\n${core}`);
  const prefix = intro?.trim() ? `结合讨论：${clip(intro, 200)}。` : "";
  const foodish = isFoodish ?? false;

  if (foodish) {
    if (tone === "push")
      return `${prefix}选「${option}」：口味满足感更强——油盐辣与肠胃负担同步跟进，过得痛快还是身体舒服，各取所需。`;
    if (tone === "steady")
      return `${prefix}选「${option}」：更温和、身体负担更小——少一点即时满足，但对睡眠与状态更友好。`;
    return `${prefix}折中：少油少辣/小份/搭配清淡，在「${option}」与控制量之间换平衡——不解馋也不伤身。`;
  }

  const template = RICH_DESC[kind]?.[tone] ?? RICH_DESC.generic[tone];
  const filled = template
    .replace(/\{core\}/g, core)
    .replace(/\{topicShort\}/g, topicShort);
  return prefix ? `${prefix}${filled}` : filled;
}

/** 对描述做快速质量评分（0-100）：关键词锚定 / 信息密度 / 模板化程度 */
export function scoreDescriptionQuality(desc: string, topic: string, core: string): number {
  const d = (desc ?? "").replace(/\s+/g, " ").trim();
  if (!d) return 0;
  let score = 50;

  // 锚定议题关键词
  const topicKeywords = (topic.match(/[一-龥]{2,}|[a-zA-Z][a-zA-Z0-9_-]{2,}/g) ?? [])
    .filter((k) => !/还是|要不要|是否|怎么|如何|该不该|选择|the|and|for|with|this|that|what|how/i.test(k));
  const hitCount = topicKeywords.filter((k) => d.includes(k)).length;
  if (hitCount >= 2) score += 15;
  else if (hitCount >= 1) score += 8;

  // 核心决策语命中
  if (core.length >= 2 && d.includes(core)) score += 12;

  // 信息密度：有具体得失词汇
  const tradeoffWords = /风险|代价|损失|错过|压力更高|更稳|更可控|不高|更好|更糟|波动|窗口|不确定|受影响|负担|回撤/;
  if (tradeoffWords.test(d)) score += 10;

  // 句子数在 2-3 句理想区间
  const sentences = d.replace(/[！!]/g, "。").split(/[。.；;]/).filter((s) => s.trim().length > 1);
  if (sentences.length >= 2 && sentences.length <= 4) score += 10;
  else if (sentences.length < 2) score -= 10;

  // 惩罚模板化用词
  const boilerplateCount = (d.match(/走这一结果路径|收益与代价随该选项倾斜|落实该方向/g) ?? []).length;
  score -= boilerplateCount * 20;

  // 惩罚过短/过长
  if (d.length < 20) score -= 30;
  if (d.length > 400) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function buildBranchForOption(
  topic: string,
  hostRef: string,
  option: string,
  index: number,
  total: number,
): GroundedBranch {
  const topicShort = clip(topic.replace(/\s+/g, " "), 52);
  const label = formatOptionBranchName(option);
  const tone = branchToneForIndex(index, total);
  const foodish = /吃|喝|粥|烫|饭|面|夜宵|宵夜|外卖|辣|清淡|火锅|烧烤/.test(`${option}${topicShort}`);
  const riskBase = tone === "push" ? (foodish ? 52 : 58) : tone === "steady" ? (foodish ? 28 : 36) : 46;
  const benefitBase = tone === "push" ? (foodish ? 78 : 80) : tone === "steady" ? (foodish ? 64 : 62) : 72;
  const emo = tone === "push" ? "excited" : tone === "steady" ? "calm" : "happy";

  const rawDesc = buildRichDescription({
    topic,
    topicShort,
    core: option,
    option: label,
    tone,
    intro: hostRef?.trim() || undefined,
    isFoodish: foodish,
  });

  return {
    id: slugForOption(option, index),
    name: label,
    probability: 1 / Math.max(1, total),
    riskScore: Math.min(94, riskBase + (index % 2) * 4),
    benefitScore: Math.min(94, benefitBase - (index % 2) * 2),
    emotionForecast: emo,
    description: sanitizeBranchDescription(rawDesc, label, topicShort),
    nodes: templateDistilledNodes(`opt-${index}`, tone, topicShort, option),
    opinions: opinionsForPath(topicShort, label.replace(/[「」"]/g, ""), tone, { foodish }),
  };
}

function normalizeBranchProbabilities(branches: GroundedBranch[]): GroundedBranch[] {
  const sum = branches.reduce((s, b) => s + (Number.isFinite(b.probability) ? b.probability : 0), 0);
  if (sum <= 0) {
    const p = 1 / branches.length;
    return branches.map((b) => ({ ...b, probability: p }));
  }
  return branches.map((b) => ({ ...b, probability: b.probability / sum }));
}

/** 按议题动态生成 2～4 条互斥决策结果（结构只依赖议题语义，不读议会聊天） */
export function buildDynamicProjectionBranches(topic: string, hostRef = ""): GroundedBranch[] {
  const options = extractDecisionOptionsFromTopic(topic, "");
  let branches: GroundedBranch[];

  if (options.length >= MIN_PROJECTION_BRANCHES) {
    branches = options.map((opt, i) => buildBranchForOption(topic, hostRef, opt, i, options.length));
  } else {
    // 尝试结构化模板（二选一/要不要/领域分支），使用 hostRef 上下文
    const structured = getStructuredChoiceBranches(topic, hostRef);
    if (structured) {
      branches = structured;
    } else {
      const core = extractCoreDecisionPhrase(topic, hostRef);
      const coreLabel = clip(core, 14);
      branches = [
        buildBranchForOption(topic, hostRef, coreLabel, 0, 2),
        buildBranchForOption(topic, hostRef, `不${coreLabel}`, 1, 2),
      ];
    }
  }

  return normalizeBranchProbabilities(branches.slice(0, MAX_PROJECTION_BRANCHES));
}

/** 过滤模型返回的泛化「折中/妥协」路径（除非议题本身就在讨论折中） */
export function filterGenericBlendPaths<T extends { name: string; description?: string }>(
  branches: T[],
  topic: string,
): T[] {
  if (/折中|妥协/.test(topic)) return branches;
  return branches.filter((b) => {
    const pack = `${b.name}${b.description ?? ""}`;
    return !GENERIC_BLEND_PATH_NAME.test(pack) && !INVALID_BRANCH_NAME.test(b.name);
  });
}

/** 按议题已识别的互斥选项数截断路径（如 A/B 二选一最多 2 条） */
export function enforceTopicBranchCount<T extends { name: string; probability?: number }>(
  branches: T[],
  topic: string,
  hostRef: string,
): T[] {
  const limit = getTopicBranchLimit(topic, hostRef);
  if (branches.length <= limit) return branches;
  return [...branches]
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
    .slice(0, limit);
}

type EnrichableProjectionBranch = {
  name?: string;
  description?: string;
  probability?: number;
  riskScore?: number;
  benefitScore?: number;
  emotionForecast?: string;
  nodes?: GroundedBranch["nodes"];
  opinions?: GroundedBranch["opinions"];
};

function clampScoreLocal(n: unknown, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampProbLocal(n: unknown, fallback: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function mergeBranchEnrichment(
  skeleton: GroundedBranch,
  llm: EnrichableProjectionBranch | undefined,
  topic: string,
): GroundedBranch {
  if (!llm) return skeleton;
  const desc = llm.description?.trim();
  const useDesc = desc && isValidBranchDescription(desc, topic);
  const emoSet = new Set(["excited", "calm", "anxious", "happy", "sad"]);
  const emo =
    typeof llm.emotionForecast === "string" && emoSet.has(llm.emotionForecast)
      ? llm.emotionForecast
      : skeleton.emotionForecast;
  return {
    ...skeleton,
    description: sanitizeBranchDescription(useDesc ? desc : skeleton.description, skeleton.name, topic),
    probability: clampProbLocal(llm.probability, skeleton.probability),
    riskScore: clampScoreLocal(llm.riskScore, skeleton.riskScore),
    benefitScore: clampScoreLocal(llm.benefitScore, skeleton.benefitScore),
    emotionForecast: emo,
    nodes: Array.isArray(llm.nodes) && llm.nodes.length === 3 ? llm.nodes : skeleton.nodes,
    opinions: llm.opinions && typeof llm.opinions === "object" ? llm.opinions : skeleton.opinions,
  };
}

/**
 * 核心：路径结构（条数、id、name）永远由议题语义解析决定；
 * LLM 仅可 enrich 描述/分数/节点，且无效输出会被丢弃。
 */
export function applyGroundedProjectionStructure(
  topic: string,
  incoming: EnrichableProjectionBranch[] | null | undefined,
  hostRef = "",
): GroundedBranch[] {
  const skeleton = buildDynamicProjectionBranches(topic, hostRef);
  if (!incoming?.length) return skeleton;

  const valid = incoming.filter((b) =>
    isValidBranchName(b.name ?? "", topic),
  ) as Array<EnrichableProjectionBranch & { name: string }>;
  const pool = filterGenericBlendPaths(valid, topic);

  const merged = skeleton.map((sk, idx) => mergeBranchEnrichment(sk, pool[idx], topic));
  return normalizeBranchProbabilities(merged);
}

/** 客户端 / API 统一收口 */
export function finalizeProjectionForClient<T extends EnrichableProjectionBranch & { name: string }>(
  branches: T[],
  topic: string,
  hostRef: string,
): GroundedBranch[] {
  return applyGroundedProjectionStructure(topic, branches, hostRef);
}

export function buildGroundedProjectionFromCouncil(
  displayTopic: string,
  messages: GroundedCouncilMsg[],
): { branches: GroundedBranch[]; compared: GroundedCompared } {
  const topic = (displayTopic ?? "").trim() || "当前关键决策";
  const hostRef = extractHostSummary(messages);
  const branches = applyGroundedProjectionStructure(topic, null, hostRef);
  const [a, b] = [branches[0], branches[1] ?? branches[0]];
  return {
    branches,
    compared: {
      branchA: a.id,
      branchB: b.id,
      summary: `${a.name} 与 ${b.name} 代表不同决策结果；请结合「${clip(topic, 36)}」比较收益、风险与情绪预期。`,
      delta: {
        benefit: a.benefitScore - b.benefitScore,
        risk: a.riskScore - b.riskScore,
        emotionA: a.emotionForecast,
        emotionB: b.emotionForecast,
      },
    },
  };
}

/** API 返回的路径是否与归纳议题明显脱节（用于静态包回退本地锚定推演） */
export function projectionBranchesLookOffTopic(
  branches: GroundedBranch[],
  displayTopic: string,
  messages: GroundedCouncilMsg[],
): boolean {
  if (!Array.isArray(branches) || branches.length < 2) return true;
  const topic = (displayTopic ?? "").trim();
  const digest = hostOrFactionDigest(messages, topic);
  const blob = `${topic}\n${digest}`;
  if (isPersonalLifeBlob(blob) && branches.some((br) => MEETING_PATH_LEXICON.test(br.name) && !MEETING_PATH_LEXICON.test(blob))) {
    return true;
  }
  const pair = eitherOrPairFromTopicOrHost(topic, digest);
  if (pair && branchesMissEitherOrAnchors(branches, pair)) return true;
  const binaryAction = extractBinaryDecisionAction(topic) ?? extractBinaryDecisionAction(digest);
  if (binaryAction) {
    const actionHit = branches.filter((br) => {
      const pack = `${br.name}${br.description}${br.opinions?.radical?.opinion ?? ""}${br.opinions?.future?.opinion ?? ""}${br.opinions?.conservative?.opinion ?? ""}`;
      return optionMentionedInText(pack, binaryAction);
    }).length;
    if (actionHit < Math.min(2, branches.length)) return true;
  }

  const cities = orderedCitiesInTopic(blob);
  if (cities.length >= 2) {
    const cset = cities.slice(0, 4);
    const hitBranches = branches.filter((br) => {
      const pack = `${br.name}${br.description}`;
      return cset.some((c) => pack.includes(c));
    }).length;
    if (hitBranches < Math.min(2, branches.length)) return true;
  }
  if (topic.length >= 2) {
    const zh = topic.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
    const en = topic.match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g) ?? [];
    const merged = [...zh, ...en.map((w) => w.toLowerCase())];
    const uniq = [
      ...new Set(
        merged.filter((k) => !/还是|要不要|怎么|如何|应该|选择|the|and|for|with|this|that|what|how|why/.test(k)),
      ),
    ].slice(0, 8);
    if (uniq.length > 0) {
      const anyKw = branches.some((br) => {
        const p = `${br.name}${br.description}${br.opinions?.radical?.opinion ?? ""}${br.opinions?.future?.opinion ?? ""}${br.opinions?.conservative?.opinion ?? ""}`.toLowerCase();
        return uniq.some((k) => p.includes(k.toLowerCase()));
      });
      if (!anyKw) return true;
    }
  }
  return false;
}
