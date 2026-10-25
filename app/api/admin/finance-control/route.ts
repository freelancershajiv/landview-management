import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-finance-health";
const OIDC_AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, any>;

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function effectivePayment(row: Row) {
  if (!row.project_id) return false;
  if (row.affects_business_balance === false) return false;
  if (normalized(row.transaction_type) === "personal income") return false;
  const status = normalized(row.approval_status || row.status);
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
function effectiveTransaction(row: Row) {
  return !/void|cancel|reject/.test(normalized(row.status));
}
function transactionAmount(row: Row) {
  const direct = Math.abs(num(row.amount));
  if (direct > 0) return direct;
  return Math.max(Math.abs(num(row.debit)), Math.abs(num(row.credit)));
}
function isIncomeTransaction(row: Row) {
  if (num(row.credit) > 0.009) return true;
  const direction = normalized(row.direction);
  if (["credit", "income", "in"].includes(direction)) return true;
  const type = normalized(row.transaction_type);
  return num(row.debit) <= 0.009 && /income|payment|receipt|collection/.test(type);
}
function expectedInvoiceStatus(amount: number, allocated: number) {
  if (amount <= 0.009) return "ADJUSTED";
  if (allocated >= amount - 0.009) return "PAID";
  if (allocated > 0.009) return "PARTIALLY PAID";
  return "ISSUED";
}
function addAmount(map: Map<string, number>, key: unknown, value: unknown) {
  const id = text(key);
  if (!id) return;
  map.set(id, (map.get(id) || 0) + num(value));
}
function projectLabel(row: Row | undefined) {
  return text(row?.project_code) || "Unknown project";
}

async function billingV2Reconciliation() {
  const [payments, invoices, allocations, adjustments, projects, bills, transactions] = await Promise.all([
    selectRows("payments", { select: "id,payment_code,project_id,payment_date,amount,transaction_type,affects_business_balance,approval_status,status,ledger_transaction_id,ledger_transaction_code,invoice_allocated_amount,invoice_unallocated_amount,invoice_allocation_status", limit: 5000 }),
    selectRows("invoices", { select: "id,invoice_code,bill_code,project_id,amount,paid_amount_snapshot,due_amount_snapshot,status", limit: 5000 }),
    selectRows("payment_invoice_allocations", { select: "id,payment_id,payment_code,invoice_id,invoice_code,project_id,project_code,allocated_amount", limit: 5000 }),
    selectRows("billing_adjustments", { select: "id,adjustment_code,project_id,project_code,bill_id,bill_code,mirror_bill_id,mirror_bill_code,adjustment_type,amount,status", limit: 5000 }),
    selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot,lifecycle_phase", limit: 5000 }),
    selectRows("bills", { select: "id,bill_code,project_id,amount,discount,status,created_via", limit: 5000 }),
    selectRows("transactions", { select: "id,transaction_code,transaction_date,transaction_type,source_type,source_id,project_id,amount,debit,credit,direction,status", limit: 5000 }),
  ]);

  const projectById = new Map(projects.map((row) => [text(row.id), row]));
  const billById = new Map(bills.map((row) => [text(row.id), row]));
  const billByCode = new Map(bills.map((row) => [text(row.bill_code), row]));
  const allocationByPayment = new Map<string, number>();
  const allocationByInvoice = new Map<string, number>();
  for (const row of allocations) {
    addAmount(allocationByPayment, row.payment_id, row.allocated_amount);
    addAmount(allocationByInvoice, row.invoice_id, row.allocated_amount);
  }

  const invoiceDueByProject = new Map<string, number>();
  const invoiceRows = invoices.map((invoice) => {
    const allocated = allocationByInvoice.get(text(invoice.id)) || 0;
    const amount = num(invoice.amount);
    const expectedDue = Math.max(0, amount - allocated);
    addAmount(invoiceDueByProject, invoice.project_id, expectedDue);
    return { invoice, amount, allocated, expectedDue, expectedStatus: expectedInvoiceStatus(amount, allocated) };
  });

  const invoiceDueMismatches = invoiceRows.filter(({ invoice, allocated, expectedDue, expectedStatus }) => {
    const storedPaid = num(invoice.paid_amount_snapshot);
    const storedDue = num(invoice.due_amount_snapshot);
    const status = text(invoice.status).toUpperCase();
    return Math.abs(storedPaid - allocated) > 0.01 || Math.abs(storedDue - expectedDue) > 0.01 || status !== expectedStatus;
  }).map(({ invoice, amount, allocated, expectedDue, expectedStatus }) => ({
    invoiceCode: text(invoice.invoice_code),
    projectCode: projectLabel(projectById.get(text(invoice.project_id))),
    amount: round(amount),
    allocated: round(allocated),
    storedPaid: round(num(invoice.paid_amount_snapshot)),
    storedDue: round(num(invoice.due_amount_snapshot)),
    expectedDue: round(expectedDue),
    status: text(invoice.status),
    expectedStatus,
    difference: round(Math.abs(num(invoice.due_amount_snapshot) - expectedDue) + Math.abs(num(invoice.paid_amount_snapshot) - allocated)),
  }));

  const invoicesWithoutAllocation = invoiceRows.filter(({ invoice, allocated }) =>
    allocated <= 0.009 && (num(invoice.paid_amount_snapshot) > 0.009 || ["paid", "partially paid"].includes(normalized(invoice.status)))
  ).map(({ invoice, amount }) => ({
    invoiceCode: text(invoice.invoice_code),
    projectCode: projectLabel(projectById.get(text(invoice.project_id))),
    amount: round(amount),
    paidSnapshot: round(num(invoice.paid_amount_snapshot)),
    status: text(invoice.status),
  }));

  const effectivePayments = payments.filter(effectivePayment);
  const advances: Row[] = [];
  const paymentsWithoutInvoice: Row[] = [];
  const paymentSnapshotMismatches: Row[] = [];
  for (const payment of effectivePayments) {
    const allocated = allocationByPayment.get(text(payment.id)) || 0;
    const amount = Math.max(0, num(payment.amount));
    const expectedUnallocated = Math.max(0, amount - allocated);
    const projectDue = invoiceDueByProject.get(text(payment.project_id)) || 0;
    const base = {
      paymentCode: text(payment.payment_code),
      projectCode: projectLabel(projectById.get(text(payment.project_id))),
      date: text(payment.payment_date).slice(0, 10),
      amount: round(amount),
      allocated: round(allocated),
      unallocated: round(expectedUnallocated),
    };
    if (expectedUnallocated > 0.009) advances.push(base);
    if (allocated <= 0.009 && projectDue > 0.009) paymentsWithoutInvoice.push({ ...base, openInvoiceDue: round(projectDue) });
    const storedAllocated = num(payment.invoice_allocated_amount);
    const storedUnallocated = num(payment.invoice_unallocated_amount);
    if (Math.abs(storedAllocated - allocated) > 0.01 || Math.abs(storedUnallocated - expectedUnallocated) > 0.01) {
      paymentSnapshotMismatches.push({ ...base, storedAllocated: round(storedAllocated), storedUnallocated: round(storedUnallocated) });
    }
  }

  const adjustmentMismatches: Row[] = [];
  for (const adjustment of adjustments) {
    const status = normalized(adjustment.status);
    const original = billById.get(text(adjustment.bill_id)) || billByCode.get(text(adjustment.bill_code));
    const mirror = billById.get(text(adjustment.mirror_bill_id)) || billByCode.get(text(adjustment.mirror_bill_code));
    const type = normalized(adjustment.adjustment_type);
    const amount = Math.abs(num(adjustment.amount));
    const reasons: string[] = [];
    if (!original) reasons.push("Original bill missing");
    if (!mirror) reasons.push("Mirror adjustment bill missing");
    if (mirror) {
      const mirrorStatus = normalized(mirror.status);
      if (status === "posted" && /void|cancel|reject/.test(mirrorStatus)) reasons.push("Posted adjustment has void mirror bill");
      if (status === "void" && !/void|cancel/.test(mirrorStatus)) reasons.push("Voided adjustment mirror bill is still active");
      if (status === "posted" && type === "credit note" && (Math.abs(num(mirror.amount)) > 0.01 || Math.abs(num(mirror.discount) - amount) > 0.01)) reasons.push("Credit-note mirror amount does not match");
      if (status === "posted" && type === "debit note" && (Math.abs(num(mirror.amount) - amount) > 0.01 || Math.abs(num(mirror.discount)) > 0.01)) reasons.push("Debit-note mirror amount does not match");
    }
    if (reasons.length) adjustmentMismatches.push({
      adjustmentCode: text(adjustment.adjustment_code),
      projectCode: text(adjustment.project_code) || projectLabel(projectById.get(text(adjustment.project_id))),
      type: text(adjustment.adjustment_type),
      amount: round(amount),
      status: text(adjustment.status),
      reason: reasons.join("; "),
    });
  }

  const completedWithDue = projects.filter((project) => normalized(project.lifecycle_phase) === "completed")
    .map((project) => ({
      projectCode: text(project.project_code),
      projectName: text(project.project_name),
      clientName: text(project.client_name_snapshot),
      due: round(invoiceDueByProject.get(text(project.id)) || 0),
    }))
    .filter((row) => row.due > 0.009)
    .sort((a, b) => b.due - a.due);

  const transactionById = new Map<string, Row>();
  const transactionByCode = new Map<string, Row>();
  const transactionsBySource = new Map<string, Row[]>();
  const transactionsByProjectDate = new Map<string, Row[]>();
  for (const transaction of transactions) {
    if (!effectiveTransaction(transaction)) continue;
    if (text(transaction.id)) transactionById.set(text(transaction.id), transaction);
    if (text(transaction.transaction_code)) transactionByCode.set(text(transaction.transaction_code), transaction);
    const source = text(transaction.source_id);
    if (source) {
      const bucket = transactionsBySource.get(source) || [];
      bucket.push(transaction);
      transactionsBySource.set(source, bucket);
    }
    const projectDateKey = `${text(transaction.project_id)}|${text(transaction.transaction_date).slice(0, 10)}`;
    if (text(transaction.project_id) && text(transaction.transaction_date)) {
      const bucket = transactionsByProjectDate.get(projectDateKey) || [];
      bucket.push(transaction);
      transactionsByProjectDate.set(projectDateKey, bucket);
    }
  }

  let billingPaymentTotal = 0;
  let linkedLedgerTotal = 0;
  let legacyFallbackCount = 0;
  const ledgerPaymentMismatches: Row[] = [];
  for (const payment of effectivePayments) {
    const paymentAmount = Math.max(0, num(payment.amount));
    billingPaymentTotal += paymentAmount;
    const linked = new Map<string, Row>();
    let matchMode = "direct";
    for (const key of [text(payment.id), text(payment.payment_code)]) {
      for (const row of transactionsBySource.get(key) || []) linked.set(text(row.id || row.transaction_code), row);
    }
    const directId = transactionById.get(text(payment.ledger_transaction_id));
    if (directId) linked.set(text(directId.id || directId.transaction_code), directId);
    const directCode = transactionByCode.get(text(payment.ledger_transaction_code));
    if (directCode) linked.set(text(directCode.id || directCode.transaction_code), directCode);

    if (linked.size === 0) {
      const key = `${text(payment.project_id)}|${text(payment.payment_date).slice(0, 10)}`;
      const sameDayIncome = (transactionsByProjectDate.get(key) || []).filter(isIncomeTransaction);
      const exact = sameDayIncome.filter((row) => Math.abs(transactionAmount(row) - paymentAmount) <= 0.01);
      if (exact.length === 1) {
        linked.set(text(exact[0].id || exact[0].transaction_code), exact[0]);
        matchMode = "legacy exact";
        legacyFallbackCount += 1;
      } else if (sameDayIncome.length === 1) {
        linked.set(text(sameDayIncome[0].id || sameDayIncome[0].transaction_code), sameDayIncome[0]);
        matchMode = "legacy same-day income";
        legacyFallbackCount += 1;
      } else {
        matchMode = "unlinked";
      }
    }

    const ledgerAmount = [...linked.values()].reduce((sum, row) => sum + transactionAmount(row), 0);
    linkedLedgerTotal += ledgerAmount;
    if (Math.abs(ledgerAmount - paymentAmount) > 0.01) {
      ledgerPaymentMismatches.push({
        paymentCode: text(payment.payment_code),
        projectCode: projectLabel(projectById.get(text(payment.project_id))),
        paymentAmount: round(paymentAmount),
        ledgerAmount: round(ledgerAmount),
        difference: round(ledgerAmount - paymentAmount),
        matchMode,
        linkedTransactions: [...linked.values()].map((row) => text(row.transaction_code)).filter(Boolean).slice(0, 6),
      });
    }
  }

  return {
    paymentWithoutInvoice: {
      count: paymentsWithoutInvoice.length,
      amount: round(paymentsWithoutInvoice.reduce((sum, row) => sum + num(row.unallocated), 0)),
      sample: paymentsWithoutInvoice.sort((a, b) => num(b.unallocated) - num(a.unallocated)).slice(0, 12),
    },
    invoiceWithoutAllocation: {
      count: invoicesWithoutAllocation.length,
      amount: round(invoicesWithoutAllocation.reduce((sum, row) => sum + num(row.paidSnapshot), 0)),
      sample: invoicesWithoutAllocation.slice(0, 12),
    },
    advances: {
      count: advances.length,
      amount: round(advances.reduce((sum, row) => sum + num(row.unallocated), 0)),
      sample: advances.sort((a, b) => num(b.unallocated) - num(a.unallocated)).slice(0, 12),
    },
    invoiceDueMismatch: {
      count: invoiceDueMismatches.length,
      amount: round(invoiceDueMismatches.reduce((sum, row) => sum + num(row.difference), 0)),
      sample: invoiceDueMismatches.slice(0, 12),
    },
    paymentSnapshotMismatch: {
      count: paymentSnapshotMismatches.length,
      amount: round(paymentSnapshotMismatches.reduce((sum, row) => sum + Math.abs(num(row.storedAllocated) - num(row.allocated)) + Math.abs(num(row.storedUnallocated) - num(row.unallocated)), 0)),
      sample: paymentSnapshotMismatches.slice(0, 12),
    },
    adjustmentMismatch: {
      count: adjustmentMismatches.length,
      amount: round(adjustmentMismatches.reduce((sum, row) => sum + num(row.amount), 0)),
      sample: adjustmentMismatches.slice(0, 12),
    },
    completedWithDue: {
      count: completedWithDue.length,
      amount: round(completedWithDue.reduce((sum, row) => sum + row.due, 0)),
      sample: completedWithDue.slice(0, 12),
    },
    ledgerVsBilling: {
      billingPaymentTotal: round(billingPaymentTotal),
      linkedLedgerTotal: round(linkedLedgerTotal),
      difference: round(linkedLedgerTotal - billingPaymentTotal),
      mismatchCount: ledgerPaymentMismatches.length,
      legacyFallbackCount,
      sample: ledgerPaymentMismatches.sort((a, b) => Math.abs(num(b.difference)) - Math.abs(num(a.difference))).slice(0, 12),
    },
    totals: {
      invoices: invoices.length,
      allocations: allocations.length,
      effectiveProjectPayments: effectivePayments.length,
      adjustments: adjustments.length,
      completedProjects: projects.filter((row) => normalized(row.lifecycle_phase) === "completed").length,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin", "manager"].includes(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Admin or Manager finance access is required." }, { status: 403 });
    }

    const oidc = await getVercelOidcToken({ audience: OIDC_AUDIENCE });
    if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

    const [response, reconciliation] = await Promise.all([
      fetch(HEALTH_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "snapshot" }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }),
      billingV2Reconciliation(),
    ]);
    const json = await response.json().catch(() => null) as any;
    if (!response.ok || !json?.success) {
      throw new Error(String(json?.error || `Finance health service returned HTTP ${response.status}.`));
    }

    return NextResponse.json({ success: true, data: { ...json.data, reconciliation } }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Landview-Data": "supabase",
        "X-Landview-Module": "finance-control",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Finance Control Center.";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
