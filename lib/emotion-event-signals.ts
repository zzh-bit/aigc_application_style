/**
 * 议会聊天在 /api/emotion 不可用时的本地回退：按消极/积极「事件与情绪词」估算仪表盘波动。
 * 与 app/api/emotion 的词典互补，偏「生活事件」与口语场景。
 */
export type ChatMoodSignal = { re: RegExp; score: number };

/** 消极侧：心理崩溃、压力、职场学业、财务、关系、健康、家庭、法律、丧失与失败感等 */
export const CHAT_NEGATIVE_MOOD_SIGNALS: ChatMoodSignal[] = [
  { re: /(崩溃|绝望|活不下去|撑不住|撑不住了|受不了了|要完了|完蛋了|世界末日)/gi, score: 16 },
  { re: /(不想活了|轻生念头|自伤冲动)/gi, score: 16 },
  { re: /(恐慌|发狂|失控|麻木|窒息感|心堵|想哭|哭不出来)/gi, score: 13 },
  { re: /(焦虑|害怕|恐惧|心慌|慌张|担心|忧心|忐忑|惶恐|发慌|好慌|好怕)/gi, score: 10 },
  { re: /(失眠|睡不着|彻夜难眠|早醒|噩梦|惊醒)/gi, score: 10 },
  { re: /(紧张|压力|内耗|烦躁|不安|没状态|低落|难过|委屈|沮丧|空虚|孤独|无助|迷茫)/gi, score: 7 },
  { re: /(裁员|失业|离职|被辞退|被优化|末位淘汰|绩效不达标|kpi|考核|降薪|减员|停薪)/gi, score: 11 },
  { re: /(面试失败|被拒|考试失利|挂科|延期毕业|毕不了业|延毕|退学|劝退)/gi, score: 11 },
  { re: /(内卷|996|007|加班到爆|burnout|职业倦怠)/gi, score: 9 },
  { re: /(欠款|负债|还不上|违约|逾期|暴雷|断供|房贷|房租|现金流|收入下降|被追债|破产)/gi, score: 11 },
  { re: /(投资失败|股票腰斩|理财亏损|被骗钱|诈骗|盗刷)/gi, score: 10 },
  { re: /(争吵|冲突|冷战|分手|离婚|出轨|背叛|被拉黑|被误解|被指责|关系破裂|家暴)/gi, score: 10 },
  { re: /(育儿|带娃|婆媳|亲子矛盾|赡养压力|原生家庭)/gi, score: 8 },
  { re: /(生病|住院|手术|复发|疼痛|恶化|确诊|复查|指标不好|焦虑发作|惊恐发作)/gi, score: 10 },
  { re: /(起诉|被告|律师函|仲裁|纠纷|赔偿|强制执行)/gi, score: 10 },
  { re: /(亲人去世|离世|过世|丧亲|葬礼)/gi, score: 12 },
  { re: /(社死|丢脸|搞砸了|全责|被通报|公开批评)/gi, score: 9 },
  { re: /(deadline|ddl|截止|来不及|赶不完|超时|堆积|返工|事故|线上问题|\bbug\b|故障|宕机)/gi, score: 7 },
  { re: /(签证拒签|遣返|滞留|异国无依|适应不了)/gi, score: 9 },
  { re: /(移民失败|落户失败|买房踩坑|租房被坑)/gi, score: 8 },
];

/** 积极侧：释然、成就、职场学业、财务、关系、健康、自我调节等 */
export const CHAT_POSITIVE_MOOD_SIGNALS: ChatMoodSignal[] = [
  { re: /(如释重负|终于放心了|踏实了|心安了|非常安心|石头落地)/gi, score: 18 },
  { re: /(平静|放松|安心|释然|想通了|有把握|可控|稳定了|稳住了|淡定)/gi, score: 12 },
  { re: /(开心|高兴|愉快|轻松|乐观|有信心|状态不错|好多了|喜悦|幸福)/gi, score: 9 },
  { re: /(感恩|感谢|被善待|幸运|惊喜)/gi, score: 8 },
  { re: /(升职|加薪|拿到offer|通过面试|绩效优秀|考试通过|上岸|毕业|录取|奖学金)/gi, score: 14 },
  { re: /(项目上线成功|发布顺利|验收通过|客户满意|中标)/gi, score: 12 },
  { re: /(还清|结清|收入提升|涨薪|盈利|回款|现金流转正|房贷压力减轻|解套)/gi, score: 13 },
  { re: /(和好|沟通顺畅|被理解|被支持|关系缓和|重归于好|得到帮助|求婚成功|复合)/gi, score: 11 },
  { re: /(康复|恢复良好|检查正常|痊愈|睡得很好|睡眠恢复|身体好转|转阴)/gi, score: 12 },
  { re: /(官司和解|赔偿到位|纠纷解决|撤诉)/gi, score: 11 },
  { re: /(深呼吸|冥想|休息|散步|运动了|睡一觉|复盘完成|任务完成|问题解决|搞定)/gi, score: 9 },
  { re: /(签证通过|落户成功|交房了|装修完工)/gi, score: 10 },
];

/** 与 API 否定规则对齐的本地衰减 */
export const CHAT_MOOD_NEGATION_LOCAL =
  /(不|没|别|并无|不算|谈不上|不至于)[^，。！？\n]{0,8}(焦虑|紧张|难过|害怕|担心|崩溃|绝望|恐慌|心慌|慌张|委屈|低落|慌|怕)/;

/** 偏「低落/悲伤」语气的补充（用于词汇层选 sad vs anxious） */
export const CHAT_SAD_LEAN_RE =
  /(难过|伤心|委屈|想哭|绝望|失落|沮丧|抑郁|孤独|空虚|无助|心累|迷茫|没意思|痛苦|悲伤)/;

/** 偏「亢奋/喜悦」的补充（用于词汇层选 excited vs happy） */
export const CHAT_JOY_EXCITED_RE = /(激动|兴奋|期待|燃|迫不及待|太期待|冲|热血)/;

/**
 * 汇总消极/积极词强度（与议会 fallback 同一套累加规则），供 API 成功后的「词汇补充」与离线 fallback 共用。
 * `net = neg - pos`：偏大表示压力词占优；偏小表示积极词占优。议会页用 `mapLexicalNetToLevelDelta(net, level)` 把 net 与当前压力档位换算成环上点数（与 neg 分值对齐，不再用 net×0.55 压扁）。
 */
export function computeChatLexicalMoodTotals(trimmed: string): { neg: number; pos: number; net: number } {
  let neg = CHAT_NEGATIVE_MOOD_SIGNALS.reduce((acc, s) => {
    const hitCount = trimmed.match(s.re)?.length ?? 0;
    if (hitCount === 0) return acc;
    return acc + Math.min(s.score * hitCount, s.score * 2);
  }, 0);
  const pos = CHAT_POSITIVE_MOOD_SIGNALS.reduce((acc, s) => {
    const hitCount = trimmed.match(s.re)?.length ?? 0;
    if (hitCount === 0) return acc;
    return acc + Math.min(s.score * hitCount, s.score * 2);
  }, 0);
  if (CHAT_MOOD_NEGATION_LOCAL.test(trimmed)) neg = Math.round(neg * 0.32);
  return { neg, pos, net: neg - pos };
}
