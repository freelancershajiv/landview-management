import { NextRequest, NextResponse } from "next/server";
import { processTodoAutomations } from "@/lib/todo-automation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function authorized(request: NextRequest) {
  const secret = text(process.env.CRON_SECRET, 500);
  const auth = text(request.headers.get("authorization"), 600);
  return Boolean(secret && auth === "Bearer " + secret);
}
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
export async function GET(request: NextRequest) {
  if (!authorized(request)) return json({ success: false, error: "Unauthorized." }, 401);
  const startedAt = new Date().toISOString();
  try {
    const result = await processTodoAutomations(25);
    return json({ success: true, data: { startedAt, finishedAt: new Date().toISOString(), ...result } });
  } catch (error) {
    return json({ success: false, error: text(error instanceof Error ? error.message : error), startedAt }, 500);
  }
}
