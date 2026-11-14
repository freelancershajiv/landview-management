/* LAND VIEW Finance Reconciliation V3.
 * Pure, read-only diagnostics over the authenticated Project Management snapshot.
 * This is NOT a ledger: never post, alter, approve, or infer settled amounts here.
 * Matching is deliberately conservative and never changes an allocation in Supabase.
 */
export type ReconciliationStatus = "linked"|"matched"|"suggested"|"ambiguous"|"unregistered"|"internal"|"missing"|"conflict";

export type ReconciliationPayment = {
  id: string;
  date: string;
  details: string;
  category: string;
  recipient: string;
  amount: number;
  status: ReconciliationStatus;
  party: string;
  contractId: string;
  reason: string;
};
export type ReconciliationIssue = {
  id: string;
  severity: "critical"|"review"|"info";
  kind: string;
  title: string;
  description: string;
  amount: number;
  entryId?: string;
};
export type ReconciliationParty = {
  id: string;
  name: string;
  type: "Supplier"|"Contractor";
  contracts: number;
  certified: number;
  paid: number;
  advance: number;
  payable: number;
  overCertified: number;
};
export type ReconciliationResult = {
  projectCode: string;
  expensesCount: number;
  expenseAmount: number;
  linked: number;
  matched: number;
  needsReview: number;
  needsReviewAmount: number;
  payments: ReconciliationPayment[];
  issues: ReconciliationIssue[];
  parties: ReconciliationParty[];
  balances: {
    incomeFromRows: number;
    expenseFromRows: number;
    extraAllocation: number;
    depositReported: number;
    expenseReported: number;
    chequeOnHold: number;
    chequeOnHoldFromRows: number;
    calculatedCash: number;
    reportedCash: number;
    runningCash: number|null;
    supplierAdvance: number;
    supplierAdvanceEnabled: boolean;
    certifiedBills: number;
    certifiedBillAdvance: number;
    certifiedBillPayable: number;
  };
};

type Row = Record<string, any>;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const financeNumber = (value: unknown) => {
  const result = Number(String(value ?? "").replace(/,/g,"").replace(/[^0-9.-]/g,""));
  return Number.isFinite(result) ? result : 0;
};
const key = (value: unknown) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g," ").trim().replace(/\s+/g," ");
const shortName = (value: unknown) => key(value).replace(/\b(contractor|contactor|supplier|brickfield|brick field)\b/g," ").trim().replace(/\s+/g," ");
const canonicalCategory = (value: unknown) => key(value).replace(/\band\b/g,"");
const categoryMatches = (contract: Row, category: unknown) => {
  const mine = canonicalCategory(contract.category);
  const entry = canonicalCategory(category);
  if (!mine || !entry) return false;
  if (mine === entry) return true;
  return mine === "masonry" && ["r c c masonry","finishing masonry","masonry"].includes(entry);
};
const unique = (rows: Row[]) => Array.from(new Map(rows.map(row => [String(row.id),row])).values());
const namesEqual = (a: unknown,b: unknown) => key(a) === key(b) && Boolean(key(a));
const looseNamesEqual = (a: unknown,b: unknown) => shortName(a) === shortName(b) && Boolean(shortName(a));
const internalRecipient = (name: unknown) => ["eng shajiv","land view","eng borhan"].includes(key(name));
const ordered = (a: Row,b: Row) => String(a.entry_date||"").localeCompare(String(b.entry_date||"")) ||
  financeNumber(a.serial_no)-financeNumber(b.serial_no) ||
  String(a.created_at||"").localeCompare(String(b.created_at||"")) ||
  String(a.id||"").localeCompare(String(b.id||""));

