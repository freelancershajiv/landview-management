import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, roleOf, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Line = Record<string, unknown>;
const CATEGORIES = new Set(["Engineering Bill", "Supervision Bill", "Other Services Bill"]);
const ROLES = new Set(["admin", "manager", "accounts"]);
const MAX_LINES = 40;
function text(value: unknown, length = 300) { return String(value ?? "").trim().slice(0, length); }
function amount(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : Number.NaN;
}
function reject(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reject("Invalid request origin.", 403);
  try {
    const user = await requireLocalSession(request);
    if (!user) return reject("Session expired.", 401);
    if (!ROLES.has(roleOf(user))) return reject("Finance editing permission is required.", 403);
    const body = await request.json() as Record<string, unknown>;
    const projectCode = normalizeProjectCode(body.projectId);
    if (!/^LV-\d{3,8}$/.test(projectCode)) return reject("Select a valid existing project.");
    const billDate = text(body.billDate, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate) || Number.isNaN(Date.parse(billDate))) return reject("Invalid bill date.");
    const status = text(body.status, 20);
    if (!["Draft", "Issued"].includes(status)) return reject("Only Draft or Issued full bills can be created.");
    const batchId = text(body.batchId, 64);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(batchId)) {
      return reject("A valid batch submission ID is required.");
    }
    const items = Array.isArray(body.lines) ? body.lines as Line[] : [];
    if (!items.length || items.length > MAX_LINES) return reject("Choose between 1 and 40 service rows.");
    const notes = text(body.notes, 1700);
    const checked = items.map((line, index) => {
      const category = text(line.category, 100);
      const service = text(line.service, 250).replace(/^\[(Engineering Bill|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
      const quantity = Number(line.quantity), unitPrice = amount(line.unitPrice);
      const gross = amount(line.amount), discount = amount(line.discount ?? 0);
      if (!CATEGORIES.has(category) || !service) throw new Error(`Invalid service/category on row ${index + 1}.`);
      if (!(quantity > 0) || !Number.isFinite(quantity) || !(unitPrice > 0)) throw new Error(`Invalid quantity/rate on row ${index + 1}.`);
      if (!(gross > 0) || gross > 1000000000 || discount < 0 || discount > gross) throw new Error(`Invalid gross/discount on row ${index + 1}.`);
      if (Math.abs(quantity * unitPrice - gross) > 0.02) throw new Error(`Quantity × rate does not match gross on row ${index + 1}.`);
      return {
        category, description: `[${category}] ${service}`, quantity, unitPrice, gross, discount,
        idempotencyKey: `billing-v4:${batchId}:${index}`,
      };
    });
    const project = (await selectRows("projects", { select: "id,project_code", filters: { project_code: projectCode }, limit: 1 }))[0];
    if (!project?.id) return reject("Project not found.", 404);
    const keys = checked.map((item) => item.idempotencyKey);
    const matching = async () => await selectRows("bills", {
      select: "id,bill_code,project_id,idempotency_key,status,amount,discount,description",
      inFilters: { idempotency_key: keys }, limit: MAX_LINES + 1,
    });
    const matchingBills = await matching();
    function verifiedBatch(rows: Record<string, unknown>[]) {
      if (rows.length !== checked.length) return false;
      const byKey = new Map(rows.map((row) => [text(row.idempotency_key), row]));
      return checked.every((item) => {
        const row = byKey.get(item.idempotencyKey);
        return row && text(row.project_id) === text(project.id) &&
          text(row.description) === item.description &&
          Math.abs(Number(row.amount) - item.gross) < .01 &&
          Math.abs(Number(row.discount) - item.discount) < .01;
      });
    }
    if (matchingBills.length) {
      if (!verifiedBatch(matchingBills)) return reject("A partial or conflicting batch already exists. Review the project bill register before resubmitting; no rows were inserted.", 409);
      return NextResponse.json({ success: true, data: { projectId: projectCode, status, count: matchingBills.length, recovered: true, billCodes: matchingBills.map((row) => row.bill_code) } });
    }
    const createdAt = new Date().toISOString();
    const actor = employeeCodeOf(user) || text(user?.username || user?.Username || user?.userId || user?.User_ID) || "LAND VIEW";
    const rows = checked.map((line) => ({
      bill_code: `BILL-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      project_id: project.id, bill_date: billDate,
      billing_category: line.category, category: line.category, description: line.description,
      quantity: line.quantity, unit_price: line.unitPrice, amount: line.gross, discount: line.discount,
      status, notes: ["Full Bill 4.0", notes].filter(Boolean).join(" | ") || null,
      created_via: "Direct Full Billing V4", source_created_by: actor, source_created_at: createdAt,
      idempotency_key: line.idempotencyKey,
    }));
    // One PostgREST INSERT containing every row is one PostgreSQL transaction.
    // A trigger error rolls back the entire batch. No partial line-by-line writes.
    try {
      const saved = await insertRows("bills", rows);
      if (saved.length !== checked.length) throw new Error("Batch response was incomplete.");
    } catch (cause) {
      // A lost response or concurrent duplicate request must not duplicate bills.
      const recovered = await matching();
      if (!verifiedBatch(recovered)) {
        throw new Error("The full bill could not be confirmed as a complete batch. Check the project bill register before retrying. " +
          (cause instanceof Error ? cause.message : "Batch insert failed."));
      }
    }
    const persisted = await matching();
    if (!verifiedBatch(persisted)) throw new Error("Bill insert finished but verification was incomplete. Inspect the project before trying again.");
    return NextResponse.json({ success: true, data: {
      projectId: projectCode, status, count: persisted.length, recovered: false, billCodes: persisted.map((row) => row.bill_code),
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create full bill.";
    return reject(message, /session/i.test(message) ? 401 : /permission|access/i.test(message) ? 403 : /partial|conflict/i.test(message) ? 409 : 400);
  }
}
