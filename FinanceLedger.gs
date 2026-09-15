/** LAND VIEW — CANONICAL FINANCE LEDGER
 *
 * Payments/Expenses/Transfers are source events.
 * Transactions is the append/upsert accounting journal.
 * Accounts balances are derived from posted Transactions.
 *
 * No legacy Income/Accounting Expenses mirrors are created or modified.
 */

function getLegacyAccountingLedger_() {
  throw new Error("Legacy accounting ledger is retired.");
}

function getLandViewFinanceLedger_() {
  return getFinanceDatabase_();
}

function landViewLedgerText_(value) {
  return String(value == null ? "" : value).trim();
}

function landViewLedgerFirst_(record, keys) {
  if (!record) return "";
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
  }
  return "";
}

function landViewLedgerNumber_(value) {
  const n = Number(String(value == null ? 0 : value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
}

function landViewLedgerRecords_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = Math.max(1, sheet.getLastColumn());
  const values = sheet.getRange(1, 1, sheet.getLastRow(), width).getValues();
  const headers = values[0].map(function(value) { return landViewLedgerText_(value); });
  return values.slice(1).map(function(row) {
    const record = {};
    headers.forEach(function(header, index) { if (header) record[header] = row[index]; });
    return record;
  }).filter(function(record) {
    return Object.keys(record).some(function(key) { return landViewLedgerText_(record[key]) !== ""; });
  });
}

function landViewLedgerPaymentEffective_(payment) {
  if (typeof lvCanonicalPaymentEffective_ === "function") return lvCanonicalPaymentEffective_(payment);
  const type = landViewLedgerText_(landViewLedgerFirst_(payment, ["Transaction_Type", "Transaction Type"])).toLowerCase();
  if (type === "personal income") return false;
  const impact = landViewLedgerText_(landViewLedgerFirst_(payment, ["Affects_Business_Balance", "Affects Business Balance"])).toLowerCase();
  if (["false", "no", "0"].indexOf(impact) >= 0) return false;
  const status = landViewLedgerText_(landViewLedgerFirst_(payment, ["Approval_Status", "Approval Status", "Status"])).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid"].indexOf(status) >= 0;
}

function landViewLedgerExpenseEffective_(expense) {
  if (typeof lvCanonicalExpenseEffective_ === "function") return lvCanonicalExpenseEffective_(expense);
  const status = landViewLedgerText_(landViewLedgerFirst_(expense, ["Approval_Status", "Approval Status", "Status"])).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "paid", "complete", "completed"].indexOf(status) >= 0;
}

function landViewLedgerTransferEffective_(transfer) {
  const status = landViewLedgerText_(landViewLedgerFirst_(transfer, ["Status", "Approval_Status", "Approval Status"])).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "completed", "complete", "posted", "transferred"].indexOf(status) >= 0;
}

function landViewLedgerEnsureHeaders_(sheet, requiredHeaders) {
  let headers = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0].map(landViewLedgerText_)
    : [];
  if (!headers.some(Boolean)) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders.slice();
  }
  requiredHeaders.forEach(function(header) {
    if (headers.indexOf(header) < 0) {
      headers.push(header);
      sheet.getRange(1, headers.length).setValue(header);
    }
  });
  return headers;
}

function landViewLedgerAccountRows_(ss) {
  const sheet = ss.getSheetByName("Accounts");
  if (!sheet) throw new Error('Finance worksheet "Accounts" was not found.');
  const headers = landViewLedgerEnsureHeaders_(sheet, LAND_VIEW_FINANCE_SETUP_SHEETS_["Accounts"]);
  return { sheet: sheet, headers: headers, records: landViewLedgerRecords_(sheet) };
}

