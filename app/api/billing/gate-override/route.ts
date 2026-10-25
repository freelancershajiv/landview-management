import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, insertRows, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function actorOf(user: Row) { return employeeCodeOf(user) || text(user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW"; }

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return json({ success: false, error: "Session expired." }, 401);
    if (!["admin", "manager"].includes(roleOf(user))) return json({ success: false, error: "Admin or manager approval is required for a delivery gate override." }, 403);
    const body = await request.json() as Row;
    const serviceId = text(body.serviceId, 120);
    const reason = text(body.reason, 1200);
    if (!serviceId || !reason) return json({ success: false, error: "Service and override reason are required." }, 400);
    const services = await selectRows("project_contract_services", { filters: { id: serviceId }, limit: 1 });
    if (!services.length) return json({ success: false, error: "Contract service was not found." }, 404);
    const service = services[0];
    if (text(service.release_gate) === "None") return json({ success: false, error: "This service has no delivery gate to override." }, 400);
    const targetStatus = text(service.workflow_type) === "municipality" ? "Delivered to Client" : "Delivered";
    const now = new Date();
    const expires = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const existing = await selectRows("billing_gate_overrides", { filters: { contract_service_id: service.id, status: "Pending", target_status: targetStatus }, order: "created_at:desc", limit: 10 });
    for (const row of existing) {
      if (new Date(text(row.expires_at)).getTime() > Date.now()) return json({ success: true, data: row });
    }
    const rows = await insertRows("billing_gate_overrides", {
      project_id: service.project_id,
      project_code: service.project_code,
      contract_service_id: service.id,
      service_name: service.service_name,
      target_status: targetStatus,
      reason,
      approved_by: actorOf(user),
      status: "Pending",
      expires_at: expires,
      created_at: now.toISOString(),
    });
    await insertRows("billing_events", {
      project_id: service.project_id,
      project_code: service.project_code,
      contract_id: service.contract_id,
      contract_service_id: service.id,
      event_type: "delivery_gate_override_approved",
      event_key: `delivery-gate-override-approved:${rows[0].id}`,
      service_name: service.service_name,
      workflow_status: targetStatus,
      amount: 0,
      actor: actorOf(user),
      details: { reason, targetStatus, expiresAt: expires },
      created_at: now.toISOString(),
    });
    return json({ success: true, data: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not approve delivery override.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|approval/i.test(message) ? 403 : 400);
  }
}
