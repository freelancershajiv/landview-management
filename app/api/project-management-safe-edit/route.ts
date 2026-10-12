// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

const ALLOWED_RECEIVED_FROM = ["Mr. Mahi Bhai", "Scrap Selling", "Mr. Jamaluddin"];
const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const num = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const roleOf = (user: Row | null) => clean(user?.role || user?.Role, 30).toLowerCase();

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" },
  });
}

function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Project Management edit failed.");
  return NextResponse.json({ success: false, error: message }, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function PUT(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.", 403);

    const user = await requireLocalSession(request) as Row | null;
    if (!user) return fail("Session expired.", 401);
    if (!["admin", "manager"].includes(roleOf(user))) return fail("Management permission required.", 403);

    const body = await request.json() as Row;
    const id = clean(body.id, 100);
    const projectCode = normalizeProjectCode(body.projectId || body.Project_ID);
    if (!id) return fail("Ledger entry ID is required.", 400);
    if (!projectCode) return fail("Project is required.", 400);

    const projects = await selectRows("projects", {
      filters: { project_code: projectCode, record_type: "project" },
      limit: 1,
    });
    const project = projects[0];
    if (!project) return fail("Project not found.", 404);

    const existingRows = await selectRows("project_management_ledger", {
      filters: { id, project_id: project.id },
      limit: 1,
    });
    const existing = existingRows[0];
    if (!existing) return fail("Ledger entry not found.", 404);

    const debit = Math.max(0, num(body.debit ?? body.Debit));
    const credit = Math.max(0, num(body.credit ?? body.Credit));
    if ((debit > 0) === (credit > 0)) return fail("Enter either an Income or an Expense amount, not both.", 400);

    const details = clean(body.details ?? body.Details, 1000);
    if (!details) return fail("Details are required.", 400);

    const entryDate = clean(body.entryDate ?? body.Date, 20);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return fail("Enter a valid entry date.", 400);

    const incomingReceivedFrom = clean(body.receivedFrom ?? body.received_from ?? body.Received_From, 160);
    const existingReceivedFrom = clean(existing.received_from, 160);
    const sourceWasExplicitlyChanged = body.receivedFromExplicitlyChanged === true;

    let receivedFrom: string | null = null;
    if (debit > 0) {
      const hasLegacySource = Boolean(existingReceivedFrom) && !ALLOWED_RECEIVED_FROM.includes(existingReceivedFrom);
      if (hasLegacySource && !sourceWasExplicitlyChanged) {
        receivedFrom = existingReceivedFrom;
      } else {
        if (!ALLOWED_RECEIVED_FROM.includes(incomingReceivedFrom)) return fail("Select a valid Received From option.", 400);
        receivedFrom = incomingReceivedFrom;
      }
    }

    const paidTo = clean(body.paidTo ?? body.paid_to ?? body.Paid_To ?? body.supplier ?? body.Supplier, 160) || null;
    const saved = await updateRows("project_management_ledger", { id, project_id: project.id }, {
      supplier: paidTo,
      paid_to: paidTo,
      received_from: receivedFrom,
      entry_date: entryDate,
      details,
      sft: Math.max(0, num(body.sft ?? body.SFT)),
      rate: Math.max(0, num(body.rate ?? body.Rate)),
      debit,
      credit,
      category: clean(body.category ?? body.Category, 120) || null,
      memo: clean(body.memo ?? body.Memo, 1000) || null,
      updated_at: new Date().toISOString(),
    });

    if (!saved.length) return fail("Ledger entry not found.", 404);
    return ok(saved[0]);
  } catch (error) {
    return fail(error, 500);
  }
}
