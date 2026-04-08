import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set<string>([
  "https://appassets.androidplatform.net",
]);

function pickAllowOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
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

