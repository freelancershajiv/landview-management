import { NextRequest, NextResponse } from "next/server";
import { processRecurringTodoTemplates } from "@/lib/todo-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function authorized(request: NextRequest) {
  const secret = text(process.env.CRON_SECRET, 500);
  const auth = text(request.headers.get("authorization"), 600);
  return Boolean(secret && auth === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return json({ success: false, error: "Unauthorized." }, 401);
  const startedAt = new Date().toISOString();
  try {
    const result = await processRecurringTodoTemplates(25);
    return json({ success: true, data: { startedAt, finishedAt: new Date().toISOString(), ...result } });
  } catch (error) {
    return json({ success: false, error: text(error instanceof Error ? error.message : error, 1000), startedAt }, 500);
  }
}
