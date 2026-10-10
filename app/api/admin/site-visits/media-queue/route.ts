import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { getMediaQueueStats, retryMediaJob } from "@/lib/site-visit-media-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function validOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function runWorkerPass(request: NextRequest) {
  const token = clean(process.env.SITE_VISIT_MEDIA_SYNC_TOKEN, 1000);
  if (!token) throw new Error("Site Visit media sync token is not configured.");

  const url = new URL("/api/internal/site-visit-media-sync", request.nextUrl.origin);
  const response = await fetch(url, {
    method: "POST",
    headers: { "x-landview-media-sync-token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(55_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(clean(json?.error || `Media worker returned HTTP ${response.status}.`, 1000));
  }
  return json.data as Row;
}

async function processQueue(request: NextRequest) {
  // One queue item needs up to two passes: upload to R2, then delete the
  // temporary Supabase object and mark the job completed. A third pass lets
  // us confirm the queue is idle or immediately start the next due item.
  const passes: Row[] = [];
  for (let i = 0; i < 3; i += 1) {
    const result = await runWorkerPass(request);
    passes.push(result);
    if (String(result?.status || "") === "idle") break;
    if (String(result?.status || "") === "retry-scheduled") break;
  }
  return { passes, queue: await getMediaQueueStats() };
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
    if (role !== "admin") return NextResponse.json({ success: false, error: "Admin access is required to process or retry media jobs." }, { status: 403 });
    if (!validOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Row | null;
    const action = clean(body?.action, 40).toLowerCase();

    if (action === "process") {
      const data = await processQueue(request);
      return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
    }

    const jobId = clean(body?.jobId, 80);
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ success: false, error: "Invalid media job ID." }, { status: 400 });
    const data = await retryMediaJob(jobId);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const message = clean(error?.message || "Could not process Site Visit media queue.", 1000);
    const status = /session expired/i.test(message) ? 401 : /Admin access|required/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
