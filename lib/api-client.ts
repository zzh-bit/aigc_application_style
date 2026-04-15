import { logApiFailure } from "@/lib/client-log";

/** 须与 Android `ps2-shell` 中 `BuildConfig.PS2_LOOPBACK_PROXY_PORT` 一致 */
const PS2_LOOPBACK_PROXY_PORT = 37123;

/**
 * APK WebView 离线资源域名下，经本机回环代理访问 API（原生层用固定 IP 连 HTTPS，绕过错误 DNS）。
 */
function webViewLoopbackApiBase(): string | null {
  if (typeof window === "undefined") return null;
  try {
    if (window.location.hostname === "appassets.androidplatform.net") {
      return `http://127.0.0.1:${PS2_LOOPBACK_PROXY_PORT}`;
    }
  } catch {
    return null;
  }
  return null;
}

function effectiveApiBase(): string {
  const loopback = webViewLoopbackApiBase();
  if (loopback) return loopback;
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

export type ApiErrorCode =
  | "timeout"
  | "network"
  | "aborted"
  | "rate_limited"
  | "http_error"
  | "invalid_json"
  | "unexpected";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(message: string, code: ApiErrorCode, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  // Route 2: 前端始终用“独立后端”承接 `/api/*`，避免 `next export` + WebView 离线打开时 404。
  // WebView 壳内优先走 127.0.0.1 回环代理（见 ApiLoopbackProxy）；否则用 NEXT_PUBLIC_API_BASE_URL。
  const base = effectiveApiBase();
  if (!base) return input;

  if (typeof input === "string") {
    // 仅对相对的 API 路径做前缀拼接；绝对 URL 不动。
    if (input.startsWith("/api/") || input === "/api") {
      return `${base}${input}`;
    }
    return input;
  }

  // 对 URL 对象：若是相对同源 URL 且 path 为 /api，则用 base 替换 origin。
  if (input instanceof URL) {
    if (input.pathname === "/api" || input.pathname.startsWith("/api/")) {
      return new URL(`${base}${input.pathname}${input.search}${input.hash}`);
    }
    return input;
  }

  // Request 对象等：保持原样（调用方通常不会传 Request 进来；即使传了也不强行改写）。
  return input;
}

function isLikelyHttpBase(base: string): boolean {
  return /^http:\/\//i.test(base);
}

function isLikelyEmulatorOnlyHost(base: string): boolean {
  return /:\/\/10\.0\.2\.2(?::|\/|$)/.test(base);
}

export function userFacingMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "timeout":
        return "请求超时，请检查网络后重试。";
      case "network":
        return "网络连接失败。请检查 API 地址、CORS 与 HTTPS/明文网络策略后重试。";
      case "aborted":
        return "请求已取消。";
      case "rate_limited":
        return "请求过于频繁（429），请稍后再试。";
      case "invalid_json":
        return "服务器返回格式异常，请稍后重试。";
      case "http_error":
        return err.status === 503 || err.status === 502
          ? "服务暂时不可用，请稍后重试。"
          : `请求失败${err.status ? `（${err.status}）` : ""}，请稍后重试。`;
      default:
        return err.message || "请求失败，请稍后重试。";
    }
  }
  if (err instanceof Error) return err.message || "发生错误，请稍后重试。";
  return "发生未知错误，请稍后重试。";
}

function normalizeFetchError(e: unknown, scope: string): never {
  if (e instanceof ApiError) {
    logApiFailure(scope, e, { code: e.code, status: e.status });
    throw e;
  }
  if (e instanceof DOMException && e.name === "AbortError") {
    const err = new ApiError("请求超时或已中断", "timeout");
    logApiFailure(scope, err);
    throw err;
  }
  if (e instanceof TypeError) {
    const raw = e.message || "网络错误";
    const err = new ApiError(raw, "network");
    logApiFailure(scope, err);
    throw err;
  }
  const err = new ApiError(String(e), "unexpected");
  logApiFailure(scope, err);
  throw err;
}

export type FetchJsonOptions = RequestInit & {
  timeoutMs?: number;
  /** 与内置超时合并：任一方 abort 都会中断请求 */
  externalSignal?: AbortSignal;
};

/**
 * JSON API：统一超时、HTTP 状态、429、非 JSON 与解析失败处理。
 */
