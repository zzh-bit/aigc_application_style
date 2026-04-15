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

  // blend
  if (food) {
    return {
      radical: opPair(58, `激进派：折中可以，今晚定主调，别越吃越杂。`),
      future: opPair(86, `未来派：先试搭配，感受再选更偏哪一侧。`),
      conservative: opPair(76, `保守派：控制总量，盯紧肠胃与睡眠。`),
    };
  }
  if (ctx.cityMode && blendPeer) {
    return {
      radical: opPair(58, `激进派：折中要设截止，避免在「${t}」上无限拖延。`),
      future: opPair(86, `未来派：在${blendPeer}之间试点迁移或通勤，再收敛。`),
      conservative: opPair(76, `保守派：折中须划清预算、通勤与健康红线。`),
    };
  }
  if (blendPeer) {
    return {
      radical: opPair(58, `激进派：折中要设截止，别把「${t}」悬着不决。`),
      future: opPair(86, `未来派：在${blendPeer}之间小步试点，用结果再定主方向。`),
      conservative: opPair(76, `保守派：划清边界与成本上限，避免两头都不落实。`),
    };
  }
  return {
    radical: opPair(58, `激进派：折中可以，但必须有过线就选的机制。`),
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

  return [
    {
      id: "grounded-yes-action",
      name: `执行「${act}」`,
      probability: 0.4,
      riskScore: 56,
      benefitScore: 80,
      emotionForecast: "excited",
      description: `${intro}主选执行「${action}」：直接投入并换取真实反馈，对「${topicShort}」推进最快，但短期波动更大。`,
      nodes: templateDistilledNodes("yn-yes", "push", topicShort, action),
      opinions: opinionsForPath(topicShort, `执行${act}`, "push", {}),
    },
    {
      id: "grounded-no-action",
      name: `暂不执行「${act}」`,
      probability: 0.34,
      riskScore: 34,
      benefitScore: 62,
      emotionForecast: "calm",
      description: `${intro}主选暂不执行「${action}」：先守住现状并补信息，风险更可控，但可能错过窗口期。`,
      nodes: templateDistilledNodes("yn-no", "steady", topicShort, action),
      opinions: opinionsForPath(topicShort, `暂不${act}`, "steady", {}),
    },
    {
      id: "grounded-trial-action",
      name: `小步试行「${act}」`,
      probability: 0.32,
      riskScore: 46,
      benefitScore: 74,
      emotionForecast: "happy",
      description: `${intro}折中方案：围绕「${action}」先做低成本试点，设定触发条件后再决定全面执行或继续观望。`,
      nodes: templateDistilledNodes("yn-mix", "blend", topicShort, action),
      opinions: opinionsForPath(topicShort, `试行${act}`, "blend", {
        blendPeer: `「执行${act}」与「暂不${act}」`,
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

export function buildGroundedProjectionFromCouncil(
  displayTopic: string,
  messages: GroundedCouncilMsg[],
): { branches: GroundedBranch[]; compared: GroundedCompared } {
  const topic = (displayTopic ?? "").trim() || "当前关键决策";
  const digest = hostOrFactionDigest(messages, topic);
  const branches = getStructuredChoiceBranches(topic, digest) ?? coreTripleBranches(topic, digest);
  const [a, b] = [branches[0], branches[2] ?? branches[1]];
  return {
    branches,
    compared: {
      branchA: a.id,
      branchB: b.id,
      summary: `${a.name} 更偏进攻与上行空间；${b.name} 更偏风险与节奏平衡。请结合「${clip(topic, 36)}」取舍。`,
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
