import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf } from "@/lib/supabase-data";
import { callOutsourcing } from "@/lib/outsourcing-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTSOURCING_RESET_AT = "2026-10-28T00:10:43+06:00";
const OUTSOURCING_RESET_MS = Date.parse(OUTSOURCING_RESET_AT);

type Row = Record<string, unknown>;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function createdAfterReset(row: Row) {
  const raw = text(row.created_at, 80);
  const ms = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(ms) && ms >= OUTSOURCING_RESET_MS;
}

function isVoided(row: Row) {
  return text(row.status, 40).toUpperCase() === "VOID";
}

function isCancelled(row: Row) {
  return text(row.status, 40).toLowerCase() === "cancelled";
}

function freshSnapshot(input: unknown) {
  const data = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const rawJobs = Array.isArray(data.jobs) ? data.jobs as Row[] : [];
  const rawPayments = Array.isArray(data.payments) ? data.payments as Row[] : [];
  const rawParties = Array.isArray(data.parties) ? data.parties as Row[] : [];

  const resetJobs = rawJobs.filter(createdAfterReset);
  const jobIds = new Set(resetJobs.map((job) => text(job.id, 100)).filter(Boolean));
  const resetPayments = rawPayments.filter((payment) => jobIds.has(text(payment.job_id, 100)) && createdAfterReset(payment));

  const paidByJob = new Map<string, number>();
  for (const payment of resetPayments) {
    if (isVoided(payment)) continue;
    const jobId = text(payment.job_id, 100);
    paidByJob.set(jobId, (paidByJob.get(jobId) || 0) + num(payment.amount));
  }

  const jobs: Row[] = resetJobs.map((job): Row => {
    const paid = paidByJob.get(text(job.id, 100)) || 0;
    const agreed = num(job.agreed_amount);
    const due = isCancelled(job) ? 0 : Math.max(0, agreed - paid);
    return { ...job, paid_amount: paid, due_amount: due };
  });

  const parties: Row[] = rawParties.filter(createdAfterReset).map((party): Row => {
    const partyJobs = jobs.filter((job) => text(job.party_id, 100) === text(party.id, 100));
    const effective = partyJobs.filter((job) => !isCancelled(job));
    const agreed = effective.reduce((sum, job) => sum + num(job.agreed_amount), 0);
    const paid = partyJobs.reduce((sum, job) => sum + num(job.paid_amount), 0);
    const due = effective.reduce((sum, job) => sum + num(job.due_amount), 0);
    const activeJobs = effective.filter((job) => text(job.status, 40).toLowerCase() !== "completed").length;
    return { ...party, agreed_amount: agreed, paid_amount: paid, due_amount: due, active_jobs: activeJobs };
  });

  const effectiveJobs: Row[] = jobs.filter((job) => !isCancelled(job));
  return {
    ...data,
    resetAt: OUTSOURCING_RESET_AT,
    summary: {
      agreed: effectiveJobs.reduce((sum, job) => sum + num(job.agreed_amount), 0),
      paid: resetPayments.filter((payment) => !isVoided(payment)).reduce((sum, payment) => sum + num(payment.amount), 0),
      due: effectiveJobs.reduce((sum, job) => sum + num(job.due_amount), 0),
      activeJobs: effectiveJobs.filter((job) => text(job.status, 40).toLowerCase() !== "completed").length,
      parties: parties.filter((party) => party.active !== false).length,
    },
    parties,
    jobs,
    payments: resetPayments,
  };
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function actorOf(user: Row) {
  return text(
    user.User_ID || user.userId || user.Employee_ID || user.employeeId || user.username || user.Username || "LAND VIEW",
    160,
  );
}

async function requireOutsourcingUser(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  const allowed = write ? ["admin", "manager"] : ["admin", "manager", "accounts", "employee"];
  if (!allowed.includes(role)) throw new Error(write ? "Admin or Manager access is required." : "Finance access is required.");
  return user;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Outsourcing request failed.";
  const upstream = Number((error as Error & { status?: number })?.status || 0);
  const status = /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : upstream >= 400 && upstream < 500 ? upstream : 502;
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireOutsourcingUser(request, false);
    const data = freshSnapshot(await callOutsourcing({ action: "snapshot" }));
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase-outsourcing", "X-Landview-Outsourcing-Reset": OUTSOURCING_RESET_AT } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }
    const user = await requireOutsourcingUser(request, true);
    const body = await request.json() as Row;
    const action = text(body.action, 80);
    if (!action || action === "snapshot") {
      return NextResponse.json({ success: false, error: "A valid outsourcing action is required." }, { status: 400 });
    }
    if (action === "addJob" && !text(body.projectCode, 80)) {
      return NextResponse.json({ success: false, error: "Outsourcing work must be added from a project. Choose a project first." }, { status: 400 });
    }
    const data = await callOutsourcing({ ...body, action, actor: actorOf(user) });
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase-outsourcing" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