export async function fetchJson<T>(input: RequestInfo | URL, options?: FetchJsonOptions): Promise<T> {
  const { timeoutMs = 45_000, externalSignal, ...init } = options ?? {};
  const resolved = resolveApiUrl(input);
  const base = effectiveApiBase();
  if (webViewLoopbackApiBase()) {
    console.info("[ps2] fetchJson using WebView loopback API proxy (127.0.0.1)");
  } else if (base) {
    if (isLikelyEmulatorOnlyHost(base)) {
      console.warn("[ps2] NEXT_PUBLIC_API_BASE_URL 使用了 10.0.2.2。该地址仅模拟器可用，真机会失败。");
    }
    if (isLikelyHttpBase(base)) {
      console.warn("[ps2] NEXT_PUBLIC_API_BASE_URL 使用 HTTP。若真机失败，请改 HTTPS 或配置 Android networkSecurityConfig。");
    }
  }
  console.info("[ps2] fetchJson resolved url:", String(resolved));
  const scope = typeof resolved === "string" ? resolved : typeof input === "string" ? input : "fetchJson";
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => {
    try {
      controller.abort();
    } catch {
      /* noop */
    }
  };
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }

  try {
    const res = await fetch(resolved, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 429) {
      throw new ApiError("Too Many Requests", "rate_limited", 429);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new ApiError(text.trim().slice(0, 280) || `HTTP ${res.status}`, "http_error", res.status);
      logApiFailure(scope, err, { status: res.status });
      throw err;
    }

    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const looksJson = ct.includes("json") || /^\s*[\[{]/.test(raw);
    if (!looksJson && raw.trim().length > 0) {
      const err = new ApiError("响应不是 JSON", "invalid_json", res.status);
      logApiFailure(scope, err, { contentType: ct });
      throw err;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      const err = new ApiError("JSON 解析失败", "invalid_json", res.status);
      logApiFailure(scope, err, { snippet: raw.slice(0, 120) });
      throw err;
    }
  } catch (e) {
    clearTimeout(timer);
    normalizeFetchError(e, scope);
  } finally {
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  /** 与超时合并：任一方 abort 都会终止请求（例如用户点击停止生成） */
  externalSignal?: AbortSignal;
};

/**
 * 流式或非 JSON 请求：统一超时与 HTTP/429 错误，成功返回 Response（body 由调用方读取）。
 */
export async function fetchWithTimeout(input: RequestInfo | URL, options?: FetchWithTimeoutOptions): Promise<Response> {
  const { timeoutMs = 120_000, externalSignal, ...init } = options ?? {};
  const resolved = resolveApiUrl(input);
  const base = effectiveApiBase();
  if (webViewLoopbackApiBase()) {
    console.info("[ps2] fetchWithTimeout using WebView loopback API proxy (127.0.0.1)");
  } else if (base) {
    if (isLikelyEmulatorOnlyHost(base)) {
      console.warn("[ps2] NEXT_PUBLIC_API_BASE_URL 使用了 10.0.2.2。该地址仅模拟器可用，真机会失败。");
    }
    if (isLikelyHttpBase(base)) {
      console.warn("[ps2] NEXT_PUBLIC_API_BASE_URL 使用 HTTP。若真机失败，请改 HTTPS 或配置 Android networkSecurityConfig。");
    }
  }
  console.info("[ps2] fetchWithTimeout resolved url:", String(resolved));
  const scope = typeof resolved === "string" ? resolved : typeof input === "string" ? input : "fetchWithTimeout";
  const inner = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    inner.abort();
  }, timeoutMs);
  const onExternalAbort = () => {
    clearTimeout(timer);
    inner.abort();
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      inner.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort);
    }
  }

  try {
    const res = await fetch(resolved, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      ...init,
      signal: inner.signal,
    });
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);

    if (res.status === 429) {
      throw new ApiError("Too Many Requests", "rate_limited", 429);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new ApiError(text.trim().slice(0, 280) || `HTTP ${res.status}`, "http_error", res.status);
      logApiFailure(scope, err, { status: res.status });
      throw err;
    }
    return res;
  } catch (e) {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
    if (e instanceof DOMException && e.name === "AbortError") {
      if (timedOut) {
        const err = new ApiError("请求超时", "timeout");
        logApiFailure(scope, err);
        throw err;
      }
      throw e;
    }
    normalizeFetchError(e, scope);
  }
}
