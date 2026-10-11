import { selectRows } from "@/lib/supabase-data";

type Row = Record<string, any>;

export const supplierNum = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
export const supplierClean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);

export function supplierChequeStatus(row: Row) {
  const structured = supplierClean(row?.cheque_status, 30).toLowerCase();
  if (["on_hold", "cashed", "bounced", "cancelled"].includes(structured)) return structured;
  if (supplierClean(row?.category, 80).toLowerCase() !== "cheque") return "";
  return /^CHEQUE_STATUS:ON_HOLD/i.test(String(row?.memo || "")) ? "on_hold" : "cashed";
}

export function supplierHeldCheque(row: Row) {
  return supplierNum(row?.debit) > 0 && supplierChequeStatus(row) === "on_hold";
}

export function supplierMovement(row: Row) {
  return supplierClean(row?.supplier_movement_type, 40).toLowerCase();
}

export function supplierAdvanceApplied(row: Row) {
  return Math.max(0, Math.min(supplierNum(row?.credit), supplierNum(row?.supplier_advance_applied)));
}

export function supplierCashExpenseForRows(rows: Row[]) {
  return rows.reduce((sum, row) => {
    const movement = supplierMovement(row);
    if (movement === "delivery" || movement === "refund") return sum;
    if (movement === "advance_fund") return sum + (supplierHeldCheque(row) ? 0 : supplierNum(row.debit));
    if (movement === "direct_purchase") return sum + Math.max(0, supplierNum(row.credit) - supplierAdvanceApplied(row));
    return sum + supplierNum(row.credit);
  }, 0);
}

export function supplierCashIncomeForRows(rows: Row[]) {
  return rows.reduce((sum, row) => sum + (supplierHeldCheque(row) ? 0 : supplierNum(row.debit)), 0);
}

function movementAmount(row: Row) {
  return supplierNum(row.debit) > 0 ? supplierNum(row.debit) : supplierNum(row.credit);
}

