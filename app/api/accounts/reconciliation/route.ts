import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";
import { auditFailure, recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DataRow = Record<string, unknown>;
type RecordType = "bill" | "payment" | "transaction";
type LinkStatus = "linked" | "unlinked" | "needs_review" | "general";

type ProjectOption = {
  id: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  phoneNumber: string;
};

const TABLES: Record<RecordType, { table: string; codeField: string }> = {
  bill: { table: "bills", codeField: "bill_code" },
  payment: { table: "payments", codeField: "payment_code" },
  transaction: { table: "transactions", codeField: "transaction_code" },
};

function text(value: unknown, max = 1500) {
  return String(value ?? "").trim().slice(0, max);
}

function numeric(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function readableProject(row: DataRow): ProjectOption {
  return {
    id: text(row.id, 140),
    projectCode: normalizeProjectCode(row.project_code || ""),
    projectName: text(row.project_name, 300),
    clientName: text(row.client_name_snapshot, 300),
    phoneNumber: text(row.phone_number_snapshot, 120),
  };
}

function reconciliationStatus(
  recordType: RecordType,
  row: DataRow,
  project: ProjectOption | undefined,
): LinkStatus {
  const projectId = text(row.project_id, 140);
  const snapshot = recordType === "transaction" ? normalizeProjectCode(row.project_code_snapshot || "") : "";

  if (projectId) {
    if (!project) return "needs_review";
    if (snapshot && snapshot !== project.projectCode) return "needs_review";
    return "linked";
  }

  // A transaction retaining a project snapshot but missing the real FK is a
  // concrete integrity mismatch and therefore requires review.
  if (snapshot) return "needs_review";

  // Bills and client payments belong to a project by definition. A standalone
  // ledger transaction, however, is allowed to be intentionally project-free.
  if (recordType === "bill" || recordType === "payment") return "unlinked";
  return "general";
}

function recordAmount(recordType: RecordType, row: DataRow) {
  if (recordType === "bill") return numeric(row.net_amount ?? row.amount);
  return Math.abs(numeric(row.amount || row.credit || row.debit));
}

function recordDate(recordType: RecordType, row: DataRow) {
  if (recordType === "bill") return text(row.bill_date || row.created_at, 60);
  if (recordType === "payment") return text(row.payment_date || row.created_at, 60);
  return text(row.transaction_date || row.created_at, 60);
}

function recordDetails(recordType: RecordType, row: DataRow) {
  if (recordType === "bill") {
    return text(row.description || row.category || row.billing_category || "Bill", 600);
  }
  if (recordType === "payment") {
    return text(row.payment_for || row.income_category || row.notes || row.received_from || "Payment", 600);
  }
  return text(row.description || row.category || row.transaction_type || "Ledger transaction", 600);
}

function buildRows(
  recordType: RecordType,
  rows: DataRow[],
  projectById: Map<string, ProjectOption>,
) {
  const codeField = TABLES[recordType].codeField;
  return rows
    .map((row) => {
      const recordId = text(row[codeField], 180);
      if (!recordId) return null;
      const project = projectById.get(text(row.project_id, 140));
      const snapshot = recordType === "transaction" ? normalizeProjectCode(row.project_code_snapshot || "") : "";
      const status = reconciliationStatus(recordType, row, project);
      const sourceId = recordType === "transaction" ? text(row.source_id || row.reference_no, 240) : text(row.reference_no, 240);
      const amount = recordAmount(recordType, row);
      const details = recordDetails(recordType, row);
      const projectCode = project?.projectCode || snapshot;
      return {
        key: `${recordType}:${recordId}`,
        recordType,
        recordId,
        sourceId,
        date: recordDate(recordType, row),
        amount,
        details,
        category: text(row.billing_category || row.category || row.income_category || row.transaction_type, 300),
        rowStatus: text(row.approval_status || row.status, 120),
        projectCode,
        projectName: project?.projectName || "",
        clientName: project?.clientName || "",
        phoneNumber: project?.phoneNumber || "",
        linkStatus: status,
        search: [
          recordId,
          sourceId,
          details,
          amount,
          projectCode,
          project?.projectName,
          project?.clientName,
          project?.phoneNumber,
          row.billing_category,
          row.category,
          row.income_category,
          row.transaction_type,
          row.reference_no,
        ].map((value) => text(value)).filter(Boolean).join(" ").toLowerCase(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    const [projectRows, bills, payments, transactions] = await Promise.all([
      selectRows("projects", { order: "project_code:asc", limit: 5000 }),
      selectRows("bills", { order: "bill_date:desc", limit: 5000 }),
      selectRows("payments", { order: "payment_date:desc", limit: 5000 }),
      selectRows("transactions", { order: "transaction_date:desc", limit: 5000 }),
    ]);

    const projects = projectRows
      .map(readableProject)
      .filter((project) => project.id && project.projectCode);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const rows = [
      ...buildRows("bill", bills, projectById),
      ...buildRows("payment", payments, projectById),
      ...buildRows("transaction", transactions, projectById),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.recordId.localeCompare(b.recordId));

    return NextResponse.json(
      {
        success: true,
        data: {
          rows,
          projects,
          canEdit: role === "admin" || role === "manager",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load reconciliation data.";
    return NextResponse.json(
      { success: false, error: message },
      { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(request: NextRequest) {
  let auditUser: Record<string, unknown> | null = null;
  let auditRecordId = "";
  let auditBefore: DataRow | undefined;
  let auditAfter: DataRow | undefined;

  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const user = await requireLocalSession(request);
    auditUser = user as Record<string, unknown> | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    if (role !== "admin" && role !== "manager") {
      return NextResponse.json({ success: false, error: "Admin or Manager access is required to change project links." }, { status: 403 });
    }

    const body = await request.json() as DataRow;
    const recordType = text(body.recordType, 30) as RecordType;
    const config = TABLES[recordType];
    if (!config) return NextResponse.json({ success: false, error: "Choose a valid record type." }, { status: 400 });

    const recordId = text(body.recordId, 180);
    auditRecordId = recordId;
    if (!recordId) return NextResponse.json({ success: false, error: "Record ID is required." }, { status: 400 });

    const found = await selectRows(config.table, { filters: { [config.codeField]: recordId }, limit: 1 });
    if (!found.length) return NextResponse.json({ success: false, error: `${recordType} ${recordId} was not found.` }, { status: 404 });
    auditBefore = found[0];

    const mode = text(body.mode, 30).toLowerCase();
    let changes: DataRow;
    let target = "General / No Project";

    if (mode === "general") {
      if (recordType !== "transaction") {
        return NextResponse.json({ success: false, error: "Only standalone ledger transactions can be marked General / No Project." }, { status: 400 });
      }
      changes = { project_id: null, project_code_snapshot: null };
    } else {
      const projectCode = normalizeProjectCode(body.projectCode || "");
      if (!projectCode) return NextResponse.json({ success: false, error: "Choose a project before saving." }, { status: 400 });
      const projectRows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
      if (!projectRows.length) return NextResponse.json({ success: false, error: `Project ${projectCode} was not found.` }, { status: 400 });
      const project = projectRows[0];
      target = projectCode;
      changes = recordType === "transaction"
        ? { project_id: project.id, project_code_snapshot: projectCode }
        : { project_id: project.id };
    }

    auditAfter = changes;
    const updated = await updateRows(config.table, { [config.codeField]: recordId }, changes);

    await recordAuditEvent({
      user: auditUser,
      request,
      action: mode === "general" ? "accounts.reconciliation.general" : "accounts.reconciliation.link",
      entityType: recordType,
      entityId: recordId,
      target,
      before: auditBefore,
      after: updated[0] || { ...auditBefore, ...changes },
      details: { recordType, reconciliation: true },
    });

    return NextResponse.json(
      { success: true, data: updated[0] || null, target },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } },
    );
  } catch (error) {
    await auditFailure({
      user: auditUser,
      request,
      action: "accounts.reconciliation.update",
      entityType: "finance_record",
      entityId: auditRecordId,
      target: auditRecordId,
      before: auditBefore,
      after: auditAfter,
      error,
    });
    const message = error instanceof Error ? error.message : "Could not update the project link.";
    return NextResponse.json(
      { success: false, error: message },
      { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
