import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildMentorSystemPrompt, getMentorPromptProfile } from "@/lib/mentor/prompt-library";
import { applyCorsHeaders, corsPreflight } from "@/app/api/_cors";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequestBody = {
  messages: ChatMessage[];
  mode?: string;
  stream?: boolean;
};

type OpenAICompatChatCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
  }>;
};

type OpenAICompatErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

type OpenAICompatStreamChunk = {
  choices?: Array<{
    delta?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string | null;
  }>;
};

export const runtime = "nodejs";
// 兼容 `output: "export"`：静态导出时禁止动态评估该路由
export const dynamic = "force-static";

function safeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeChatMessages(input: {
  messages: ChatMessage[];
  maxMessages: number;
  maxCharsPerMessage: number;
  maxTotalChars: number;
}) {
  const safeMaxMessages = Math.max(1, input.maxMessages);
  const safeMaxCharsPerMessage = Math.max(50, input.maxCharsPerMessage);
  const safeMaxTotalChars = Math.max(safeMaxCharsPerMessage, input.maxTotalChars);

  const normalized = input.messages
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant" || m.role === "system"))
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, safeMaxCharsPerMessage),
    }))
    .filter((m) => m.content.trim().length > 0);

  const reversed = normalized.slice().reverse();
  const picked: ChatMessage[] = [];
  let total = 0;

  for (const m of reversed) {
    if (picked.length >= safeMaxMessages) break;
    const contentLen = m.content.length;
    if (picked.length > 0 && total + contentLen > safeMaxTotalChars) break;
    picked.push(m);
    total += contentLen;
  }

  picked.reverse();

  const hasUser = picked.some((m) => m.role === "user");
  if (!hasUser) {
    const lastUser = reversed.find((m) => m.role === "user");
    if (lastUser) return [lastUser];
  }

  return picked.length > 0 ? picked : normalized.slice(-1);
}

function buildMockReply(input: { lastUserText: string; mode?: string }) {
  const topic = input.lastUserText.trim();
  const prefix = input.mode ? `（mock:${input.mode}）` : "（mock）";
  if (!topic) return `${prefix} 请先输入一个问题或想法。`;

  return [
    `${prefix} 我收到了你的输入：${topic}`,
    "",
    "为了先把“前端 → 后端 → 返回”链路跑通，我先给出一个示例式回应：",
    "- 先澄清：你最在意的目标是什么？（稳定/成长/自由/关系/健康）",
    "- 你最担心的风险是什么？",
    "- 你愿意为这个选择付出的代价上限是什么？",
    "",
    "你可以回复：1) 目标 2) 风险 3) 代价上限，我再继续。",
  ].join("\n");
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function getRateLimitKey(req: Request) {
  const ip = getClientIp(req);
  if (ip !== "unknown") return `ip:${ip}`;
  const ua = (req.headers.get("user-agent") ?? "unknown").slice(0, 200);
  const al = (req.headers.get("accept-language") ?? "unknown").slice(0, 100);
  return `ua:${ua}|al:${al}`;
}

function toInt(value: string | undefined, fallback: number) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function rateLimitOrNull(key: string) {
  const max = toInt(process.env.PS2_RATE_LIMIT_MAX, 30);
  if (max <= 0) return null;
  const windowMs = toInt(process.env.PS2_RATE_LIMIT_WINDOW_MS, 60_000);
  const now = Date.now();

  const store = ((globalThis as unknown as { __ps2RateLimit?: Map<string, { count: number; resetAt: number }> })
    .__ps2RateLimit ??= new Map());

  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (entry.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { retryAfterSeconds };
  }

  entry.count += 1;
  return null;
}

function providerCooldownOrNull(key: string) {
  const now = Date.now();
  const store = ((globalThis as unknown as { __ps2ProviderCooldown?: Map<string, { until: number }> })
    .__ps2ProviderCooldown ??= new Map());

  const entry = store.get(key);
  if (!entry) return null;
  if (entry.until <= now) {
    store.delete(key);
    return null;
  }
  return { retryAfterSeconds: Math.max(1, Math.ceil((entry.until - now) / 1000)) };
}

function setProviderCooldown(key: string, retryAfterSeconds: number) {
  const ms = Math.max(1000, retryAfterSeconds * 1000);
  const store = ((globalThis as unknown as { __ps2ProviderCooldown?: Map<string, { until: number }> })
    .__ps2ProviderCooldown ??= new Map());
  store.set(key, { until: Date.now() + ms });
}

function buildDeepSeekUrlCandidates(url: string) {
  const trimmed = url.trim();
  if (trimmed.length === 0) return ["https://api.deepseek.com/chat/completions", "https://api.deepseek.com/v1/chat/completions"];

  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/+$/, "");
    const hasV1 = path.startsWith("/v1/");

    const withV1 = new URL(u.toString());
    withV1.pathname = hasV1 ? path : `/v1${path.startsWith("/") ? "" : "/"}${path}`;

    const withoutV1 = new URL(u.toString());
    if (hasV1) {
      withoutV1.pathname = path.replace(/^\/v1\//, "/");
    }

    const list = hasV1 ? [u.toString(), withoutV1.toString()] : [u.toString(), withV1.toString()];
    return Array.from(new Set(list));
  } catch {
    return [trimmed];
  }
}

