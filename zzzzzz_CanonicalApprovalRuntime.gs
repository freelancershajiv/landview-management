/* LAND VIEW — CANONICAL APPROVAL + CONCURRENCY RUNTIME
 *
 * Final finance runtime safeguards:
 * - Retires September-2026 seed-on-read behavior.
 * - Keeps billing writes off the long-running ledger ScriptLock.
 * - Makes full reconciliation skip quickly when another sync owns the lock.
 * - Posts an approved payment/expense to the journal with a short targeted update.
 * - Treats EMP-0001 "Mark Seen" as acknowledgement only; it never changes
 *   Approval_Status / Approved_By / Approved_At and never rebuilds the ledger.
 */

ensureSeptember2026PendingExpensesCore_ = function() { return 0; };
ensureSeptember2026IncomeCore_ = function() { return 0; };
ensureSeptember2026PersonalIncomeCore_ = function() { return 0; };

/*
 * Billing idempotency needs serialization, but it must not compete with the
 * ScriptLock used by the periodic accounting reconciliation. A UserLock keeps
 * repeated writes from the same web-app execution identity serialized without
 * being blocked for 30 seconds by a ledger rebuild.
 */
lvCanonicalGuardMutation_ = function(kind, params, callback) {
  const key = lvCanonicalMutationKey_(kind, params);
  const cacheKey = "LV_MUT_" + kind + "_" + key;
  const lock = LockService.getUserLock();
  if (!lock.tryLock(4000)) {
    throw new Error("Another billing write is still finishing. Refresh Billing before trying again so you do not duplicate a transaction.");
  }
  try {
    const cache = CacheService.getScriptCache();
    const prior = cache.get(cacheKey);
    if (prior) {
      try {
        const parsed = JSON.parse(prior);
        if (parsed && typeof parsed === "object") {
          parsed.deduplicated = true;
          return parsed;
        }
      } catch (ignore) {}
    }
    const result = callback(key);
    try { cache.put(cacheKey, JSON.stringify(result), 120); } catch (ignore) {}
    return result;
  } finally {
    lock.releaseLock();
  }
};

/*
 * Full reconciliation remains the safety net used by the scheduled trigger.
 * Do not queue behind another reconciliation: the next five-minute run will
 * reconcile anything that was skipped. This removes user-visible lock timeouts.
 */
syncLandViewIncomeExpenseLedger = function() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(750)) {
    return {
      success: true,
      skipped: true,
      busy: true,
      message: "Ledger reconciliation is already running; this run was skipped safely."
    };
  }
  try {
    const ss = getFinanceDatabase_();
    const accounts = landViewLedgerAccountRows_(ss);
    const payments = landViewLedgerRecords_(ss.getSheetByName("Payments"));
    const expenses = landViewLedgerRecords_(ss.getSheetByName("Expenses"));
    const transfers = landViewLedgerRecords_(ss.getSheetByName("Transfers"));
    let transactions = [];

    payments.forEach(function(payment) {
      const transaction = landViewLedgerPaymentTransaction_(payment, accounts);
      if (transaction) transactions.push(transaction);
    });
    expenses.forEach(function(expense) {
      const transaction = landViewLedgerExpenseTransaction_(expense, accounts);
      if (transaction) transactions.push(transaction);
    });
    transfers.forEach(function(transfer) {
      transactions = transactions.concat(landViewLedgerTransferTransactions_(transfer, accounts));
    });

    const journal = landViewLedgerSyncTransactions_(ss, transactions);
    const balances = landViewLedgerRecalculateAccounts_(ss);
    SpreadsheetApp.flush();
    return {
      success: true,
      data: {
        payments: payments.length,
        expenses: expenses.length,
        transfers: transfers.length,
        journal: journal,
        balances: balances,
        syncedAt: new Date().toISOString()
      }
    };
  } finally {
    lock.releaseLock();
  }
};

function lvCanonicalApprovalTarget_(params) {
  let key = String((params && (params.approvalKey || params.Approval_Key)) || "").trim();
  let source = String((params && (params.source || params.Source)) || "").trim().toLowerCase();
  let id = String((params && (params.id || params.Source_ID || params.Expense_ID || params.Payment_ID || params.Approval_ID)) || "").trim();
  if (key && key.indexOf(":") > 0) {
    const parts = key.split(":");
    source = String(parts.shift() || "").trim().toLowerCase();
    id = parts.join(":").trim();
  }
  if (source === "income") source = "payments";
  if (source === "payment") source = "payments";
  if (source === "expense") source = "expenses";
  if (source === "approval" || source === "personal") source = "approvals";
  return { source: source, id: id };
}

