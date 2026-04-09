import { NextResponse } from "next/server";
import { applyCorsHeaders, corsPreflight } from "@/app/api/_cors";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET(req: Request) {
  const res = NextResponse.json(
    {
      ok: true,
      service: "ps2-api",
      now: new Date().toISOString(),
    },
    { status: 200 },
  );
  applyCorsHeaders(req, res.headers);
  return res;
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
