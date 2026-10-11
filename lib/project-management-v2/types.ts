export type ProjectPartyType = "supplier" | "contractor" | "other";
export type TransactionType = "income" | "expense";
export type PaymentMethod = "cash" | "cheque" | "bank_transfer" | "other";
export type ChequeStatus = "cleared" | "on_hold" | "bounced" | "not_applicable";
export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected";
export type SupplierMovementType = "delivery" | "return" | "adjustment";

export interface ProjectV2 {
  id: string;
  projectCode: string;
  projectName?: string | null;
}

export interface ProjectPartyV2 {
  id: string;
  projectId: string;
  partyType: ProjectPartyType;
  displayName: string;
  normalizedKey: string;
  phone?: string | null;
  primaryCategory?: string | null;
  active: boolean;
}

export interface ProjectTransactionV2 {
  id: string;
  projectId: string;
  serialNo?: number | null;
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  partyId?: string | null;
  category?: string | null;
  paymentMethod: PaymentMethod;
  chequeStatus: ChequeStatus;
  bankName?: string | null;
  referenceNo?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  details: string;
  memo?: string | null;
  approvalStatus: ApprovalStatus;
}

export interface SupplierMovementV2 {
  id: string;
  projectId: string;
  partyId: string;
  movementDate: string;
  movementType: SupplierMovementType;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  rate: number;
  value: number;
  details: string;
}

export interface ContractorBillV2 {
  id: string;
  projectId: string;
  partyId: string;
  contractId: string;
  billDate: string;
  certifiedAmount: number;
  status: "draft" | "certified" | "void";
}

export interface ProjectFinanceSnapshotV2 {
  totalClearedIncome: number;
  totalCashExpense: number;
  projectCashBalance: number;
  chequeOnHold: number;
  supplierAdvance: number;
  supplierPayable: number;
  contractorAdvance: number;
  contractorPayable: number;
}
