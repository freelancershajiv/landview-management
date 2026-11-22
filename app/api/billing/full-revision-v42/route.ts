import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, normalizeProjectCode, selectRows, supabaseGateway } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const ROLES = new Set(["admin", "manager", "accounts"]);
const text = (value: unknown, max = 1200) => String(value ?? "").trim().slice(0, max);
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
async function session(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (!ROLES.has(roleOf(user))) throw new Error("Billing editing access is required.");
  return user;
}
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: NextRequest) {
  try {
    await session(request);
    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (!/^LV-\d{3,8}$/.test(projectCode)) return json({ success: false, error: "Valid project File ID required." }, 400);
    const project = (await selectRows("projects", {
      select: "id,project_code", filters: { project_code: projectCode }, limit: 1,
    }))[0];
    if (!project?.id) return json({ success: false, error: "Project not found." }, 404);
    if (request.nextUrl.searchParams.get("view") === "balances") {
      const authority = await loadReceivableAuthority({ projectId: String(project.id) });
      if (!authority.complete) return json({ success: false, error: "Project balances are incomplete." }, 503);
      const bills = authority.bills;
      return json({ success: true, data: {
        billed: bills.reduce((sum, bill) => sum + bill.gross, 0),
        discount: bills.reduce((sum, bill) => sum + bill.storedDiscount, 0),
        paid: authority.totals.paid,
        due: authority.totals.due,
        services: Object.fromEntries(bills.map(bill => [bill.billCode, {
          paid: bill.allocated, due: bill.dueBeforeRelief,
        }])),
      } });
    }
    const revisions = await selectRows("billing_events", {
      select: "event_key,created_at,actor,details", filters: {
        project_id: project.id, event_type: "full_bill_revision_v42",
      }, order: "created_at:desc", limit: 100,
    });
    const requestId = text(request.nextUrl.searchParams.get("requestId"), 80);
    if (requestId && !validId(requestId)) return json({ success: false, error: "Invalid revision ID." }, 400);
    const history = revisions.map((row) => ({
      revisionId: text(row.event_key).replace(/^full-bill-v42:/, ""), at: row.created_at,
      actor: row.actor, reason: (row.details as Row | null)?.reason || "",
      changes: (row.details as Row | null)?.changes || [],
      result: (row.details as Row | null)?.result || {},
    }));
    if (requestId) return json({ success: true, data: {
      found: history.some(row => row.revisionId === requestId),
      revision: history.find(row => row.revisionId === requestId) || null,
    } });
    return json({ success: true, data: { projectId: projectCode, revisions: history } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read bill revisions.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : 503);
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await session(request);
    const body = await request.json() as Row;
    const projectCode = normalizeProjectCode(body.projectId);
    const requestId = text(body.requestId, 80);
    const reason = text(body.reason, 1200);
    const operations = Array.isArray(body.operations) ? body.operations as Row[] : [];
    const preview = body.preview === true;
    if (!/^LV-\d{3,8}$/.test(projectCode) || !validId(requestId) || reason.length < 12 || operations.length < 1 || operations.length > 60)
      return json({ success: false, error: "Valid File ID, request ID, revision reason and 1–60 changed rows are required." }, 400);
    if (!operations.every(op => op && typeof op === "object" && !Array.isArray(op) &&
      ["create","draft_update","draft_void","issued_revision","issued_remove"].includes(text(op.kind))))
      return json({ success: false, error: "Invalid full bill revision action." }, 400);
    const actor = employeeCodeOf(user) || text(user.username || user.Username || user.userId || user.User_ID, 160);
    if (!actor) return json({ success: false, error: "Named employee account is required." }, 403);
    const requestHash = createHash("sha256").update(JSON.stringify({ projectCode, reason, operations })).digest("hex");
    const result = await supabaseGateway("applyFullBillRevisionV42", {
      projectCode, requestId, requestHash, actor, reason, operations, preview,
    }, 45000);
    return json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Full Bill Editor revision failed.";
    const status = /session/i.test(message) ? 401 : /access|permission/i.test(message) ? 403
      : /changed since|newer adjustments|revision ID belongs|already|stale|paid|outstanding|cannot|conflict/i.test(message) ? 409
      : /invalid|valid|required|must|unsupported/i.test(message) ? 400 : 502;
    return json({ success: false, error: message }, status);
  }
}
