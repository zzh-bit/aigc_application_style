import { NextResponse } from "next/server";
import { applyCors, corsPreflight } from "@/app/api/_cors";

// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

type EmotionRequestBody = {
  text: string;
  inputMode?: "text" | "voice";
  voiceMockEnabled?: boolean;
};

type EmotionLabel = "calm" | "anxious" | "sad" | "happy" | "excited";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** 词组权重：同组内任一命中即加 weight（按组累计） */
const EMOTION_GROUPS: Array<{ label: EmotionLabel; weight: number; terms: string[] }> = [
  {
    label: "anxious",
    weight: 0.42,
    terms: [
      "崩溃",
      "受不了了",
      "受不了",
      "要命",
      "好慌",
      "好怕",
      "完蛋",
      "彻夜难眠",
      "睡不着",
      "压力山大",
      "亚历山大",
      "内耗",
      "慌得",
      "忐忑",
      "惶恐",
      "发慌",
      "心慌",
      "焦虑",
      "紧张",
      "害怕",
      "恐惧",
      "惧怕",
      "担心",
      "担忧",
      "忧心",
      "不安",
      "慌张",
      "慌",
      "着急",
      "急躁",
      "panic",
      "anxious",
      "anxiety",
      "worried",
      "worry",
      "nervous",
      "stress",
      "stressed",
      "overwhelm",
      "fear",
      "scared",
      "afraid",
      "内耗",
      "降薪",
      "被优化",
      "末位淘汰",
      "仲裁",
      "起诉",
      "家暴",
      "丧亲",
    ],
  },
  {
    label: "sad",
    weight: 0.38,
    terms: [
      "想哭",
      "哭了",
      "绝望",
      "心累",
      "好累",
      "没意思",
      "没意思了",
      "空虚",
      "孤独",
      "孤单",
      "无助",
      "迷茫",
      "难过",
      "伤心",
      "失落",
      "沮丧",
      "抑郁",
      "低落",
      "悲伤",
      "痛苦",
      "心疼",
      "失望",
      "委屈",
      "sad",
      "depress",
      "depressed",
      "hopeless",
      "lonely",
      "empty",
      "cry",
      "crying",
      "grief",
      "丧亲",
      "空虚感",
      "被背叛",
      "羞辱",
    ],
  },
  {
    label: "excited",
    weight: 0.4,
    terms: [
      "迫不及待",
      "太期待",
      "翘首",
      "燃起来了",
      "燃起来",
      "冲鸭",
      "热血",
      "亢奋",
      "兴奋",
      "激动",
      "太棒了",
      "太爽",
      "跃跃欲试",
      "摩拳擦掌",
      "振奋",
      "激情",
      "激动人心",
      "thrilled",
      "excited",
      "pumped",
      "hyped",
      "上岸",
      "录取",
      "中标",
    ],
  },
  {
    label: "happy",
    weight: 0.35,
    terms: [
      "太好",
      "开心",
      "高兴",
      "快乐",
      "幸福",
      "满意",
      "欣慰",
      "踏实",
      "轻松",
      "愉快",
      "喜悦",
      "感恩",
      "感谢",
      "happy",
      "glad",
      "pleased",
      "joy",
      "relieved",
      "content",
      "回款了",
      "涨薪",
      "和解",
      "康复",
    ],
  },
  {
    label: "calm",
    weight: 0.32,
    terms: [
      "平静",
      "淡定",
      "从容",
      "泰然",
      "冷静",
      "理性",
      "想通了",
      "顺其自然",
      "随遇而安",
      "放松",
      "安心",
      "踏实了",
      "calm",
      "peace",
      "peaceful",
      "relaxed",
      "chill",
      "zen",
      "放下",
      "随缘",
      "不强求",
    ],
  },
];

