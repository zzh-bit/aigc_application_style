import type { EmotionType } from "@/lib/types/domain";
import {
  CHAT_JOY_EXCITED_RE,
  CHAT_MOOD_NEGATION_LOCAL,
  CHAT_SAD_LEAN_RE,
  computeChatLexicalMoodTotals,
} from "@/lib/emotion-event-signals";

export const INSIGHT_TOPICS = ["生活", "工作", "旅行", "学习", "情绪"] as const;
export type InsightTopic = (typeof INSIGHT_TOPICS)[number];

export function normalizeInsightUserText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/** 每轮归档计 1 票：从用户整条发言中推断主导情绪 */
export function dominantInsightEmotion(userText: string): EmotionType {
  const raw = normalizeInsightUserText(userText);
  if (!raw) return "calm";

  const lower = raw.toLowerCase();
  const negated = CHAT_MOOD_NEGATION_LOCAL.test(raw);
  const { neg, pos, net } = computeChatLexicalMoodTotals(raw);

  type ScoreMap = Record<EmotionType, number>;
  const score: ScoreMap = { happy: 0, sad: 0, anxious: 0, calm: 0, excited: 0 };

  const add = (e: EmotionType, w: number) => {
    score[e] += w;
  };

  if (!negated) {
    if (net >= 8) {
      add(CHAT_SAD_LEAN_RE.test(raw) ? "sad" : "anxious", 12 + Math.min(8, Math.floor(net / 3)));
    } else if (net >= 4) {
      add(CHAT_SAD_LEAN_RE.test(raw) ? "sad" : "anxious", 8);
    } else if (net <= -8) {
      add(CHAT_JOY_EXCITED_RE.test(raw) ? "excited" : "happy", 12 + Math.min(8, Math.floor(-net / 3)));
    } else if (net <= -4) {
      add(CHAT_JOY_EXCITED_RE.test(raw) ? "excited" : "happy", 8);
    }
  }

  const hits = (words: string[], weight: number, target: EmotionType) => {
    if (words.some((k) => lower.includes(k.toLowerCase()))) add(target, weight);
  };

  hits(
    ["开心", "高兴", "幸福", "满意", "愉快", "喜悦", "快乐", "happy", "joy"],
    5,
    "happy",
  );
  hits(["难过", "伤心", "失落", "沮丧", "委屈", "sad"], 5, "sad");
  hits(
    ["焦虑", "紧张", "担心", "害怕", "恐惧", "慌", "忐忑", "不安", "anxious", "worried", "panic"],
    5,
    "anxious",
  );
  hits(["平静", "放松", "安心", "淡定", "踏实", "calm", "relaxed", "释然"], 4, "calm");
  hits(["激动", "兴奋", "期待", "燃", "亢奋", "excited", "thrilled"], 5, "excited");

  if (negated) {
    score.anxious *= 0.35;
    score.sad *= 0.35;
  }

  const tieOrder: EmotionType[] = ["anxious", "sad", "excited", "happy", "calm"];
  const maxV = Math.max(...tieOrder.map((e) => score[e]), 0);
  if (maxV <= 0 && neg + pos === 0 && /平静|放松|安心|淡定|踏实|calm/.test(lower)) return "calm";
  for (const e of tieOrder) {
    if (score[e] === maxV && maxV > 0) return e;
  }
  return "calm";
}

function scoreTravel(text: string): number {
  let s = 0;
  if (/(旅行|旅游|出游|自由行|跟团游|攻略|景点|景区|机票|航班|登机|酒店|民宿|青旅|护照|签证)/.test(text)) s += 12;
  if (/(出差)/.test(text)) s += 5;
  return s;
}

function scoreStudy(text: string): number {
  let s = 0;
  if (/(学习|复习|考试|考研|保研|留学|录取|毕设|论文|课题|课程|选课|学分|学校|大学|专业|备考)/i.test(text)) s += 12;
  if (/(雅思|托福|gre|gmat|在读|读研|导师|答辩)/i.test(text)) s += 8;
  return s;
}

function scoreWork(text: string): number {
  let s = 0;
  if (
    /(工作|职场|上班|加班|996|同事|老板|领导|下属|面试|求职|跳槽|离职|裁员|绩效|kpi|薪资|薪水|offer|hc|汇报|工位|打卡|项目交付|甲方|乙方)/i.test(
      text,
    )
  )
    s += 12;
  if (/(实习|试用期|转正|内推|背调)/.test(text)) s += 8;
  // 城市名仅在与求职/工作语境同时出现时才加分，避免「去北京玩」误判为工作
  if (/(北京|上海|深圳|广州|杭州|成都)/.test(text) && /(工作|上班|求职|面试|跳槽|offer|职场|薪资|北漂)/.test(text)) s += 4;
  if (/(去北京|去上海|去深圳|去杭州)(玩|旅游|散心|度假)/.test(text)) s -= 8;
  return Math.max(0, s);
}

function scoreLife(text: string): number {
  let s = 0;
  if (/(家庭|家人|父母|孩子|育儿|恋爱|结婚|分手|离婚|搬家|买房|租房|装修|健身|作息|饮食|健康|医院|体检)/.test(text)) s += 10;
  if (/(日常|生活习惯|生物钟)/.test(text)) s += 6;
  if (/(逛|玩|吃吃喝喝)([^学工]|$)/.test(text) && !/(旅行|旅游|机票)/.test(text)) s += 3;
  return s;
}

function scoreEmotionMeta(text: string): number {
  let s = 0;
  if (/(情绪|心态|心理状态|压力很大|心理负担|内耗|emo|睡不着|失眠)/i.test(text)) s += 8;
  if (/(选哪个|不知道怎么办|很纠结|下不了决心)/.test(text)) s += 4;
  return s;
}

/** 每归档 1 条：综合全文打一个主主题（五类之一） */
export function primaryInsightTopic(userText: string): InsightTopic {
  const raw = normalizeInsightUserText(userText);
  if (!raw) return "生活";

  const text = raw.toLowerCase();

  const scores: Record<InsightTopic, number> = {
    旅行: scoreTravel(text),
    学习: scoreStudy(text),
    工作: scoreWork(text),
    情绪: scoreEmotionMeta(text),
    生活: scoreLife(text),
  };

  const domainMax = Math.max(scores.旅行, scores.学习, scores.工作, scores.生活);
  // 仅在缺乏明确领域线索时，才把「情绪」类抬成主类，避免抢走具体议题
  if (scores.情绪 >= 10 && domainMax < 8) {
    scores.情绪 += 6;
  } else if (scores.情绪 >= 6 && domainMax < 5) {
    scores.情绪 += 3;
  }

  const tieBreak: InsightTopic[] = ["旅行", "学习", "工作", "情绪", "生活"];
  let best: InsightTopic = "生活";
  let bestV = -1;
  for (const t of tieBreak) {
    const v = scores[t];
    if (v > bestV) {
      bestV = v;
      best = t;
    }
  }
  if (bestV <= 0) return "生活";
  return best;
}