function deriveVivoAppId(apiKey: string) {
  const envAppId = process.env.VIVO_APP_ID?.trim();
  if (envAppId) return envAppId;
  const key = apiKey.trim();
  if (key.includes(".")) return key.split(".")[0]?.trim() || "";
  if (key.includes(":")) return key.split(":")[0]?.trim() || "";
  return "";
}

function buildProviderRequestOptions(input: { url: string; apiKey: string }) {
  const target = new URL(input.url);
  const isVivo = /api-ai\.vivo\.com\.cn/i.test(target.hostname);
  if (isVivo && !target.searchParams.has("request_id")) {
    target.searchParams.set("request_id", randomUUID());
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${input.apiKey}`,
    "content-type": "application/json",
  };
  if (isVivo) {
    const appId = deriveVivoAppId(input.apiKey);
    if (appId) headers.app_id = appId;
  }

  return { url: target.toString(), headers };
}

async function callDeepSeekChat(input: {
  apiKey: string;
  url: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
}) {
  const urlCandidates = buildDeepSeekUrlCandidates(input.url);
  let lastError: unknown = null;

  for (const url of urlCandidates) {
    try {
      const providerReq = buildProviderRequestOptions({ url, apiKey: input.apiKey });
      const res = await fetch(providerReq.url, {
        method: "POST",
        headers: providerReq.headers,
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          max_tokens: input.maxTokens,
          stream: false,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const snippet = text.trim().slice(0, 400);
        let parsedCode: string | undefined = undefined;
        try {
          const parsed = JSON.parse(text) as OpenAICompatErrorResponse;
          const code = parsed.error?.code;
          if (typeof code === "string" && code.length > 0) parsedCode = code;
        } catch {}

        const codePart = parsedCode ? ` code=${parsedCode}` : "";
        const err = new Error(
          snippet.length > 0
            ? `DeepSeek HTTP ${res.status}${codePart}: ${snippet}`
            : `DeepSeek HTTP ${res.status}${codePart}`,
        );
        (err as unknown as { status?: number }).status = res.status;
        (err as unknown as { triedUrl?: string }).triedUrl = url;
        const retryAfter = res.headers.get("retry-after") ?? undefined;
        const retryAfterSeconds = toInt(retryAfter, 0);
        if (retryAfterSeconds > 0) {
          (err as unknown as { retryAfterSeconds?: number }).retryAfterSeconds = retryAfterSeconds;
        }
        throw err;
      }

      const data = (await res.json()) as OpenAICompatChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        const err = new Error("DeepSeek invalid response");
        (err as unknown as { triedUrl?: string }).triedUrl = url;
        throw err;
      }
      return content;
    } catch (err) {
      lastError = err;
      const status = err instanceof Error ? (err as unknown as { status?: number }).status : undefined;
      if (status && status !== 404 && status !== 405) break;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("DeepSeek request failed"));
}

async function callDeepSeekChatStream(input: {
  apiKey: string;
  url: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  onToken: (token: string) => void;
}) {
  const urlCandidates = buildDeepSeekUrlCandidates(input.url);
  let lastError: unknown = null;

  for (const url of urlCandidates) {
    try {
      const providerReq = buildProviderRequestOptions({ url, apiKey: input.apiKey });
      const res = await fetch(providerReq.url, {
        method: "POST",
        headers: providerReq.headers,
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          max_tokens: input.maxTokens,
          stream: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const snippet = text.trim().slice(0, 400);
        let parsedCode: string | undefined = undefined;
        try {
          const parsed = JSON.parse(text) as OpenAICompatErrorResponse;
          const code = parsed.error?.code;
          if (typeof code === "string" && code.length > 0) parsedCode = code;
        } catch {}

        const codePart = parsedCode ? ` code=${parsedCode}` : "";
        const err = new Error(
          snippet.length > 0
            ? `DeepSeek HTTP ${res.status}${codePart}: ${snippet}`
            : `DeepSeek HTTP ${res.status}${codePart}`,
        );
        (err as unknown as { status?: number }).status = res.status;
        (err as unknown as { triedUrl?: string }).triedUrl = url;
        const retryAfter = res.headers.get("retry-after") ?? undefined;
        const retryAfterSeconds = toInt(retryAfter, 0);
        if (retryAfterSeconds > 0) {
          (err as unknown as { retryAfterSeconds?: number }).retryAfterSeconds = retryAfterSeconds;
        }
        throw err;
      }

      const body = res.body;
      if (!body) {
        const err = new Error("DeepSeek stream missing response body");
        (err as unknown as { triedUrl?: string }).triedUrl = url;
        throw err;
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === "[DONE]") {
            return;
          }

          try {
            const chunk = JSON.parse(payload) as OpenAICompatStreamChunk;
            const token = chunk.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token.length > 0) {
              input.onToken(token);
            }
          } catch {
            // 忽略无法解析的行，继续读取后续 token
          }
        }
      }

      if (buffer.trim().startsWith("data:")) {
        const payload = buffer.trim().slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            const chunk = JSON.parse(payload) as OpenAICompatStreamChunk;
            const token = chunk.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token.length > 0) {
              input.onToken(token);
            }
          } catch {
            // ignore trailing line
          }
        }
      }

      return;
    } catch (err) {
      lastError = err;
      const status = err instanceof Error ? (err as unknown as { status?: number }).status : undefined;
      if (status && status !== 404 && status !== 405) break;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("DeepSeek stream request failed"));
}

function toSseData(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function streamTextInChunks(input: { text: string; onChunk: (chunk: string) => void }) {
  const chars = Array.from(input.text);
  const chunkSize = 24;
  for (let i = 0; i < chars.length; i += chunkSize) {
    const chunk = chars.slice(i, i + chunkSize).join("");
    if (chunk.length > 0) input.onChunk(chunk);
  }
}

function parseMentorMode(mode?: string) {
  if (!mode || !mode.startsWith("mentor:")) return null;
  const mentorId = mode.slice("mentor:".length).trim();
  if (!mentorId) return null;
  return { mentorId };
}

function buildMessagesForMode(input: { mode?: string; messages: ChatMessage[] }) {
  const mentorMode = parseMentorMode(input.mode);
  if (!mentorMode) return input.messages;
  const profile = getMentorPromptProfile(mentorMode.mentorId);
  if (!profile) return input.messages;
  const systemPrompt: ChatMessage = {
    role: "system",
    content: buildMentorSystemPrompt(profile),
  };
  return [systemPrompt, ...input.messages];
}

function extractSuggestionCards(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const cards = lines
    .filter((l) => l.startsWith("- ") || l.startsWith("• "))
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  if (cards.length > 0) return cards.slice(0, 3);

  const sentences = text
    .split(/[。！？!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
  return sentences.slice(0, 3);
}

export async function POST(req: Request) {
  const demoToken = process.env.PS2_DEMO_TOKEN;
  if (demoToken && req.headers.get("x-ps2-token") !== demoToken) {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    applyCorsHeaders(req, res.headers);
    return res;
  }

  const key = getRateLimitKey(req);
  const cooldown = providerCooldownOrNull(key);
  if (cooldown) {
    const strict = process.env.PS2_STRICT_PROVIDER_429 === "1";
    if (strict) {
      const res = NextResponse.json(
        { error: "Provider rate limited" },
        { status: 429, headers: { "retry-after": `${cooldown.retryAfterSeconds}` } },
      );
      applyCorsHeaders(req, res.headers);
      return res;
    }

    const res = NextResponse.json(
      {
        message: {
          role: "assistant",
          content: `（提示）上游接口刚触发限流，已进入冷却期，请 ${cooldown.retryAfterSeconds} 秒后再试。`,
        },
      },
      { status: 200 },
    );
    applyCorsHeaders(req, res.headers);
    return res;
  }

  const limited = rateLimitOrNull(key);
  if (limited) {
    const strictLocal = process.env.PS2_STRICT_LOCAL_429 === "1";
    if (strictLocal) {
      const res = NextResponse.json(
        { error: "Too Many Requests" },
        { status: 429, headers: { "retry-after": `${limited.retryAfterSeconds}` } },
      );
      applyCorsHeaders(req, res.headers);
      return res;
    }

    const res = NextResponse.json(
      {
        message: {
          role: "assistant",
          content: `（提示）请求过于频繁，请 ${limited.retryAfterSeconds} 秒后再试。`,
        },
      },
      { status: 200 },
    );
    applyCorsHeaders(req, res.headers);
    return res;
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    const res = NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    applyCorsHeaders(req, res.headers);
    return res;
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const maxMessages = toInt(process.env.PS2_CHAT_MAX_MESSAGES, 12);
  const maxCharsPerMessage = toInt(process.env.PS2_CHAT_MAX_CHARS_PER_MESSAGE, 1200);
  const maxTotalChars = toInt(process.env.PS2_CHAT_MAX_TOTAL_CHARS, 6000);
  const messages = normalizeChatMessages({
    messages: rawMessages as ChatMessage[],
    maxMessages,
    maxCharsPerMessage,
    maxTotalChars,
  });
  const finalMessages = buildMessagesForMode({ mode: body.mode, messages });

  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const url = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions";
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const debugEnabled = process.env.PS2_DEBUG === "1";
  const maxTokens = toInt(process.env.PS2_MAX_TOKENS, 256);

  const wantsStream = body.stream === true;
  let content: string;

  if (wantsStream) {
    const encoder = new TextEncoder();
    const res = new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          const push = (payload: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(toSseData(payload)));
          };

          push({ type: "start", id: safeId(), createdAt: new Date().toISOString() });

          const pushText = (text: string) => {
            streamTextInChunks({
              text,
              onChunk: (chunk) => push({ type: "token", token: chunk }),
            });
          };
          let fullText = "";

          if (apiKey) {
            try {
              await callDeepSeekChatStream({
                apiKey,
                url,
                model,
                messages: finalMessages,
                maxTokens,
                onToken: (token) => {
                  fullText += token;
                  push({ type: "token", token });
                },
              });
              const cards = extractSuggestionCards(fullText);
              push({ type: "meta", cards });
              push({ type: "done" });
              controller.close();
              return;
            } catch (err) {
              const status = err instanceof Error ? (err as unknown as { status?: number }).status : undefined;
              if (status === 429) {
                const retryAfterSeconds = err instanceof Error ? (err as unknown as { retryAfterSeconds?: number }).retryAfterSeconds : undefined;
                const fallbackSeconds = toInt(process.env.PS2_PROVIDER_COOLDOWN_SECONDS, 15);
                const seconds = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : fallbackSeconds;
                setProviderCooldown(key, seconds);
                const errMsg = err instanceof Error ? err.message : String(err);
                const strict = process.env.PS2_STRICT_PROVIDER_429 === "1";
                if (strict) {
                  push({ type: "error", message: debugEnabled ? errMsg : "Provider rate limited", retryAfter: seconds });
                  controller.close();
                  return;
                }

                const baseMock = buildMockReply({ lastUserText: lastUser?.content ?? "", mode: body.mode });
                const fallbackText = debugEnabled
                  ? `（deepseek_rate_limited）${errMsg}\n\n${baseMock}`
                  : `（提示）DeepSeek 限流中，已使用 mock 输出。\n\n${baseMock}`;
                pushText(fallbackText);
                push({ type: "meta", cards: extractSuggestionCards(fallbackText) });
                push({ type: "done" });
                controller.close();
                return;
              }

              const baseMock = buildMockReply({ lastUserText: lastUser?.content ?? "", mode: body.mode });
              const errMsg = err instanceof Error ? err.message : String(err);
              const fallbackText = debugEnabled ? `（deepseek_error）${errMsg}\n\n${baseMock}` : baseMock;
              pushText(fallbackText);
              push({ type: "meta", cards: extractSuggestionCards(fallbackText) });
              push({ type: "done" });
              controller.close();
              return;
            }
          }

          const baseMock = buildMockReply({ lastUserText: lastUser?.content ?? "", mode: body.mode });
          const fallbackText = debugEnabled
            ? `（config_error）DEEPSEEK_API_KEY 未配置或未生效（需要重启 dev server）\n\n${baseMock}`
            : baseMock;
          pushText(fallbackText);
          push({ type: "meta", cards: extractSuggestionCards(fallbackText) });
          push({ type: "done" });
          controller.close();
        },
      }),
      {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      },
    );
    applyCorsHeaders(req, res.headers);
    return res;
  }

  if (apiKey) {
    try {
      content = await callDeepSeekChat({ apiKey, url, model, messages: finalMessages, maxTokens });
    } catch (err) {
      const status = err instanceof Error ? (err as unknown as { status?: number }).status : undefined;
      if (status === 429) {
        const retryAfterSeconds = err instanceof Error ? (err as unknown as { retryAfterSeconds?: number }).retryAfterSeconds : undefined;
        const fallbackSeconds = toInt(process.env.PS2_PROVIDER_COOLDOWN_SECONDS, 15);
        const seconds = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : fallbackSeconds;
        setProviderCooldown(key, seconds);
        const errMsg = err instanceof Error ? err.message : String(err);
        const strict = process.env.PS2_STRICT_PROVIDER_429 === "1";
        if (strict) {
          const res = NextResponse.json(
            { error: debugEnabled ? errMsg : "Provider rate limited" },
            { status: 429, headers: { "retry-after": `${seconds}` } },
          );
          applyCorsHeaders(req, res.headers);
          return res;
        }

        const baseMock = buildMockReply({ lastUserText: lastUser?.content ?? "", mode: body.mode });
        content = debugEnabled ? `（deepseek_rate_limited）${errMsg}\n\n${baseMock}` : `（提示）DeepSeek 限流中，已使用 mock 输出。\n\n${baseMock}`;
      } else {
        const baseMock = buildMockReply({ lastUserText: lastUser?.content ?? "", mode: body.mode });
        const errMsg = err instanceof Error ? err.message : String(err);
        content = debugEnabled ? `（deepseek_error）${errMsg}\n\n${baseMock}` : baseMock;
      }
    }
  } else {
    const baseMock = buildMockReply({ lastUserText: lastUser?.content ?? "", mode: body.mode });
    content = debugEnabled ? `（config_error）DEEPSEEK_API_KEY 未配置或未生效（需要重启 dev server）\n\n${baseMock}` : baseMock;
  }

  const out = NextResponse.json({
    id: safeId(),
    message: { role: "assistant", content },
    cards: extractSuggestionCards(content),
    createdAt: new Date().toISOString(),
  });
  applyCorsHeaders(req, out.headers);
  return out;
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
