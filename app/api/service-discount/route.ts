import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import {
  getProjectServiceFinancials,
  syncPaidServiceWorkflows,
  workflowServiceKey,
  workflowServiceName,
} from "@/lib/service-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const CATEGORIES = new Set(["Engineering Bill", "Other Services Bill", "Supervision Bill"]);

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) { const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function norm(value: unknown) { return text(value, 160).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function effectiveBill(row: Row) { return !["void", "voided", "cancelled", "canceled", "rejected"].includes(norm(row.status)); }
function billCategory(row: Row) {
  const value = norm(row.billing_category || row.category || row.description);
  if (value.includes("supervision")) return "Supervision Bill";
  if (/other|soil|survey|municipality|file pass/.test(value)) return "Other Services Bill";
  return "Engineering Bill";
}
function billService(row: Row) {
  const category = billCategory(row);
  if (category === "Supervision Bill") return "Site Supervision";
  const raw = text(row.description, 300).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
  return workflowServiceName(raw || row.billing_category || row.category);
}
function actor(user: Row) { return text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW"; }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function view(snapshot: Awaited<ReturnType<typeof getProjectServiceFinancials>>) {
  return {
    project: {
      projectId: snapshot.project.project_code || "",
      ownerName: snapshot.project.client_name_snapshot || snapshot.project.project_name || "",
      story: snapshot.project.number_of_stories_text || snapshot.project.floors || "",
      location: snapshot.project.location || "",
    },
    services: snapshot.services,
    categoryTotals: snapshot.categoryTotals,
  };
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    user = await requireLocalSession(request) as Row | null;
    if (!user) throw new Error("Session expired.");
    const role = roleOf(user);
    if (!["admin", "manager", "accounts"].includes(role)) throw new Error("Finance management permission is required.");

    input = await request.json() as Row;
    const projectId = text(input.projectId, 80).toUpperCase();
    const category = text(input.category, 80);
    const requested: Row[] = Array.isArray(input.services) ? input.services : [];
    if (!projectId) throw new Error("Project is required.");
    if (!CATEGORIES.has(category)) throw new Error("Choose a valid billing category.");
    if (!requested.length) throw new Error("At least one service discount is required.");

    const before = await getProjectServiceFinancials(projectId);
    const available = before.services.filter((service) => service.billingCategory === category);
    const byKey = new Map(available.map((service) => [service.serviceKey, service]));
    const targets = requested.map((row) => {
      const serviceName = workflowServiceName(row.serviceName || row.service || "");
      const serviceKey = workflowServiceKey(serviceName);
      const current = byKey.get(serviceKey);
      if (!current) throw new Error(`${serviceName || "Service"} is not billed under ${category}.`);
      const discount = Math.max(0, num(row.discount));
      if (discount > current.gross + 0.01) throw new Error(`${current.serviceName} discount cannot exceed its gross bill of BDT ${current.gross.toLocaleString("en-BD")}.`);
      const nextNet = Math.max(0, current.gross - discount);
      if (nextNet + 0.01 < current.paid) throw new Error(`${current.serviceName} net cannot be reduced below the already paid amount of BDT ${current.paid.toLocaleString("en-BD")}.`);
      return { current, serviceName: current.serviceName, serviceKey, discount };
    });

    const bills = (await selectRows("bills", { filters: { project_id: before.project.id }, order: "bill_date:asc,created_at:asc", limit: 5000 })).filter(effectiveBill);
    const now = new Date().toISOString();
    const changes: Row[] = [];

    for (const target of targets) {
      const matching = bills.filter((bill) => billCategory(bill) === category && workflowServiceKey(billService(bill)) === target.serviceKey);
      if (!matching.length && target.current.gross > 0) throw new Error(`Could not resolve the bill rows for ${target.serviceName}.`);
      const grossTotal = matching.reduce((sum, bill) => sum + Math.max(0, num(bill.amount)), 0);
      let remaining = target.discount;
      const billChanges: Row[] = [];
      for (let index = 0; index < matching.length; index += 1) {
        const bill = matching[index];
        const gross = Math.max(0, num(bill.amount));
        const share = index === matching.length - 1
          ? Math.min(gross, remaining)
          : Math.min(gross, Math.round((target.discount * (grossTotal > 0 ? gross / grossTotal : 0)) * 100) / 100);
        remaining = Math.max(0, remaining - share);
        await updateRows("bills", { bill_code: bill.bill_code }, {
          discount: share,
          net_amount: Math.max(0, gross - share),
          updated_at: now,
          source_updated_at: now,
        });
        billChanges.push({ billCode: bill.bill_code, before: Math.max(0, num(bill.discount)), after: share });
      }
      if (remaining > 0.01) throw new Error(`Could not allocate the full discount for ${target.serviceName}.`);
      changes.push({ serviceName: target.serviceName, serviceKey: target.serviceKey, before: target.current.discount, after: target.discount, bills: billChanges });
    }

    const increase = changes.reduce((sum, row) => sum + Math.max(0, num(row.after) - num(row.before)), 0);
    if (increase > 0.009) {
      await insertRows("billing_discount_log", {
        discount_code: `DISC-SVC-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
        project_id: before.project.id,
        billing_category: category,
        amount: increase,
        discount_date: text(input.date, 20) || new Date().toISOString().slice(0, 10),
        notes: text(input.notes, 1000) || `Service-wise discount update for ${category}`,
        created_by: actor(user),
        idempotency_key: `service-discount-${crypto.randomUUID()}`,
        allocations: changes,
        created_at: now,
      });
    }

    await syncPaidServiceWorkflows(projectId, actor(user));
    const after = await getProjectServiceFinancials(projectId);
    await recordAuditEvent({
      user,
      request,
      action: "service_wise_discount_update",
      entityType: "project",
      entityId: projectId,
      before: { category, services: changes.map((row) => ({ serviceName: row.serviceName, discount: row.before })) },
      after: { category, services: changes.map((row) => ({ serviceName: row.serviceName, discount: row.after })) },
      details: { category, changes },
      source: "service-payments",
    });

    return json({ success: true, data: view(after) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save service-wise discounts.";
    if (user) {
      await recordAuditEvent({
        user,
        request,
        action: "service_wise_discount_update",
        entityType: "project",
        entityId: text(input.projectId, 80),
        outcome: "failure",
        details: { category: input.category, error: message },
        source: "service-payments",
      });
    }
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission/i.test(message) ? 403 : 400);
  }
}