export function buildFinanceReconciliation(snapshot: Row): ReconciliationResult {
  const entries: Row[] = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  const contracts: Row[] = Array.isArray(snapshot?.contractorBills?.contracts) ? snapshot.contractorBills.contracts : [];
  const bills: Row[] = Array.isArray(snapshot?.contractorBills?.bills) ? snapshot.contractorBills.bills : [];
  const payments: ReconciliationPayment[] = [];
  const issues: ReconciliationIssue[] = [];

  for (const entry of entries) {
    const outgoing = financeNumber(entry.credit);
    if (outgoing <= 0) continue;
    const recipient = String(entry.paid_to || entry.supplier || "").trim();
    const category = String(entry.category || "").trim();
    const contractId = String(entry.contractor_contract_id || "").trim();
    const accountId = String(entry.supplier_account_id || "").trim();
    const categoryOptions = contracts.filter(contract => categoryMatches(contract,category));
    const explicitContract = contractId ? contracts.filter(contract => String(contract.id) === contractId) : [];
    const explicitSupplier = accountId ? contracts.filter(contract => String(contract.supplier_account_id||"") === accountId) : [];
    const exactNames = recipient ? contracts.filter(contract => namesEqual(contract.contractor_name,recipient)) : [];
    const exactOptions = exactNames.filter(contract => categoryMatches(contract,category));
    const relaxedOptions = recipient ? contracts.filter(contract =>
      looseNamesEqual(contract.contractor_name,recipient) && categoryMatches(contract,category)) : [];

    let status: ReconciliationStatus = "unregistered";
    let chosen: Row|undefined;
    let reason = "";
    let candidates: Row[] = [];
    if (contractId && !explicitContract.length || accountId && !explicitSupplier.length) {
      status = "conflict";
      reason = "Saved party reference does not exist in the current active contract list.";
    } else if (contractId && accountId &&
      explicitContract.length && !explicitSupplier.some(contract => String(contract.id) === contractId)) {
      status = "conflict";
      reason = "Saved supplier and contractor references point to different contracts.";
    } else if (contractId && explicitContract.length) {
      chosen = explicitContract[0];
      status = "linked";
      reason = categoryMatches(chosen,category) ? "Linked by saved contractor contract ID." :
        "Saved contract ID is linked, but the expense category differs from the contract.";
    } else if (accountId && explicitSupplier.length) {
      candidates = explicitSupplier.filter(contract => categoryMatches(contract,category));
      if (!candidates.length && explicitSupplier.length === 1) candidates = explicitSupplier;
      if (candidates.length === 1) {
        chosen = candidates[0];
        status = "linked";
        reason = categoryMatches(chosen,category) ? "Linked by saved supplier account ID." :
          "Saved supplier account is linked, but the expense category differs.";
      } else {
        status = "ambiguous";
        reason = "Supplier account has multiple possible contract records.";
      }
    } else if (internalRecipient(recipient)) {
      if (categoryOptions.length) {
        status = "suggested";
        if (categoryOptions.length === 1) chosen = categoryOptions[0];
        reason = "Internal payment in a registered party category. Verify the ultimate beneficiary before allocating.";
      } else {
        status = "internal";
        reason = "Internal or office recipient, not a registered supplier contract.";
      }
    } else if (exactOptions.length === 1) {
      chosen = exactOptions[0];
      status = "matched";
      reason = "Exact recipient and contract category match; not yet explicitly linked.";
    } else if (exactOptions.length > 1) {
      status = "ambiguous";
      candidates = exactOptions;
      reason = "More than one contract has this recipient and category.";
    } else if (relaxedOptions.length === 1) {
      chosen = relaxedOptions[0];
      status = "suggested";
      reason = "Possible alias/spelling match; confirm before linking.";
    } else if (relaxedOptions.length > 1) {
      status = "ambiguous";
      candidates = relaxedOptions;
      reason = "Multiple contracts match a normalized name.";
    } else if (exactNames.length === 1) {
      chosen = exactNames[0];
      status = "suggested";
      reason = "Recipient matches a registered party, but the category differs.";
    } else if (exactNames.length > 1) {
      status = "ambiguous";
      candidates = exactNames;
      reason = "Recipient has multiple contracts; category did not resolve the match.";
    } else if (!recipient) {
      status = "missing";
      if (categoryOptions.length === 1) {
        chosen = categoryOptions[0];
        reason = "Recipient is blank; one party uses this category. Confirm manually.";
      } else {
        reason = "Recipient is blank; select and verify the beneficiary.";
      }
    } else {
      status = "unregistered";
      reason = "Recipient is not a registered party for this category. It may be a valid other payment.";
    }

    const id = String(entry.id || "row-" + payments.length);
    const payment: ReconciliationPayment = {
      id,date:String(entry.entry_date||"").slice(0,10),details:String(entry.details||""),
      category,recipient,amount:round(outgoing),status,
      party:String(chosen?.contractor_name || ""),contractId:String(chosen?.id || ""),
      reason: candidates.length > 1 ? reason + " (" + candidates.length + " candidates)" : reason,
    };
    payments.push(payment);

    if (["conflict","missing","ambiguous","unregistered","suggested"].includes(status)) {
      issues.push({
        id:"payment-"+id,
        severity:status==="conflict"?"critical":"review",
        kind:status,
        title:status==="missing"?"Missing payment recipient":
          status==="ambiguous"?"Ambiguous contract match":
          status==="conflict"?"Broken or conflicting party link":
          status==="suggested"?"Payment needs confirmation":"Unregistered payment recipient",
        description:(recipient ? recipient+" · ":"") + payment.reason,
        amount:payment.amount,entryId:id,
      });
    } else if (status === "linked" && !categoryMatches(chosen||{},category)) {
      issues.push({
        id:"category-"+id,severity:"review",kind:"category",
        title:"Linked contract category differs",
        description:recipient+" · "+payment.reason,
        amount:payment.amount,entryId:id,
      });
    }
  }

  // A duplicate is a review candidate, never proof of an erroneous transaction.
  const duplicates = new Map<string,ReconciliationPayment[]>();
  for(const payment of payments) {
    if(!payment.details.trim()) continue;
    const signature=[payment.date,key(payment.recipient),canonicalCategory(payment.category),
      round(payment.amount),key(payment.details)].join("|");
    const group=duplicates.get(signature)||[];
    group.push(payment);
    duplicates.set(signature,group);
  }
  for(const matches of duplicates.values()) {
    if (matches.length < 2) continue;
    issues.push({
      id:"duplicate-"+matches[0].id,
      severity:"review",kind:"duplicate",title:"Potential duplicate expense",
      description:matches.length+" rows have the same date, recipient, category, amount and details. Review before changing either.",
      amount:round(matches.reduce((sum,row)=>sum+row.amount,0)),
      entryId:matches[0].id,
    });
  }

  const incomeFromRows = round(entries.reduce((sum,row)=>sum+financeNumber(row.debit),0));
  const expenseFromRows = round(entries.reduce((sum,row)=>sum+financeNumber(row.credit),0));
  const depositReported = round(financeNumber(snapshot?.totals?.debit));
  const expenseReported = round(financeNumber(snapshot?.totals?.credit));
  // Some older projects include a Sattapur deposit as a virtual cash allocation.
  // LV-157's newer route explicitly disables this rule, so do not add it there.
  const extraAllocation = snapshot?.summary?.supplierAdvanceSource === "sattapur_bricks_deposit_minus_delivery"
    ? round(financeNumber(snapshot?.sattapurBricks?.depositAmount)) : 0;
  const heldFromRows = round(entries.reduce((sum,row)=>sum+financeNumber(row.cheque_on_hold),0));
  const heldReported = round(financeNumber(snapshot?.summary?.chequeOnHold));
  const calculatedCash = round(depositReported-expenseReported-heldReported);
  const reportedCash = round(financeNumber(snapshot?.summary?.engShajivBalance));
  const orderedEntries = entries.slice().sort(ordered);
  const last = orderedEntries[orderedEntries.length-1];
  const runningCash = last && last.available_cash_balance != null ? round(financeNumber(last.available_cash_balance)) : null;
  const mismatch = (a:number,b:number) => Math.abs(round(a-b)) > .01;
  if (mismatch(incomeFromRows,depositReported)) issues.push({
    id:"totals-deposit",severity:"critical",kind:"balance",title:"Deposit total needs reconciliation",
    description:"Ledger income "+incomeFromRows.toFixed(2)+" differs from reported deposits "+depositReported.toFixed(2)+".",
    amount:round(depositReported-incomeFromRows),
  });
  if (mismatch(expenseFromRows+extraAllocation,expenseReported)) issues.push({
    id:"totals-expense",severity:"critical",kind:"balance",title:"Expense total needs reconciliation",
    description:"Ledger expenses plus configured virtual allocation "+(expenseFromRows+extraAllocation).toFixed(2)+
      " differs from reported expenses "+expenseReported.toFixed(2)+".",
    amount:round(expenseReported-expenseFromRows-extraAllocation),
  });
  if (mismatch(heldFromRows,heldReported)) issues.push({
    id:"totals-cheque",severity:"review",kind:"cheque",title:"Cheque hold total needs review",
    description:"Held cheque entries "+heldFromRows.toFixed(2)+" differ from reported cheque holds "+heldReported.toFixed(2)+".",
    amount:round(heldReported-heldFromRows),
  });
  if (mismatch(calculatedCash,reportedCash)) issues.push({
    id:"totals-cash",severity:"critical",kind:"balance",title:"Available cash differs",
    description:"Deposits − expenses − held cheques = "+calculatedCash.toFixed(2)+", but the project reports "+reportedCash.toFixed(2)+".",
    amount:round(reportedCash-calculatedCash),
  });
  if (runningCash !== null && mismatch(runningCash,reportedCash)) issues.push({
    id:"totals-running",severity:"review",kind:"balance",title:"Last running cash differs",
    description:"Last ledger running cash "+runningCash.toFixed(2)+" differs from summary cash "+reportedCash.toFixed(2)+". Check ordering and allocations.",
    amount:round(runningCash-reportedCash),
  });

  // Certified work obligations are taken from the existing contract calculator.
  // They are never recreated or booked as new expenses by this module.
  const summaryTotals = snapshot?.contractorBills?.totals || {};
  const certifiedBills = round(financeNumber(summaryTotals.certifiedAmount));
  const certifiedBillAdvance = round(financeNumber(summaryTotals.advance));
  const certifiedBillPayable = round(financeNumber(summaryTotals.balancePayable));
  const partyMap = new Map<string,ReconciliationParty>();
  for(const contract of contracts) {
    const name=String(contract.contractor_name||"").trim();
    const type:"Supplier"|"Contractor"=String(contract.party_type||"Contractor")==="Supplier"?"Supplier":"Contractor";
    if(!name)continue;
    const id=type+":"+key(name);
    const party=partyMap.get(id)||{id,name,type,contracts:0,certified:0,paid:0,advance:0,payable:0,overCertified:0};
    party.contracts++;
    party.certified+=financeNumber(contract.certifiedAmount);
    party.paid+=financeNumber(contract.paidAmount);
    party.advance+=financeNumber(contract.advance);
    party.payable+=financeNumber(contract.balancePayable);
    party.overCertified+=financeNumber(contract.overCertified);
    partyMap.set(id,party);
    if(financeNumber(contract.overCertified)>.01) issues.push({
      id:"over-cert-"+String(contract.id),severity:"review",kind:"contract",
      title:"Certified amount exceeds configured contract",
      description:name+" · "+String(contract.category||"")+" · review agreed value before further billing.",
      amount:round(financeNumber(contract.overCertified)),
    });
  }
  const parties=Array.from(partyMap.values()).map(party=>({
    ...party,certified:round(party.certified),paid:round(party.paid),
    advance:round(party.advance),payable:round(party.payable),overCertified:round(party.overCertified),
  })).sort((a,b)=>a.name.localeCompare(b.name));
  const reviewStatuses=new Set<ReconciliationStatus>(["suggested","ambiguous","unregistered","missing","conflict"]);
  const reviewPayments=payments.filter(row=>reviewStatuses.has(row.status));
  const severityRank={critical:0,review:1,info:2};
  issues.sort((a,b)=>severityRank[a.severity]-severityRank[b.severity]||b.amount-a.amount);
  return {
    projectCode:String(snapshot?.selectedProject?.projectCode||""),
    expensesCount:payments.length,expenseAmount:round(payments.reduce((s,p)=>s+p.amount,0)),
    linked:payments.filter(p=>p.status==="linked").length,
    matched:payments.filter(p=>p.status==="matched").length,
    needsReview:reviewPayments.length,needsReviewAmount:round(reviewPayments.reduce((s,p)=>s+p.amount,0)),
    payments:payments.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)),
    issues,parties,
    balances:{
      incomeFromRows,expenseFromRows,extraAllocation,depositReported,expenseReported,
      chequeOnHold:heldReported,chequeOnHoldFromRows:heldFromRows,
      calculatedCash,reportedCash,runningCash,
      supplierAdvance:round(financeNumber(snapshot?.summary?.supplierAdvance)),
      supplierAdvanceEnabled:snapshot?.summary?.supplierAdvanceSource!=="disabled",
      certifiedBills,certifiedBillAdvance,certifiedBillPayable,
    },
  };
}