function landViewLedgerEnsureAccount_(accountState, requested, paymentMethod) {
  const raw = landViewLedgerText_(requested);
  const method = landViewLedgerText_(paymentMethod).toLowerCase();
  const wanted = raw || (method.indexOf("cash") >= 0 ? "Cash" : "Bank Account");
  const lower = wanted.toLowerCase();
  let found = accountState.records.find(function(record) {
    return landViewLedgerText_(record.Account_ID).toLowerCase() === lower || landViewLedgerText_(record.Account_Name).toLowerCase() === lower;
  });
  if (found) return landViewLedgerText_(found.Account_ID);
  if (lower === "cash") {
    found = accountState.records.find(function(record) { return landViewLedgerText_(record.Account_ID) === "ACC-CASH"; });
    if (found) return "ACC-CASH";
  }
  if (lower === "bank" || lower === "bank account") {
    found = accountState.records.find(function(record) { return landViewLedgerText_(record.Account_ID) === "ACC-BANK"; });
    if (found) return "ACC-BANK";
  }
  const id = "ACC-" + Utilities.getUuid().split("-")[0].toUpperCase();
  const now = new Date().toISOString();
  const record = {
    Account_ID: id,
    Account_Name: wanted,
    Account_Type: method.indexOf("cash") >= 0 ? "Cash" : "Bank",
    Opening_Balance: 0,
    Current_Balance: 0,
    Currency: "BDT",
    Status: "Active",
    Notes: "Created automatically from a posted transaction.",
    Created_At: now,
    Updated_At: now
  };
  accountState.sheet.appendRow(accountState.headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
  accountState.records.push(record);
  return id;
}

function landViewLedgerPaymentTransaction_(payment, accountState) {
  if (!landViewLedgerPaymentEffective_(payment)) return null;
  const id = landViewLedgerText_(landViewLedgerFirst_(payment, ["Payment_ID", "Payment ID", "PaymentId"]));
  const amount = landViewLedgerNumber_(landViewLedgerFirst_(payment, ["Amount", "Payment_Amount", "Payment Amount"]));
  if (!id || !(amount > 0)) return null;
  const method = landViewLedgerFirst_(payment, ["Payment_Method", "Payment Method", "Method"]);
  const account = landViewLedgerEnsureAccount_(accountState, landViewLedgerFirst_(payment, ["Account_ID", "Deposit_Account", "Deposit Account", "Account"]), method);
  const category = typeof lvCanonicalCategory_ === "function" ? lvCanonicalCategory_(payment) : landViewLedgerFirst_(payment, ["Income_Category", "Income Category", "Category"]);
  return {
    Transaction_ID: "TXN-PAY-" + id,
    Transaction_Date: landViewLedgerFirst_(payment, ["Payment_Date", "Payment Date", "Date"]),
    Transaction_Type: "Income",
    Direction: "CREDIT",
    Account_ID: account,
    Project_ID: landViewLedgerFirst_(payment, ["Project_ID", "Project ID", "ProjectId"]),
    Source_Type: "Payment",
    Source_ID: id,
    Category: category,
    Description: landViewLedgerFirst_(payment, ["Payment_For", "Payment For", "Description"]) || "Client payment",
    Amount: amount,
    Payment_Method: method,
    Reference_No: landViewLedgerFirst_(payment, ["Reference_No", "Reference No", "Reference"]),
    Status: "Posted",
    Created_At: landViewLedgerFirst_(payment, ["Approved_At", "Created_At", "Created At"]) || new Date().toISOString(),
    Created_By: landViewLedgerFirst_(payment, ["Approved_By", "Created_By", "Created By"])
  };
}

function landViewLedgerExpenseTransaction_(expense, accountState) {
  if (!landViewLedgerExpenseEffective_(expense)) return null;
  const id = landViewLedgerText_(landViewLedgerFirst_(expense, ["Expense_ID", "Expense ID", "ExpenseId"]));
  const amount = landViewLedgerNumber_(landViewLedgerFirst_(expense, ["Amount", "Expense_Amount", "Expense Amount"]));
  if (!id || !(amount > 0)) return null;
  const method = landViewLedgerFirst_(expense, ["Payment_Method", "Payment Method", "Method"]);
  const account = landViewLedgerEnsureAccount_(accountState, landViewLedgerFirst_(expense, ["Account_ID", "Paid_From_Account", "Paid From Account", "Account"]), method);
  return {
    Transaction_ID: "TXN-EXP-" + id,
    Transaction_Date: landViewLedgerFirst_(expense, ["Expense_Date", "Expense Date", "Date"]),
    Transaction_Type: "Expense",
    Direction: "DEBIT",
    Account_ID: account,
    Project_ID: landViewLedgerFirst_(expense, ["Project_ID", "Project ID", "ProjectId"]),
    Source_Type: "Expense",
    Source_ID: id,
    Category: landViewLedgerFirst_(expense, ["Category", "Expense_Category", "Expense Category"]),
    Description: landViewLedgerFirst_(expense, ["Description", "Particulars", "Expense"]) || "Expense",
    Amount: amount,
    Payment_Method: method,
    Reference_No: landViewLedgerFirst_(expense, ["Reference_No", "Reference No", "Reference"]),
    Status: "Posted",
    Created_At: landViewLedgerFirst_(expense, ["Approved_At", "Created_At", "Created At"]) || new Date().toISOString(),
    Created_By: landViewLedgerFirst_(expense, ["Approved_By", "Created_By", "Created By"])
  };
}

function landViewLedgerTransferTransactions_(transfer, accountState) {
  if (!landViewLedgerTransferEffective_(transfer)) return [];
  const id = landViewLedgerText_(landViewLedgerFirst_(transfer, ["Transfer_ID", "Transfer ID"]));
  const amount = landViewLedgerNumber_(landViewLedgerFirst_(transfer, ["Amount"]));
  if (!id || !(amount > 0)) return [];
  const from = landViewLedgerEnsureAccount_(accountState, landViewLedgerFirst_(transfer, ["From_Account_ID", "From Account ID"]), "");
  const to = landViewLedgerEnsureAccount_(accountState, landViewLedgerFirst_(transfer, ["To_Account_ID", "To Account ID"]), "");
  const date = landViewLedgerFirst_(transfer, ["Transfer_Date", "Transfer Date", "Date"]);
  const reference = landViewLedgerFirst_(transfer, ["Reference_No", "Reference No", "Reference"]);
  const createdAt = landViewLedgerFirst_(transfer, ["Created_At", "Created At"]) || new Date().toISOString();
  const createdBy = landViewLedgerFirst_(transfer, ["Created_By", "Created By"]);
  return [
    { Transaction_ID: "TXN-TRF-" + id + "-OUT", Transaction_Date: date, Transaction_Type: "Transfer", Direction: "DEBIT", Account_ID: from, Project_ID: "", Source_Type: "Transfer", Source_ID: id, Category: "Internal Transfer", Description: "Transfer to " + to, Amount: amount, Payment_Method: "Internal Transfer", Reference_No: reference, Status: "Posted", Created_At: createdAt, Created_By: createdBy },
    { Transaction_ID: "TXN-TRF-" + id + "-IN", Transaction_Date: date, Transaction_Type: "Transfer", Direction: "CREDIT", Account_ID: to, Project_ID: "", Source_Type: "Transfer", Source_ID: id, Category: "Internal Transfer", Description: "Transfer from " + from, Amount: amount, Payment_Method: "Internal Transfer", Reference_No: reference, Status: "Posted", Created_At: createdAt, Created_By: createdBy }
  ];
}

function landViewLedgerSyncTransactions_(ss, transactions) {
  const sheet = ss.getSheetByName("Transactions");
  if (!sheet) throw new Error('Finance worksheet "Transactions" was not found.');
  const headers = landViewLedgerEnsureHeaders_(sheet, LAND_VIEW_FINANCE_SETUP_SHEETS_["Transactions"]);
  const idIndex = headers.indexOf("Transaction_ID");
  const existingRows = landViewLedgerRecords_(sheet);
  const existingById = {};
  existingRows.forEach(function(record, index) {
    const id = landViewLedgerText_(record.Transaction_ID);
    if (id) existingById[id] = index + 2;
  });
  const keep = {};
  let created = 0;
  let updated = 0;
  transactions.forEach(function(record) {
    const id = landViewLedgerText_(record.Transaction_ID);
    if (!id) return;
    keep[id] = true;
    const values = headers.map(function(header) { return record[header] === undefined ? "" : record[header]; });
    if (existingById[id]) {
      sheet.getRange(existingById[id], 1, 1, headers.length).setValues([values]);
      updated += 1;
    } else {
      sheet.appendRow(values);
      created += 1;
    }
  });
  let removed = 0;
  if (sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, idIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    for (let i = values.length - 1; i >= 0; i -= 1) {
      const id = landViewLedgerText_(values[i][0]);
      if (/^TXN-(PAY|EXP|TRF)-/.test(id) && !keep[id]) {
        sheet.deleteRow(i + 2);
        removed += 1;
      }
    }
  }
  return { created: created, updated: updated, removed: removed, total: transactions.length };
}

function landViewLedgerRecalculateAccounts_(ss) {
  const accountState = landViewLedgerAccountRows_(ss);
  const transactionSheet = ss.getSheetByName("Transactions");
  const transactions = landViewLedgerRecords_(transactionSheet);
  const totals = {};
  transactions.forEach(function(transaction) {
    if (landViewLedgerText_(transaction.Status).toLowerCase() !== "posted") return;
    const accountId = landViewLedgerText_(transaction.Account_ID);
    if (!accountId) return;
    const amount = landViewLedgerNumber_(transaction.Amount);
    if (!totals[accountId]) totals[accountId] = 0;
    totals[accountId] += landViewLedgerText_(transaction.Direction).toUpperCase() === "DEBIT" ? -amount : amount;
  });
  const idIndex = accountState.headers.indexOf("Account_ID");
  const openingIndex = accountState.headers.indexOf("Opening_Balance");
  const currentIndex = accountState.headers.indexOf("Current_Balance");
  const updatedIndex = accountState.headers.indexOf("Updated_At");
  if (accountState.sheet.getLastRow() < 2 || idIndex < 0 || currentIndex < 0) return { updated: 0 };
  const values = accountState.sheet.getRange(2, 1, accountState.sheet.getLastRow() - 1, accountState.headers.length).getValues();
  let updated = 0;
  for (let i = 0; i < values.length; i += 1) {
    const id = landViewLedgerText_(values[i][idIndex]);
    if (!id) continue;
    const opening = openingIndex >= 0 ? landViewLedgerNumber_(values[i][openingIndex]) : 0;
    const balance = opening + (totals[id] || 0);
    accountState.sheet.getRange(i + 2, currentIndex + 1).setValue(balance);
    if (updatedIndex >= 0) accountState.sheet.getRange(i + 2, updatedIndex + 1).setValue(new Date().toISOString());
    updated += 1;
  }
  return { updated: updated };
}

function syncLandViewIncomeExpenseLedger() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (typeof setupLandViewFinanceDatabaseFromEditor === "function") setupLandViewFinanceDatabaseFromEditor();
    const ss = getFinanceDatabase_();
    const accounts = landViewLedgerAccountRows_(ss);
    const payments = landViewLedgerRecords_(ss.getSheetByName("Payments"));
    const expenses = landViewLedgerRecords_(ss.getSheetByName("Expenses"));
    const transfers = landViewLedgerRecords_(ss.getSheetByName("Transfers"));
    let transactions = [];
    payments.forEach(function(payment) { const transaction = landViewLedgerPaymentTransaction_(payment, accounts); if (transaction) transactions.push(transaction); });
    expenses.forEach(function(expense) { const transaction = landViewLedgerExpenseTransaction_(expense, accounts); if (transaction) transactions.push(transaction); });
    transfers.forEach(function(transfer) { transactions = transactions.concat(landViewLedgerTransferTransactions_(transfer, accounts)); });
    const journal = landViewLedgerSyncTransactions_(ss, transactions);
    const balances = landViewLedgerRecalculateAccounts_(ss);
    SpreadsheetApp.flush();
    return { success: true, data: { payments: payments.length, expenses: expenses.length, transfers: transfers.length, journal: journal, balances: balances, syncedAt: new Date().toISOString() } };
  } finally {
    lock.releaseLock();
  }
}

function installLandViewLedgerSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "syncLandViewIncomeExpenseLedger") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("syncLandViewIncomeExpenseLedger").timeBased().everyMinutes(5).create();
  return { success: true, message: "Canonical finance ledger sync trigger installed." };
}
