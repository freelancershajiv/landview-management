import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import {
  getBillingV2Snapshot,
  issueBillingMilestone,
  markBillingMilestoneReady,
} from "@/lib/billing-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function actorOf(user: Row) {
  return employeeCodeOf(user) || text(user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW";
}

function decorated(snapshot: Row) {
  const contractClosed = text(snapshot?.contract?.status).toLowerCase() === "closed";
  const operationalComplete = text(snapshot?.project?.lifecyclePhase).toLowerCase() === "completed";
  return {
    ...snapshot,
    financialCloseStatus: contractClosed ? "Closed" : operationalComplete ? "Financially Open" : "Open",
  };
}

async function session(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  const allowed = write ? ["admin", "manager", "accounts"] : ["admin", "manager", "accounts", "employee"];
  if (!allowed.includes(role)) throw new Error(write ? "Billing management permission is required." : "Billing access is not available for this role.");
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await session(request, false);
    const mode = text(request.nextUrl.searchParams.get("mode"), 40).toLowerCase();
    if (mode === "projects") {
      const projects = await selectRows("projects", { order: "project_code:desc", limit: 5000 });
      return json({ success: true, data: { projects: projects.map((project: Row) => ({
        projectId: text(project.project_code, 80),
        ownerName: project.client_name_snapshot || project.project_name || "",
        projectName: project.project_name || project.project_code || "",
        lifecyclePhase: project.lifecycle_phase || "",
        location: project.location || "",
      })).filter((project: Row) => project.projectId) } });
    }

    const projectId = text(request.nextUrl.searchParams.get("projectId"), 80).toUpperCase();
    if (!projectId) throw new Error("Project ID is required.");
    const snapshot = await getBillingV2Snapshot(projectId, actorOf(user));
    return json({ success: true, data: decorated(snapshot) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Billing 2.0 workspace.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|access|role/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await session(request, true);
    const body = await request.json() as Row;
    const action = text(body.action, 80).toLowerCase();
    const projectId = text(body.projectId || body.Project_ID, 80).toUpperCase();
    const milestoneId = text(body.milestoneId, 120);
    if (!projectId) throw new Error("Project ID is required.");
    if (!["issuemilestone", "markmilestoneready", "refresh", "closecontract"].includes(action)) throw new Error("Unsupported Billing 2.0 action.");

    if (action === "issuemilestone") {
      if (!milestoneId) throw new Error("Billing milestone is required.");
      await issueBillingMilestone(milestoneId, actorOf(user));
    } else if (action === "markmilestoneready") {
      if (!milestoneId) throw new Error("Billing milestone is required.");
      await markBillingMilestoneReady(milestoneId, actorOf(user));
    } else if (action === "closecontract") {
      const current = await getBillingV2Snapshot(projectId, actorOf(user));
      if (text(current.project?.lifecyclePhase).toLowerCase() !== "completed") {
        throw new Error("Complete the operational project before financial close.");
      }
      if (Number(current.totals?.due || 0) > 0.01) throw new Error("Financial close is blocked while a current due balance remains.");
      if (Number(current.totals?.unbilled || 0) > 0.01) throw new Error("Financial close is blocked while contract value remains unbilled.");
      if (Number(current.totals?.readyToBill || 0) > 0.01) throw new Error("Financial close is blocked while billing milestones are ready to issue.");
      const timestamp = new Date().toISOString();
      await updateRows("project_contracts", { id: current.contract.id }, { status: "Closed", updated_at: timestamp });
      try {
        await insertRows("billing_events", {
          project_id: current.project.id,
          project_code: projectId,
          contract_id: current.contract.id,
          event_type: "financial_close",
          event_key: `financial-close:${current.contract.id}`,
          amount: Number(current.totals?.contract || 0),
          actor: actorOf(user),
          details: { billed: current.totals?.billed || 0, paid: current.totals?.paid || 0, due: 0, unbilled: 0 },
          created_at: timestamp,
        });
      } catch (eventError) {
        const message = eventError instanceof Error ? eventError.message.toLowerCase() : String(eventError).toLowerCase();
        if (!/duplicate|unique/.test(message)) throw eventError;
      }
    }

    return json({ success: true, data: decorated(await getBillingV2Snapshot(projectId, actorOf(user))) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing 2.0 action failed.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|access|role/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}