export async function supplierWorkspaceForProject(projectId: string, projectCode = "") {
  const [accounts, rows, contracts] = await Promise.all([
    selectRows("project_supplier_accounts", { filters: { project_id: projectId }, order: "supplier_name:asc", limit: 1000 }),
    selectRows("project_management_ledger", { filters: { project_id: projectId }, order: "entry_date:asc", limit: 20000 }),
    selectRows("project_contractor_contracts", { filters: { project_id: projectId }, order: "category:asc", limit: 2000 }),
  ]);

  const recordedFunds = rows.reduce((sum: number, row: Row) => sum + supplierNum(row.debit), 0);
  const chequeOnHold = rows.reduce((sum: number, row: Row) => sum + (supplierHeldCheque(row) ? supplierNum(row.debit) : 0), 0);
  const cashIncome = supplierCashIncomeForRows(rows);
  const recognizedExpense = rows.reduce((sum: number, row: Row) => sum + supplierNum(row.credit), 0);
  const cashExpense = supplierCashExpenseForRows(rows);
  const cashBalance = cashIncome - cashExpense;

  const supplierAccounts = accounts.map((account: Row) => {
    const accountRows = rows.filter((row: Row) => String(row.supplier_account_id || "") === String(account.id));
    const accountContracts = contracts.filter((contract: Row) => String(contract.supplier_account_id || "") === String(account.id));
    const categories = Array.from(new Set(accountContracts.map((contract: Row) => supplierClean(contract.category, 120)).filter(Boolean)));

    let advanceFund = 0;
    let advanceCash = 0;
    let directPurchase = 0;
    let directPurchaseCash = 0;
    let advanceApplied = 0;
    let deliveryValue = 0;
    let deliveredValue = 0;
    let deliveredQuantity = 0;
    let refunded = 0;

    for (const row of accountRows) {
      const movement = supplierMovement(row);
      if (movement === "advance_fund" && !supplierHeldCheque(row)) advanceFund += supplierNum(row.debit);
      if (movement === "advance_cash") advanceCash += supplierNum(row.credit);
      if (movement === "direct_purchase") {
        const value = supplierNum(row.credit);
        const applied = supplierAdvanceApplied(row);
        directPurchase += value;
        advanceApplied += applied;
        directPurchaseCash += Math.max(0, value - applied);
        deliveredValue += value;
        deliveredQuantity += supplierNum(row.sft);
      }
      if (movement === "delivery") {
        const value = supplierNum(row.credit);
        deliveryValue += value;
        deliveredValue += value;
        deliveredQuantity += supplierNum(row.sft);
      }
      if (movement === "refund") refunded += movementAmount(row);
    }

    const fundedAdvance = Math.max(0, advanceFund + advanceCash - refunded);
    const advanceEligibleValue = deliveryValue + advanceApplied;
    const netSupplierPosition = fundedAdvance - advanceEligibleValue;
    const advance = Math.max(0, netSupplierPosition);
    const payable = Math.max(0, -netSupplierPosition);
    const payments = Math.max(0, advanceFund + advanceCash + directPurchaseCash - refunded);
    const heldCheque = accountRows.reduce((sum: number, row: Row) => sum + (supplierHeldCheque(row) ? supplierNum(row.debit) : 0), 0);

    const movements = accountRows.slice().sort((a: Row, b: Row) => {
      const d = String(b.entry_date || "").localeCompare(String(a.entry_date || ""));
      if (d) return d;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    }).map((row: Row) => {
      const applied = supplierAdvanceApplied(row);
      const movement = supplierMovement(row) || "unclassified";
      const cashAmount = movement === "advance_fund"
        ? (supplierHeldCheque(row) ? 0 : supplierNum(row.debit))
        : movement === "delivery" || movement === "refund"
          ? 0
          : movement === "direct_purchase"
            ? Math.max(0, supplierNum(row.credit) - applied)
            : supplierNum(row.credit);
      return {
        id: row.id,
        serialNo: supplierNum(row.serial_no),
        date: row.entry_date,
        movementType: movement,
        details: row.details || "",
        category: row.category || "",
        quantity: supplierNum(row.sft),
        rate: supplierNum(row.rate),
        debit: supplierNum(row.debit),
        credit: supplierNum(row.credit),
        amount: movementAmount(row),
        advanceApplied: applied,
        cashAmount,
        paymentMethod: row.payment_method || "",
        chequeStatus: supplierChequeStatus(row),
        receivedFrom: row.received_from || "",
        paidTo: row.paid_to || row.supplier || "",
        memo: row.memo || "",
        createdBy: row.created_by || "",
      };
    });

    return {
      id: account.id,
      supplierName: account.supplier_name,
      primaryCategory: account.primary_category || categories[0] || "Other Expenses",
      categories,
      billingUnit: account.billing_unit || accountContracts[0]?.billing_unit || "Unit",
      active: Boolean(account.active),
      notes: account.notes || "",
      payments,
      advanceFund,
      advanceCash,
      directPurchase,
      directPurchaseCash,
      advanceApplied,
      deliveryValue,
      refunded,
      deliveredValue,
      deliveredQuantity,
      advance,
      payable,
      heldCheque,
      movementCount: movements.length,
      movements,
    };
  });

  const activeAccounts = supplierAccounts.filter((account: Row) => account.active);
  const supplierAdvance = activeAccounts.reduce((sum: number, account: Row) => sum + supplierNum(account.advance), 0);
  const supplierPayable = activeAccounts.reduce((sum: number, account: Row) => sum + supplierNum(account.payable), 0);
  const totalPayments = activeAccounts.reduce((sum: number, account: Row) => sum + supplierNum(account.payments), 0);
  const totalDeliveredValue = activeAccounts.reduce((sum: number, account: Row) => sum + supplierNum(account.deliveredValue), 0);
  const liquidPosition = cashBalance + supplierAdvance - supplierPayable;

  return {
    projectId,
    projectCode,
    accounts: activeAccounts,
    allAccounts: supplierAccounts,
    summary: {
      accountCount: activeAccounts.length,
      recordedFunds,
      cashIncome,
      recognizedExpense,
      cashExpense,
      cashOutflow: cashExpense,
      cashBalance,
      chequeOnHold,
      supplierAdvance,
      supplierPayable,
      totalPayments,
      totalDeliveredValue,
      liquidPosition,
    },
  };
}
