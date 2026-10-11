import type {
  ContractorBillV2,
  ProjectFinanceSnapshotV2,
  ProjectTransactionV2,
  SupplierMovementV2,
} from "./types";

const value = (input: unknown) => {
  const n = Number(input ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function clearedIncome(transactions: ProjectTransactionV2[]) {
  return transactions.reduce((sum, row) => {
    if (row.transactionType !== "income") return sum;
    if (row.approvalStatus !== "approved") return sum;
    if (row.paymentMethod === "cheque" && row.chequeStatus !== "cleared") return sum;
    return sum + value(row.amount);
  }, 0);
}

export function cashExpense(transactions: ProjectTransactionV2[]) {
  return transactions.reduce((sum, row) => {
    if (row.transactionType !== "expense") return sum;
    if (row.approvalStatus !== "approved") return sum;
    return sum + value(row.amount);
  }, 0);
}

export function chequeOnHold(transactions: ProjectTransactionV2[]) {
  return transactions.reduce((sum, row) => {
    if (row.transactionType !== "income") return sum;
    if (row.approvalStatus !== "approved") return sum;
    if (row.paymentMethod !== "cheque" || row.chequeStatus !== "on_hold") return sum;
    return sum + value(row.amount);
  }, 0);
}

export function supplierAcceptedValue(movements: SupplierMovementV2[]) {
  return movements.reduce((sum, row) => {
    const amount = value(row.value);
    if (row.movementType === "delivery") return sum + amount;
    if (row.movementType === "return") return sum - amount;
    return sum + amount;
  }, 0);
}

export function partyPayments(transactions: ProjectTransactionV2[], partyId: string) {
  return transactions.reduce((sum, row) => {
    if (row.transactionType !== "expense") return sum;
    if (row.approvalStatus !== "approved") return sum;
    if (row.partyId !== partyId) return sum;
    return sum + value(row.amount);
  }, 0);
}

export function certifiedContractorWork(bills: ContractorBillV2[], partyId: string) {
  return bills.reduce((sum, row) => {
    if (row.partyId !== partyId || row.status !== "certified") return sum;
    return sum + value(row.certifiedAmount);
  }, 0);
}

export function buildFinanceSnapshot(input: {
  transactions: ProjectTransactionV2[];
  supplierMovements: SupplierMovementV2[];
  contractorBills: ContractorBillV2[];
  supplierPartyIds: string[];
  contractorPartyIds: string[];
}): ProjectFinanceSnapshotV2 {
  const totalClearedIncome = clearedIncome(input.transactions);
  const totalCashExpense = cashExpense(input.transactions);

  let supplierAdvance = 0;
  let supplierPayable = 0;
  for (const partyId of input.supplierPartyIds) {
    const paid = partyPayments(input.transactions, partyId);
    const accepted = supplierAcceptedValue(input.supplierMovements.filter((row) => row.partyId === partyId));
    supplierAdvance += Math.max(0, paid - accepted);
    supplierPayable += Math.max(0, accepted - paid);
  }

  let contractorAdvance = 0;
  let contractorPayable = 0;
  for (const partyId of input.contractorPartyIds) {
    const paid = partyPayments(input.transactions, partyId);
    const certified = certifiedContractorWork(input.contractorBills, partyId);
    contractorAdvance += Math.max(0, paid - certified);
    contractorPayable += Math.max(0, certified - paid);
  }

  return {
    totalClearedIncome,
    totalCashExpense,
    projectCashBalance: totalClearedIncome - totalCashExpense,
    chequeOnHold: chequeOnHold(input.transactions),
    supplierAdvance,
    supplierPayable,
    contractorAdvance,
    contractorPayable,
  };
}
