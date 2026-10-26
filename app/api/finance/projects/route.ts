import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { employeeCodeOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const WRITE_ROLES = new Set(["admin", "manager", "accounts"]);
const READ_ROLES = new Set(["admin", "manager", "accounts", "employee"]);

function text(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function actorOf(user: Row) {
  return employeeCodeOf(user) || text(user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW";
}
async function session(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (write ? !WRITE_ROLES.has(role) : !READ_ROLES.has(role)) throw new Error("Finance project access is not available for this role.");
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await session(request, false);
    const rows = await selectRows("projects", { order: "project_code:desc", limit: 5000 });
    const projects = rows.map((project) => ({
      id: project.id,
      projectId: text(project.project_code, 80),
      projectName: text(project.project_name, 300),
      clientName: text(project.client_name_snapshot, 300),
      phone: text(project.phone_number_snapshot, 100),
      location: text(project.location, 500),
      lifecyclePhase: text(project.lifecycle_phase, 100),
      financeClosed: Boolean(project.finance_closed),
      financeClosedAt: project.finance_closed_at || null,
      financeClosedBy: text(project.finance_closed_by, 160),
    })).filter((project) => project.projectId);
    return json({ success: true, data: { projects } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Finance projects.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await session(request, true);
    const body = await request.json() as Row;
    const projectId = text(body.projectId || body.Project_ID, 80).toUpperCase();
    const action = text(body.action, 40).toLowerCase();
    if (!projectId) throw new Error("Project ID is required.");
    if (!new Set(["close", "reopen"]).has(action)) throw new Error("Choose close or reopen.");

    const found = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!found.length) throw new Error(`Project ${projectId} was not found.`);
    const current = found[0];
    const closed = action === "close";
    if (Boolean(current.finance_closed) === closed) {
      return json({ success: true, data: { projectId, financeClosed: closed, unchanged: true } });
    }

    const now = new Date().toISOString();
    const actor = actorOf(user);
    const changes = {
      finance_closed: closed,
      finance_closed_at: closed ? now : null,
      finance_closed_by: closed ? actor : null,
      updated_at: now,
    };
    const updated = await updateRows("projects", { project_code: projectId }, changes);
    await recordAuditEvent({
      user,
      request,
      action: closed ? "finance_project_closed" : "finance_project_reopened",
      entityType: "project",
      entityId: projectId,
      before: { finance_closed: Boolean(current.finance_closed), finance_closed_at: current.finance_closed_at || null, finance_closed_by: current.finance_closed_by || null },
      after: changes,
      details: { source: "finance-projects" },
      source: "finance-projects",
    });

    return json({ success: true, data: { project: updated[0] || { ...current, ...changes }, projectId, financeClosed: closed } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update Finance project state.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}