function lvCanonicalFindRecordRow_(sheet, idHeader, id) {
  if (!sheet) throw new Error("Finance worksheet was not found.");
  const width = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(value) {
    return String(value || "").trim();
  });
  const idIndex = headers.indexOf(idHeader);
  if (idIndex < 0 || sheet.getLastRow() < 2) throw new Error("Finance record was not found.");
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i][idIndex] || "").trim() !== id) continue;
    const record = {};
    headers.forEach(function(header, index) { if (header) record[header] = values[i][index]; });
    return { headers: headers, rowIndex: i + 2, record: record };
  }
  throw new Error("Finance record was not found.");
}

function lvCanonicalSetRowValue_(sheet, row, header, value) {
  const index = row.headers.indexOf(header);
  if (index >= 0) {
    sheet.getRange(row.rowIndex, index + 1).setValue(value);
    row.record[header] = value;
  }
}

/*
 * Fast journal update for one approved/rejected source record. This is used by
 * interactive approvals so the UI does not wait for a full ledger rebuild.
 */
function lvCanonicalPostApprovalToLedgerNow_(source, id) {
  if (["payments", "expenses"].indexOf(source) < 0 || !id) {
    return { posted: false, skipped: true, reason: "non-business approval" };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(750)) {
    return { posted: false, deferred: true, reason: "ledger reconciliation busy" };
  }

  try {
    const ss = getFinanceDatabase_();
    const sourceSheetName = source === "payments" ? "Payments" : "Expenses";
    const idHeader = source === "payments" ? "Payment_ID" : "Expense_ID";
    const sourceSheet = ss.getSheetByName(sourceSheetName);
    const sourceRow = lvCanonicalFindRecordRow_(sourceSheet, idHeader, id);
    const accounts = landViewLedgerAccountRows_(ss);
    const transaction = source === "payments"
      ? landViewLedgerPaymentTransaction_(sourceRow.record, accounts)
      : landViewLedgerExpenseTransaction_(sourceRow.record, accounts);
    const transactionId = (source === "payments" ? "TXN-PAY-" : "TXN-EXP-") + id;

    const transactionSheet = ss.getSheetByName("Transactions");
    if (!transactionSheet) throw new Error('Finance worksheet "Transactions" was not found.');
    const headers = landViewLedgerEnsureHeaders_(transactionSheet, LAND_VIEW_FINANCE_SETUP_SHEETS_["Transactions"]);
    const transactionIdIndex = headers.indexOf("Transaction_ID");
    let existingRow = -1;

    if (transactionSheet.getLastRow() > 1 && transactionIdIndex >= 0) {
      const ids = transactionSheet.getRange(2, transactionIdIndex + 1, transactionSheet.getLastRow() - 1, 1).getDisplayValues();
      for (let i = 0; i < ids.length; i += 1) {
        if (String(ids[i][0] || "").trim() === transactionId) {
          existingRow = i + 2;
          break;
        }
      }
    }

    if (transaction) {
      const values = headers.map(function(header) {
        return transaction[header] === undefined ? "" : transaction[header];
      });
      if (existingRow > 0) {
        transactionSheet.getRange(existingRow, 1, 1, headers.length).setValues([values]);
      } else {
        transactionSheet.appendRow(values);
      }
    } else if (existingRow > 0) {
      transactionSheet.deleteRow(existingRow);
    }

    const balances = landViewLedgerRecalculateAccounts_(ss);
    SpreadsheetApp.flush();
    return {
      posted: !!transaction,
      removed: !transaction && existingRow > 0,
      transactionId: transactionId,
      balances: balances
    };
  } finally {
    lock.releaseLock();
  }
}

