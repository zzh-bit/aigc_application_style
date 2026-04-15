import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set<string>([
  "https://appassets.androidplatform.net",
  "http://appassets.androidplatform.net",
]);

function pickAllowOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) {
    // WebView 某些请求可能缺失 Origin；此时放宽到 * 避免误拦截。
    return "*";
  }
  const normalized = origin.trim().replace(/\/$/, "");
  if (ALLOWED_ORIGINS.has(normalized)) return normalized;
  // 调试期允许反射当前 Origin，避免跨域预检误拦截导致“网络失败”。
  return normalized;
}

export function applyCorsHeaders(req: Request, headers: Headers): void {
  const allowOrigin = pickAllowOrigin(req);
  if (!allowOrigin) return;

  headers.set("access-control-allow-origin", allowOrigin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type, Authorization");
}

export function applyCors(req: Request, res: NextResponse): NextResponse {
  applyCorsHeaders(req, res.headers);
  return res;
}

export function corsPreflight(req: Request): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  return applyCors(req, res);
}

