import type { ProjectTransactionV2 } from "./types";
import { buildFinanceSnapshot } from "./finance";

const num = (input: unknown) => {
  const n = Number(String(input ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function legacyChequeStatus(row: any): ProjectTransactionV2["chequeStatus"] {
  if (String(row?.category || "").toLowerCase() !== "cheque") return "not_applicable";
  const memo = String(row?.memo || "");
  return /^CHEQUE_STATUS:ON_HOLD/i.test(memo) ? "on_hold" : "cleared";
}

export function legacyEntriesToTransactions(projectId: string, entries: any[]): ProjectTransactionV2[] {
  return (Array.isArray(entries) ? entries : []).flatMap((row: any) => {
    const income = num(row?.debit);
    const expense = num(row?.credit);
    if ((income > 0) === (expense > 0)) return [];

    const transactionType = income > 0 ? "income" : "expense";
    const category = String(row?.category || "");
    const paymentMethod: ProjectTransactionV2["paymentMethod"] =
      category.toLowerCase() === "cheque"
        ? "cheque"
        : category.toLowerCase() === "bank transfer"
          ? "bank_transfer"
          : "cash";

    return [{
      id: String(row?.id || crypto.randomUUID()),
      projectId,
      serialNo: row?.serial_no == null ? null : num(row.serial_no),
      transactionDate: String(row?.entry_date || ""),
      transactionType,
      amount: income > 0 ? income : expense,
      partyId: null,
      category: category || null,
      paymentMethod,
      chequeStatus: legacyChequeStatus(row),
      bankName: row?.bank_name || null,
      referenceNo: row?.reference_no || null,
      referenceType: row?.source_type || null,
      referenceId: row?.source_id || null,
      details: String(row?.details || "Legacy Project Management entry"),
      memo: row?.memo || null,
      approvalStatus: "approved",
    } satisfies ProjectTransactionV2];
  });
}

export function reconcileLegacyWorkspace(data: any) {
  const projectId = String(data?.selectedProject?.id || "");
  const transactions = legacyEntriesToTransactions(projectId, data?.entries || []);
  const v2 = buildFinanceSnapshot({
    transactions,
    supplierMovements: [],
    contractorBills: [],
    supplierPartyIds: [],
    contractorPartyIds: [],
  });

  const v1CashBalance = num(data?.summary?.engShajivBalance);
  const v1ChequeOnHold = num(data?.summary?.chequeOnHold);

  return {
    transactions,
    v1: {
      cashBalance: v1CashBalance,
      chequeOnHold: v1ChequeOnHold,
      totalDeposit: num(data?.totals?.debit),
      totalExpense: num(data?.totals?.credit),
      supplierAdvance: num(data?.summary?.supplierAdvance),
      contractorAdvance: num(data?.contractorBills?.totals?.advance),
      contractorPayable: num(data?.contractorBills?.totals?.balancePayable),
    },
    v2,
    cashDifference: v2.projectCashBalance - v1CashBalance,
    chequeDifference: v2.chequeOnHold - v1ChequeOnHold,
  };
}