function lvCanonicalAcknowledgeMasterAdminPayment_(params) {
  const session = chairmanApprovalSessionCore_(params || {});
  if (!chairmanIdentityMatches_(session)) {
    throw new Error("Payment acknowledgement is restricted to EMP-0001.");
  }

  const target = lvCanonicalApprovalTarget_(params || {});
  if (target.source !== "payments" || !target.id) throw new Error("Payment ID is required.");

  const sheet = getFinanceDatabase_().getSheetByName("Payments");
  const row = lvCanonicalFindRecordRow_(sheet, "Payment_ID", target.id);
  const currentStatus = String(row.record.Approval_Status || row.record.Status || "").trim();
  if (currentStatus.toLowerCase() !== "approved") {
    throw new Error("Only an already-approved Master Admin payment can be acknowledged.");
  }

  const now = new Date().toISOString();
  const note = String((params && (params.note || params.Review_Notes)) || "Seen by EMP-0001 — Master Admin payment acknowledgement.").trim();
  lvCanonicalSetRowValue_(sheet, row, "Reviewed_By", "EMP-0001");
  lvCanonicalSetRowValue_(sheet, row, "Reviewed_At", now);
  lvCanonicalSetRowValue_(sheet, row, "Review_Notes", note);
  lvCanonicalSetRowValue_(sheet, row, "Updated_At", now);
  SpreadsheetApp.flush();

  try { auditSecurityEvent_(session, "FINANCE_ACKNOWLEDGEMENT", "payments:" + target.id, "SEEN", note); } catch (error) {}

  return {
    success: true,
    data: {
      Approval_Key: "payments:" + target.id,
      Source_ID: target.id,
      Status: currentStatus,
      Approval_Status: currentStatus,
      Reviewed_By: "EMP-0001",
      Reviewed_At: now,
      acknowledgementOnly: true
    }
  };
}

function lvCanonicalMasterAdminAutoApprovePayment_(params) {
  const session = chairmanApprovalSessionCore_(params || {});
  if (!isAdminRole(session.role)) throw new Error("Master Admin approval requires an admin session.");

  const target = lvCanonicalApprovalTarget_(params || {});
  if (target.source !== "payments" || !target.id) throw new Error("Payment ID is required.");

  const sheet = getFinanceDatabase_().getSheetByName("Payments");
  const row = lvCanonicalFindRecordRow_(sheet, "Payment_ID", target.id);
  const now = new Date().toISOString();
  const reviewer = String(session.userId || session.username || "Master Admin").trim() || "Master Admin";
  const note = String((params && (params.note || params.Review_Notes)) || "Auto-approved by Master Admin. Awaiting EMP-0001 acknowledgement.").trim();

  lvCanonicalSetRowValue_(sheet, row, "Approval_Status", "Approved");
  lvCanonicalSetRowValue_(sheet, row, "Reviewed_By", reviewer);
  lvCanonicalSetRowValue_(sheet, row, "Reviewed_At", now);
  lvCanonicalSetRowValue_(sheet, row, "Review_Notes", note);
  lvCanonicalSetRowValue_(sheet, row, "Approved_By", "Master Admin");
  lvCanonicalSetRowValue_(sheet, row, "Approved_At", now);
  lvCanonicalSetRowValue_(sheet, row, "Updated_At", now);
  SpreadsheetApp.flush();

  let ledger = { posted: false, deferred: true };
  try { ledger = lvCanonicalPostApprovalToLedgerNow_("payments", target.id); } catch (error) {
    ledger = { posted: false, deferred: true, error: error && error.message ? error.message : String(error) };
  }

  try { auditSecurityEvent_(session, "MASTER_ADMIN_PAYMENT_APPROVAL", "payments:" + target.id, "APPROVED", note); } catch (error) {}

  return {
    success: true,
    data: {
      Approval_Key: "payments:" + target.id,
      Source_ID: target.id,
      Payment_ID: target.id,
      Status: "Approved",
      Approval_Status: "Approved",
      Reviewed_By: reviewer,
      Reviewed_At: now,
      Approved_By: "Master Admin",
      Approved_At: now,
      Acknowledgement_Status: "Unseen",
      Ledger_Posted: !!ledger.posted,
      Ledger_Deferred: !!ledger.deferred
    },
    ledger: ledger
  };
}

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
  const acknowledgeOnly = params && (params.acknowledgeOnly === true || String(params.acknowledgeOnly || "").toLowerCase() === "true");
  if (acknowledgeOnly) return lvCanonicalAcknowledgeMasterAdminPayment_(params);

  const masterAdminAutoApproval = params && (params.masterAdminAutoApproval === true || String(params.masterAdminAutoApproval || "").toLowerCase() === "true");
  if (masterAdminAutoApproval) return lvCanonicalMasterAdminAutoApprovePayment_(params);

  const result = LV_CANONICAL_BASE_REVIEW_FINANCE_APPROVAL_(params);
  const target = lvCanonicalApprovalTarget_(params || {});
  try {
    result.ledger = lvCanonicalPostApprovalToLedgerNow_(target.source, target.id);
  } catch (error) {
    result.ledger = { posted: false, deferred: true, error: error && error.message ? error.message : String(error) };
  }
  return result;
};
