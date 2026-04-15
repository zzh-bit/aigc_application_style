import { NextResponse } from "next/server";
import { applyCors, corsPreflight } from "@/app/api/_cors";

// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

type SummarizeRequestBody = {
  text: string;
};

function summarizeMock(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "无内容可摘要。";
  const maxLen = 120;
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}

export async function POST(req: Request) {
  let body: SummarizeRequestBody;
  try {
    body = (await req.json()) as SummarizeRequestBody;
  } catch {
    return applyCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  if (typeof body.text !== "string") {
    return applyCors(req, NextResponse.json({ error: "Missing text" }, { status: 400 }));
  }

  const summary = summarizeMock(body.text);
  return applyCors(req, NextResponse.json({ summary }));
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

