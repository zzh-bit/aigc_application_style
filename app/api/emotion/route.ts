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

function detectEmotion(text: string): { label: EmotionLabel; score: number } {
  const t = text.toLowerCase();
  const has = (keywords: string[]) => keywords.some((k) => t.includes(k));

  if (has(["焦虑", "紧张", "害怕", "恐惧", "崩溃", "panic", "anx", "worried", "担心"])) {
    return { label: "anxious", score: clamp01(0.8) };
  }
  if (has(["难过", "抑郁", "失落", "想哭", "sad", "depress"])) {
    return { label: "sad", score: clamp01(0.75) };
  }
  if (has(["兴奋", "激动", "燃", "冲", "excited", "thrilled"])) {
    return { label: "excited", score: clamp01(0.8) };
  }
  if (has(["开心", "高兴", "幸福", "happy", "glad"])) {
    return { label: "happy", score: clamp01(0.7) };
  }
  if (has(["平静", "放松", "安心", "calm", "relaxed"])) {
    return { label: "calm", score: clamp01(0.65) };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) return { label: "calm", score: 0.35 };
  return { label: "calm", score: clamp01(0.45) };
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

