/* LAND VIEW — CANONICAL APPROVAL RUNTIME
 *
 * Retires the September-2026 seed-on-read behavior. Approval screens now read
 * existing canonical records only. Reviewing an item immediately resyncs the
 * Transactions/Accounts ledger after the status change.
 */

ensureSeptember2026PendingExpensesCore_ = function() { return 0; };
ensureSeptember2026IncomeCore_ = function() { return 0; };
ensureSeptember2026PersonalIncomeCore_ = function() { return 0; };

getChairmanFinanceApprovalsCore_ = function(params) {
  chairmanApprovalSessionCore_(params);

  const expenses = readSheet(CONFIG.SHEETS.EXPENSES).map(financeApprovalFromExpenseCore_);
  const payments = readSheet(CONFIG.SHEETS.PAYMENTS).map(financeApprovalFromPaymentCore_);
  const personal = readSheet(CONFIG.SHEETS.APPROVALS)
    .filter(function(row) {
      const type = String(firstValue(row, ["Transaction_Type", "Approval_Type", "Approval Type"]) || "").trim().toLowerCase();
      return type === "personal income" || type === "personal draw";
    })
    .map(financeApprovalFromPersonalCore_);

  const data = expenses.concat(payments, personal).sort(function(a, b) {
    const ad = new Date(String(a.Transaction_Date || 0)).getTime() || 0;
    const bd = new Date(String(b.Transaction_Date || 0)).getTime() || 0;
    if (ad !== bd) return bd - ad;
    return String(a.Approval_Key || "").localeCompare(String(b.Approval_Key || ""));
  });

  return { success: true, data: data };
};

var LV_CANONICAL_BASE_REVIEW_FINANCE_APPROVAL_ = reviewChairmanFinanceApprovalCore_;
reviewChairmanFinanceApprovalCore_ = function(params) {
  const result = LV_CANONICAL_BASE_REVIEW_FINANCE_APPROVAL_(params);
  try {
    if (typeof syncLandViewIncomeExpenseLedger === "function") syncLandViewIncomeExpenseLedger();
  } catch (error) {
    console.log("Canonical ledger resync after approval failed: " + (error && error.message ? error.message : error));
  }
  return result;
};
