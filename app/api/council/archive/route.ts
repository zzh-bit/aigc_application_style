import { NextResponse } from "next/server";
import {
  readCouncilArchives,
  saveCouncilArchive,
  type ArchivedMessage,
  type ArchivedEmotion,
} from "@/lib/server/council-archive";
import { applyCors, corsPreflight } from "@/app/api/_cors";

type ArchiveRequestBody = {
  messages?: Array<{
    role?: string;
    name?: string;
    content?: string;
  }>;
};

export const runtime = "nodejs";
// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

function isValidDate(input: string) {
  const t = Date.parse(input);
  return Number.isFinite(t);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 20;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const emotionParam = (url.searchParams.get("emotion") ?? "").trim();

  if (from && !isValidDate(from)) {
    return applyCors(req, NextResponse.json({ error: "Invalid from date" }, { status: 400 }));
  }
  if (to && !isValidDate(to)) {
    return applyCors(req, NextResponse.json({ error: "Invalid to date" }, { status: 400 }));
  }

  const emotionFilters = emotionParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ArchivedEmotion[];

  const list = await readCouncilArchives();
  const filtered = list.filter((item) => {
    const ts = Date.parse(item.date);
    if (from && Number.isFinite(ts) && ts < Date.parse(from)) return false;
    if (to && Number.isFinite(ts) && ts > Date.parse(to)) return false;
    if (emotionFilters.length > 0 && !emotionFilters.some((e) => item.emotions.includes(e))) return false;
    return true;
  });

  return applyCors(req, NextResponse.json({
    total: filtered.length,
    items: filtered.slice(0, limit),
  }));
}

export async function POST(req: Request) {
  let body: ArchiveRequestBody;
  try {
    body = (await req.json()) as ArchiveRequestBody;
  } catch {
    return applyCors(req, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: ArchivedMessage[] = raw
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      name: typeof m.name === "string" ? m.name : m.role === "assistant" ? "助手" : "用户",
      content: typeof m.content === "string" ? m.content : "",
    }))
    .filter((m) => m.content.trim().length > 0);

  if (messages.length === 0) {
    return applyCors(req, NextResponse.json({ error: "Missing messages" }, { status: 400 }));
  }

  const record = await saveCouncilArchive(messages);
  return applyCors(req, NextResponse.json({ ok: true, record }));
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