function detectEmotion(raw: string): { label: EmotionLabel; score: number } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { label: "calm", score: 0.32 };
  }

  const lower = trimmed.toLowerCase();
  /** 用于匹配：英文小写 + 中文原文 */
  const haystack = `${trimmed}\n${lower}`;
  const isLikelyQuestion =
    /[？?]/.test(trimmed) ||
    /^(什么|怎么|如何|为什么|是否|可否|请问|能否|有没有|which|what|how|why|can|could)\b/i.test(trimmed);

  const scores: Record<EmotionLabel, number> = {
    anxious: 0,
    sad: 0,
    excited: 0,
    happy: 0,
    calm: 0,
  };

  for (const { label, weight, terms } of EMOTION_GROUPS) {
    const hit = terms.some((term) => {
      if (/[\u4e00-\u9fa5]/.test(term)) {
        return trimmed.includes(term) || lower.includes(term.toLowerCase());
      }
      return lower.includes(term.toLowerCase());
    });
    if (hit) scores[label] += weight;
  }

  const totalStrong = scores.anxious + scores.sad + scores.excited + scores.happy;
  // 普通问句且未命中明显情绪词：直接判平静，避免“随便问一句就波动”。
  if (isLikelyQuestion && totalStrong < 0.26) {
    return { label: "calm", score: 0.58 };
  }

  // 否定缓和：「不 / 没 + 焦虑|难过|害怕…」略降对应强烈情绪（含单字慌/怕等易误判词）
  const negation =
    /(不|没|非|别|勿|无|没有|并未|不算|谈不上)[^，。！？\n]{0,8}(焦虑|紧张|难过|伤心|害怕|恐惧|担心|崩溃|绝望|慌|怕|急|低落|委屈)/;
  if (negation.test(trimmed)) {
    scores.anxious *= 0.48;
    scores.sad *= 0.48;
  }

  // 强烈语气略抬高峰值（系数收敛，避免消极宣泄时分数与「兴奋」一并虚高）
  const intense = (/[!！]{2,}/.test(trimmed) ? 0.07 : 0) + (/[？?]{3,}/.test(trimmed) ? 0.04 : 0);
  if (intense > 0) {
    const strongNeg = scores.anxious + scores.sad;
    const strongPos = scores.excited + scores.happy;
    scores.anxious += intense * (strongNeg >= strongPos ? 1 : 0.55);
    scores.sad += intense * (strongNeg >= strongPos ? 0.55 : 0.25);
    scores.excited += intense * (strongPos > strongNeg ? 0.5 : 0.2);
  }

  // 文本略长且无情绪词时略偏「中性平静」
  if (trimmed.length > 80) {
    const totalSignal = scores.anxious + scores.sad + scores.excited + scores.happy + scores.calm;
    if (totalSignal < 0.25) {
      scores.calm += 0.18;
    }
  }

  const entries = (Object.keys(scores) as EmotionLabel[]).map((k) => [k, scores[k]] as const);
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0]!;
  const second = entries[1]!;

  // 全为零：按正文长度给轻微平静置信
  if (top[1] <= 0) {
    return {
      label: "calm",
      score: clamp01(0.38 + Math.min(0.15, trimmed.length / 600)),
    };
  }

  // 置信度：第一名相对第二名的优势 + 绝对强度（消极类略压上限，减少仪表盘「一步拉满」）
  let label: EmotionLabel = top[0];
  const margin = top[1] - second[1];
  const strength = top[1];
  const isNegativeTop = label === "anxious" || label === "sad";
  let score = clamp01(
    0.42 + margin * (isNegativeTop ? 0.82 : 0.95) + strength * (isNegativeTop ? 0.32 : 0.38),
  );
  if (label === "calm" && second[0] !== "calm" && second[1] > 0.12 && margin < 0.1) {
    label = second[0];
    score = clamp01(0.48 + second[1] * 0.55);
  }
  // 低强度信号时，回落为平静，减少误判抖动。
  if (label !== "calm" && strength < 0.33 && margin < 0.16) {
    return { label: "calm", score: 0.56 };
  }

  return { label, score };
}

export async function POST(req: Request) {
  let body: EmotionRequestBody;
  try {
    body = (await req.json()) as EmotionRequestBody;
  } catch {
    return applyCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  if (typeof body.text !== "string") {
    return applyCors(req, NextResponse.json({ error: "Missing text" }, { status: 400 }));
  }

  const { label, score } = detectEmotion(body.text);
  const inputMode = body.inputMode === "voice" ? "voice" : "text";
  const voiceInterface = {
    enabled: body.voiceMockEnabled === true,
    provider: "mock",
  };
  return applyCors(req, NextResponse.json({ label, score, inputMode, voiceInterface }));
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
