export * from "./supabase-data-original";

import {
  handleLandviewDataAction as handleBaseLandviewDataAction,
  selectRows,
} from "./supabase-data-original";
import type { WorkspaceUser } from "./supabase-data-original";

type Row = Record<string, any>;

type BillingCategory = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function categoryOf(row: Row): BillingCategory {
  const raw = text(
    row.billing_category || row.Billing_Category ||
    row.income_category || row.Income_Category ||
    row.category || row.Category ||
    row.payment_for || row.Payment_For ||
    row.description || row.Description,
  ).toLowerCase();
  if (/supervision/.test(raw)) return "Supervision Bill";
  if (/other|soil|survey|municipality|file pass/.test(raw)) return "Other Services Bill";
  return "Engineering Bill";
}

function isLinkedHistoricalSettlement(row: Row) {
  if (row.affects_business_balance !== false) return false;
  if (normalized(row.transaction_type) === "personal income") return false;
  if (!text(row.ledger_transaction_id) && !text(row.ledger_transaction_code)) return false;

  // Older raw ledger mirror rows were never client-payment records. New linked
  // historical receipts use HIST-PAY-* and point at the authoritative ledger row.
  const code = text(row.payment_code).toUpperCase();
  if (code.startsWith("TXN-HIST-") || code.startsWith("TXN-LEDGER-")) return false;

  const status = normalized(row.approval_status || row.status);
  return !status || [
    "approved", "received", "paid", "verified", "complete", "completed",
    "full paid", "fully paid", "posted",
  ].includes(status);
}

function emptyCategory() {
  return { gross: 0, discount: 0, billed: 0, paid: 0, due: 0 };
}

async function addLinkedHistoricalSettlementsToBillingBook(base: Row) {
  const [payments, projects] = await Promise.all([
    selectRows("payments", { limit: 5000 }),
    selectRows("projects", { limit: 5000 }),
  ]);
  const missing = payments.filter(isLinkedHistoricalSettlement);
  if (!missing.length) return base;

  const projectCodeById = new Map(projects.map((project) => [text(project.id), text(project.project_code)]));
  const rows: Row[] = Array.isArray(base?.projects)
    ? base.projects.map((project: Row) => ({
        ...project,
        categories: Object.fromEntries(
          Object.entries(project.categories || {}).map(([key, value]) => [key, { ...(value as Row) }]),
        ),
      }))
    : [];
  const byCode = new Map(rows.map((project) => [text(project.projectId), project]));

  let counted = 0;
  for (const payment of missing) {
    const projectCode = projectCodeById.get(text(payment.project_id));
    const project = projectCode ? byCode.get(projectCode) : undefined;
    if (!project) continue;

    const paid = Math.abs(num(payment.amount));
    if (!(paid > 0)) continue;
    const category = categoryOf(payment);
    const categoryRow = { ...emptyCategory(), ...(project.categories?.[category] || {}) };
    categoryRow.paid = num(categoryRow.paid) + paid;
    categoryRow.due = Math.max(0, num(categoryRow.billed) - categoryRow.paid);
    project.categories = { ...(project.categories || {}), [category]: categoryRow };
    project.paid = num(project.paid) + paid;
    project.due = Math.max(0, num(project.billed) - project.paid);
    counted += 1;
  }

  const categoryTotals = new Map<string, Row>();
  for (const project of rows) {
    for (const [category, valuesRaw] of Object.entries(project.categories || {})) {
      const values = valuesRaw as Row;
      const total = categoryTotals.get(category) || { category, ...emptyCategory() };
      total.gross += num(values.gross);
      total.discount += num(values.discount);
      total.billed += num(values.billed);
      total.paid += num(values.paid);
      total.due += num(values.due);
      categoryTotals.set(category, total);
    }
  }

  const totals = rows.reduce(
    (sum, project) => ({
      gross: sum.gross + num(project.gross),
      discount: sum.discount + num(project.discount),
      billed: sum.billed + num(project.billed),
      paid: sum.paid + num(project.paid),
      due: sum.due + num(project.due),
    }),
    { gross: 0, discount: 0, billed: 0, paid: 0, due: 0 },
  );

  return {
    ...base,
    totals,
    categories: [...categoryTotals.values()],
    projects: rows,
    paymentCount: num(base?.paymentCount) + counted,
  };
}

/**
 * Billing settlement and cash-ledger posting are intentionally separate.
 * A historical payment linked to an already-existing Accounts Ledger income
 * keeps affects_business_balance=false so it cannot post a duplicate income.
 * It nevertheless settles the client's bill and therefore must reduce Finance due.
 */
export async function handleLandviewDataAction(action: string, input: Row, user: WorkspaceUser) {
  const base = await handleBaseLandviewDataAction(action, input, user);
  if (action !== "getBillingBook") return base;
  return addLinkedHistoricalSettlementsToBillingBook(base as Row);
}
