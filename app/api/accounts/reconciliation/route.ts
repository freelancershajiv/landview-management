import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";
import { auditFailure, recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DataRow = Record<string, unknown>;
type RecordType = "bill" | "payment" | "transaction";
type LinkStatus = "linked" | "unlinked" | "needs_review" | "general";
type LedgerVerificationStatus = "not_applicable" | "verified" | "posted" | "unlinked" | "mismatch" | "missing" | "duplicate";

type ProjectOption = {
  id: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  phoneNumber: string;
};

type ReconciliationContext = {
  projectById: Map<string, ProjectOption>;
  transactionById: Map<string, DataRow>;
  transactionByCode: Map<string, DataRow>;
  transactionByPaymentSource: Map<string, DataRow>;
  paymentLinksByLedgerKey: Map<string, Set<string>>;
};

const TABLES: Record<RecordType, { table: string; codeField: string }> = {
  bill: { table: "bills", codeField: "bill_code" },
  payment: { table: "payments", codeField: "payment_code" },
  transaction: { table: "transactions", codeField: "transaction_code" },
};

// Reconciliation used to request SELECT * from four tables. Some LAND VIEW rows
// contain many fields that are irrelevant to this screen, so projecting only the
// columns used below materially reduces gateway + JSON transfer time without
// dropping any finance records from reconciliation.
const PROJECT_SELECT = "id,project_code,project_name,client_name_snapshot,phone_number_snapshot";
const BILL_SELECT = "bill_code,project_id,bill_date,billing_category,category,description,amount,net_amount,status,created_at";
const PAYMENT_SELECT = "payment_code,project_id,payment_date,amount,reference_no,notes,created_at,payment_for,income_category,transaction_type,affects_business_balance,received_from,approval_status,status,ledger_transaction_id,ledger_transaction_code";
const TRANSACTION_SELECT = "id,transaction_code,transaction_date,transaction_type,source_type,source_id,project_id,category,description,debit,credit,reference_no,status,direction,amount,created_at,project_code_snapshot";

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

  if (snapshot) return "needs_review";
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

function isCredit(row: DataRow) {
  return text(row.transaction_type, 60).toLowerCase() === "income" || text(row.direction, 60).toUpperCase() === "CREDIT";
}

function transactionAmount(row: DataRow) {
  const amount = numeric(row.amount);
  if (amount) return Math.abs(amount);
  return Math.abs(numeric(row.credit || row.debit));
}

function addPaymentLedgerLink(map: Map<string, Set<string>>, key: string, paymentCode: string) {
  if (!key || !paymentCode) return;
  const current = map.get(key) || new Set<string>();
  current.add(paymentCode);
  map.set(key, current);
}

function linkedPaymentCount(transaction: DataRow, map: Map<string, Set<string>>) {
  const payments = new Set<string>();
  const id = text(transaction.id, 140);
  const code = text(transaction.transaction_code, 220);
  for (const paymentCode of map.get(`id:${id}`) || []) payments.add(paymentCode);
  for (const paymentCode of map.get(`code:${code}`) || []) payments.add(paymentCode);
  return payments.size;
}

function paymentLedgerHealth(
  row: DataRow,
  project: ProjectOption | undefined,
  context: ReconciliationContext,
): { status: LedgerVerificationStatus; notes: string; transactionCode: string } {
  const paymentCode = text(row.payment_code, 180);
  const linkedId = text(row.ledger_transaction_id, 140);
  const linkedCode = text(row.ledger_transaction_code, 220);
  const hasExplicitLink = Boolean(linkedId || linkedCode);
  const autoTransaction = context.transactionByPaymentSource.get(paymentCode) || context.transactionByCode.get(`TXN-PAY-${paymentCode}`);
  const transaction = (linkedId ? context.transactionById.get(linkedId) : undefined)
    || (linkedCode ? context.transactionByCode.get(linkedCode) : undefined)
    || (row.affects_business_balance !== false ? autoTransaction : undefined);

  if (hasExplicitLink && !transaction) {
    return {
      status: "missing",
      notes: "The payment stores an Accounts Ledger link, but that ledger transaction no longer exists.",
      transactionCode: linkedCode,
    };
  }

  if (!hasExplicitLink && row.affects_business_balance === false) {
    return {
      status: "unlinked",
      notes: "Historical payment is not linked to an Accounts Ledger income entry.",
      transactionCode: "",
    };
  }

  if (!transaction) {
    return {
      status: "missing",
      notes: "This operational payment should have an automatic Accounts Ledger transaction, but none was found.",
      transactionCode: linkedCode,
    };
  }

  const transactionCode = text(transaction.transaction_code, 220) || linkedCode;
  if (linkedPaymentCount(transaction, context.paymentLinksByLedgerKey) > 1) {
    return {
      status: "duplicate",
      notes: "More than one payment points to the same Accounts Ledger transaction. Review before changing balances.",
      transactionCode,
    };
  }

  if (!isCredit(transaction)) {
    return {
      status: "mismatch",
      notes: "The linked Accounts Ledger transaction is not an income / credit entry.",
      transactionCode,
    };
  }

  const amountMatches = Math.abs(transactionAmount(transaction) - recordAmount("payment", row)) < 0.005;
  const paymentDate = text(row.payment_date, 20);
  const transactionDate = text(transaction.transaction_date, 20);
  const dateMatches = !paymentDate || !transactionDate || paymentDate === transactionDate;
  const expectedProject = project?.projectCode || "";
  const transactionProject = normalizeProjectCode(transaction.project_code_snapshot || "");
  const projectMatches = !transactionProject || !expectedProject || transactionProject === expectedProject;

  if (!amountMatches || !dateMatches || !projectMatches) {
    const differences = [
      !amountMatches ? "amount" : "",
      !dateMatches ? "date" : "",
      !projectMatches ? "project" : "",
    ].filter(Boolean).join(", ");
    return {
      status: "mismatch",
      notes: `Payment and Accounts Ledger do not match on ${differences}.`,
      transactionCode,
    };
  }

  const generatedForPayment = Boolean(autoTransaction && text(autoTransaction.id, 140) === text(transaction.id, 140));
  if (row.affects_business_balance !== false && generatedForPayment) {
    return {
      status: "posted",
      notes: "Payment is represented by its automatic Accounts Ledger income transaction and the amount, date and project agree.",
      transactionCode,
    };
  }

  return {
    status: "verified",
    notes: transactionProject
      ? "Payment amount, date and project match the linked Accounts Ledger income entry."
      : "Payment amount and date match the linked Accounts Ledger entry; the older ledger entry has no project snapshot.",
    transactionCode,
  };
}

function buildRows(
  recordType: RecordType,
  rows: DataRow[],
  context: ReconciliationContext,
) {
  const codeField = TABLES[recordType].codeField;
  return rows
    .map((row) => {
      const recordId = text(row[codeField], 180);
      if (!recordId) return null;
      const project = context.projectById.get(text(row.project_id, 140));
      const snapshot = recordType === "transaction" ? normalizeProjectCode(row.project_code_snapshot || "") : "";
      const status = reconciliationStatus(recordType, row, project);
      const sourceId = recordType === "transaction" ? text(row.source_id || row.reference_no, 240) : text(row.reference_no, 240);
      const amount = recordAmount(recordType, row);
      const details = recordDetails(recordType, row);
      const projectCode = project?.projectCode || snapshot;
      const ledgerHealth = recordType === "payment"
        ? paymentLedgerHealth(row, project, context)
        : { status: "not_applicable" as LedgerVerificationStatus, notes: "", transactionCode: "" };
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
        ledgerVerificationStatus: ledgerHealth.status,
        ledgerVerificationNotes: ledgerHealth.notes,
        ledgerTransactionCode: ledgerHealth.transactionCode,
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
          ledgerHealth.status,
          ledgerHealth.transactionCode,
          ledgerHealth.notes,
        ].map((value) => text(value)).filter(Boolean).join(" ").toLowerCase(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    const [projectRows, bills, payments, transactions] = await Promise.all([
      selectRows("projects", { select: PROJECT_SELECT, order: "project_code:asc", limit: 5000 }),
      selectRows("bills", { select: BILL_SELECT, order: "bill_date:desc", limit: 5000 }),
      selectRows("payments", { select: PAYMENT_SELECT, order: "payment_date:desc", limit: 5000 }),
      selectRows("transactions", { select: TRANSACTION_SELECT, order: "transaction_date:desc", limit: 5000 }),
    ]);

    const projects = projectRows
      .map(readableProject)
      .filter((project) => project.id && project.projectCode);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const transactionById = new Map<string, DataRow>();
    const transactionByCode = new Map<string, DataRow>();
    const transactionByPaymentSource = new Map<string, DataRow>();
    for (const transaction of transactions) {
      const id = text(transaction.id, 140);
      const code = text(transaction.transaction_code, 220);
      if (id) transactionById.set(id, transaction);
      if (code) transactionByCode.set(code, transaction);
      if (text(transaction.source_type, 80).toUpperCase() === "PAYMENT") {
        const sourceId = text(transaction.source_id, 180);
        if (sourceId) transactionByPaymentSource.set(sourceId, transaction);
      }
    }

    const paymentLinksByLedgerKey = new Map<string, Set<string>>();
    for (const payment of payments) {
      const paymentCode = text(payment.payment_code, 180);
      const ledgerId = text(payment.ledger_transaction_id, 140);
      const ledgerCode = text(payment.ledger_transaction_code, 220);
      if (ledgerId) addPaymentLedgerLink(paymentLinksByLedgerKey, `id:${ledgerId}`, paymentCode);
      if (ledgerCode) addPaymentLedgerLink(paymentLinksByLedgerKey, `code:${ledgerCode}`, paymentCode);
    }

    const context: ReconciliationContext = {
      projectById,
      transactionById,
      transactionByCode,
      transactionByPaymentSource,
      paymentLinksByLedgerKey,
    };

    const rows = [
      ...buildRows("bill", bills, context),
      ...buildRows("payment", payments, context),
      ...buildRows("transaction", transactions, context),
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
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Landview-Data": "supabase",
          "X-Landview-Reconciliation-Ms": String(Date.now() - startedAt),
        },
      },
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
