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
function extractCoreDecisionPhrase(topic: string, hostRef: string): string {
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
 * 三派系简短意见：适用于任意议题；pathFocus 为本条路径的标签（选项名/城市/节奏名）。
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

  if (tone === "push") {
    if (food) {
      return {
        radical: opPair(82, `激进派：想选「${p}」就别久拖；适量，别影响休息和肠胃。`),
        future: opPair(66, `未来派：隔天若有要事，「${p}」点到为止，留状态。`),
        conservative: opPair(44, `保守派：太晚或胃不舒服就减量「${p}」，别硬撑。`),
      };
    }
    return {
      radical: opPair(84, `激进派：押「${p}」先落最小行动，把「${t}」推进到可验证。`),
      future: opPair(68, `未来派：为「${p}」设 7～30 天复盘，对齐更长目标。`),
      conservative: opPair(42, `保守派：动「${p}」前写好底线、止损与资源上限。`),
    };
  }

  if (tone === "steady") {
    if (food) {
      return {
        radical: opPair(36, `激进派：怕「${p}」太寡淡就加点搭配，别又报复性乱吃。`),
        future: opPair(74, `未来派：「${p}」更利身体与作息时，值得优先。`),
        conservative: opPair(88, `保守派：今晚「${p}」最省心、最稳。`),
      };
    }
    return {
      radical: opPair(34, `激进派：嫌「${p}」慢可设「到点就加码」的触发条件。`),
      future: opPair(72, `未来派：「${p}」若更可持续，坚持到复盘日再调整。`),
      conservative: opPair(88, `保守派：「${p}」风险更可控，适合当前承压阶段。`),
    };
  }

  // blend / 中间取向：表述锚定 pathFocus，避免泛化「折中」套话
  if (food) {
    return {
      radical: opPair(58, `激进派：「${p}」可以，今晚定主调，别越吃越杂。`),
      future: opPair(86, `未来派：先试「${p}」，感受再选更偏哪一侧。`),
      conservative: opPair(76, `保守派：控制总量，盯紧肠胃与睡眠。`),
    };
  }
  if (ctx.cityMode && blendPeer) {
    return {
      radical: opPair(58, `激进派：「${p}」要设截止，避免在「${t}」上无限拖延。`),
      future: opPair(86, `未来派：在${blendPeer}之间试点迁移或通勤，再收敛。`),
      conservative: opPair(76, `保守派：「${p}」须划清预算、通勤与健康红线。`),
    };
  }
  if (blendPeer) {
    return {
      radical: opPair(58, `激进派：「${p}」要设截止，别把「${t}」悬着不决。`),
      future: opPair(86, `未来派：在${blendPeer}之间小步试点，用结果再定主方向。`),
      conservative: opPair(76, `保守派：划清边界与成本上限，避免两头都不落实。`),
    };
  }
  return {
    radical: opPair(58, `激进派：「${p}」可行，但必须有过线就选的机制。`),
    future: opPair(86, `未来派：分阶段验证「${t}」，再收敛到主方案。`),
    conservative: opPair(76, `保守派：每段写清投入上限与退出条件。`),
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

  return [
    {
      id: "tpl-core-push",
      name: `推进「${coreLabel}」`,
      probability: 0.4,
      riskScore: 62,
      benefitScore: 82,
      emotionForecast: "excited",
      description: `${intro}围绕「${topicShort}」，全力推进「${core}」：进展最快，短期波动与压力可能更高。`,
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
      description: `${intro}围绕「${topicShort}」，暂缓「${core}」：先守基本盘、补信息，节奏更稳，可能放慢窗口。`,
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
      description: `${intro}围绕「${topicShort}」，对「${core}」小步试点：控制投入与截止日，再决定全面推进或收手。`,
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
    return `选择「${label}」：围绕「${subj}」落实该方向，关注机会、成本、节奏与情绪承受。`;
  }
  return clip(t, 480);
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

  const rawDesc = foodish
    ? `若选择「${label}」：围绕「${topicShort}」落实该结果，口味与身体负担随该选项变化。`
    : `若选择「${label}」：围绕「${topicShort}」走这一结果路径，收益、风险与节奏随该方向倾斜。`;

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
export function buildDynamicProjectionBranches(topic: string, _hostRef = ""): GroundedBranch[] {
  const options = extractDecisionOptionsFromTopic(topic, "");
  let branches: GroundedBranch[];

  if (options.length >= MIN_PROJECTION_BRANCHES) {
    branches = options.map((opt, i) => buildBranchForOption(topic, "", opt, i, options.length));
  } else {
    const core = extractCoreDecisionPhrase(topic, "");
    const coreLabel = clip(core, 14);
    branches = [
      buildBranchForOption(topic, "", coreLabel, 0, 2),
      buildBranchForOption(topic, "", `不${coreLabel}`, 1, 2),
    ];
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
): GroundedBranch[] {
  const skeleton = buildDynamicProjectionBranches(topic, "");
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
  _hostRef: string,
): GroundedBranch[] {
  return applyGroundedProjectionStructure(topic, branches);
}

export function buildGroundedProjectionFromCouncil(
  displayTopic: string,
  messages: GroundedCouncilMsg[],
): { branches: GroundedBranch[]; compared: GroundedCompared } {
  const topic = (displayTopic ?? "").trim() || "当前关键决策";
  const branches = applyGroundedProjectionStructure(topic, null);
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
