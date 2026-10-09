import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { getMediaQueueStats, retryMediaJob } from "@/lib/site-visit-media-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

async function requireManagement(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required.");
  return { user, role };
}

export async function GET(request: NextRequest) {
  try {
    await requireManagement(request);
    const data = await getMediaQueueStats();
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error: any) {
    const message = clean(error?.message || "Could not load Site Visit media queue.", 1000);
    const status = /session expired/i.test(message) ? 401 : /Admin or Manager/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { role } = await requireManagement(request);
    if (role !== "admin") return NextResponse.json({ success: false, error: "Admin access is required to retry media jobs." }, { status: 403 });
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.nextUrl.host) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Row | null;
    const jobId = clean(body?.jobId, 80);
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ success: false, error: "Invalid media job ID." }, { status: 400 });
    const data = await retryMediaJob(jobId);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const message = clean(error?.message || "Could not retry Site Visit media job.", 1000);
    const status = /session expired/i.test(message) ? 401 : /Admin access|required/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
