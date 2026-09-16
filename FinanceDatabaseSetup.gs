/* LAND VIEW — CANONICAL FINANCE DATABASE SETUP
 *
 * Non-destructive schema repair for the eight authoritative Finance tables.
 * It never copies/recreates legacy Summary/Design Deposit/accounting mirror tabs.
 */

const LAND_VIEW_FINANCE_SETUP_SHEETS_ = {
  "Bills": ["Bill_ID", "Project_ID", "Bill_Date", "Description", "Amount", "Discount", "Status", "Notes", "Billing_Category", "Category", "Created_Via", "Created_At", "Created_By", "Idempotency_Key", "Legacy_Source_ID", "Unit_Price", "Quantity"],
  "Payments": ["Payment_ID", "Project_ID", "Payment_Date", "Amount", "Payment_Method", "Deposit_Account", "Reference_No", "Received_From", "Received_By", "Payment_For", "Income_Category", "Transaction_Type", "Affects_Business_Balance", "Approval_Status", "Reviewed_By", "Reviewed_At", "Review_Notes", "Approved_By", "Approved_At", "Notes", "Created_At", "Created_By", "Idempotency_Key", "Legacy_Source_ID"],
  "Invoices": ["Invoice_ID", "Project_ID", "Project_Name", "Client_Name", "Invoice_Date", "Status", "Total_Bill", "Total_Paid", "Due_Amount", "PDF_File_ID", "PDF_URL", "Download_URL", "Invoice_Folder_URL", "Notes", "Created_At", "Created_By"],
  "Expenses": ["Expense_ID", "Project_ID", "Expense_Date", "Category", "Description", "Amount", "Approval_Status", "Requested_By", "Requested_At", "Approved_By", "Approved_At", "Paid_To", "Payment_Method", "Reference_No", "Receipt_URL", "Notes", "Created_At", "Created_By", "Idempotency_Key"],
  "Accounts": ["Account_ID", "Account_Name", "Account_Type", "Opening_Balance", "Current_Balance", "Currency", "Status", "Notes", "Created_At", "Updated_At"],
  "Transfers": ["Transfer_ID", "Transfer_Date", "From_Account_ID", "To_Account_ID", "Amount", "Reference_No", "Status", "Notes", "Created_At", "Created_By", "Idempotency_Key"],
  "Transactions": ["Transaction_ID", "Transaction_Date", "Transaction_Type", "Direction", "Account_ID", "Project_ID", "Source_Type", "Source_ID", "Category", "Description", "Amount", "Payment_Method", "Reference_No", "Status", "Created_At", "Created_By"],
  "Import Audit": ["Import_ID", "Import_Date", "Source", "Source_Record_ID", "Target_Table", "Target_ID", "Status", "Notes", "Created_At"]
};

function landViewFinanceSetupWorkbook_() {
  if (typeof getFinanceDatabase_ !== "function") throw new Error("getFinanceDatabase_() is missing. Install ModularDatabaseRouter.gs first.");
  return getFinanceDatabase_();
}

function landViewEnsureFinanceSetupSheet_(ss, sheetName, requiredHeaders) {
  let sheet = ss.getSheetByName(sheetName);
  let created = false;
  if (!sheet) { sheet = ss.insertSheet(sheetName); created = true; }

  const lastColumn = Math.max(1, sheet.getLastColumn());
  let headers = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) { return String(value || "").trim(); })
    : [];
  const hasHeaders = headers.some(function(value) { return !!value; });
  const addedHeaders = [];

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    headers = requiredHeaders.slice();
    requiredHeaders.forEach(function(header) { addedHeaders.push(header); });
  } else {
    requiredHeaders.forEach(function(header) {
      if (headers.indexOf(header) < 0) {
        headers.push(header);
        sheet.getRange(1, headers.length).setValue(header);
        addedHeaders.push(header);
      }
    });
  }

  sheet.setFrozenRows(1);
  if (headers.length) sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  return { sheet: sheetName, created: created, addedHeaders: addedHeaders, rows: sheet.getLastRow(), columns: sheet.getLastColumn(), sheetId: sheet.getSheetId() };
}

function landViewFinanceEnsureDefaultAccounts_(ss) {
  const sheet = ss.getSheetByName("Accounts");
  if (!sheet) return [];
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0];
  const idIndex = headers.indexOf("Account_ID");
  const nameIndex = headers.indexOf("Account_Name");
  const existing = {};
  if (sheet.getLastRow() > 1 && idIndex >= 0) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues().forEach(function(row) {
      const id = String(row[idIndex] || "").trim();
      const name = nameIndex >= 0 ? String(row[nameIndex] || "").trim() : "";
      if (id) existing[id] = true;
      if (name) existing[name.toLowerCase()] = true;
    });
  }

  const now = new Date().toISOString();
  const defaults = [
    { Account_ID: "ACC-CASH", Account_Name: "Cash", Account_Type: "Cash" },
    { Account_ID: "ACC-BANK", Account_Name: "Bank Account", Account_Type: "Bank" }
  ];
  const created = [];
  defaults.forEach(function(account) {
    if (existing[account.Account_ID] || existing[account.Account_Name.toLowerCase()]) return;
    const record = Object.assign({ Opening_Balance: 0, Current_Balance: 0, Currency: "BDT", Status: "Active", Notes: "", Created_At: now, Updated_At: now }, account);
    sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
    created.push(account.Account_ID);
  });
  return created;
}

function setupLandViewFinanceDatabaseFromEditor() {
  const ss = landViewFinanceSetupWorkbook_();
  const result = {};
  Object.keys(LAND_VIEW_FINANCE_SETUP_SHEETS_).forEach(function(sheetName) {
    result[sheetName] = landViewEnsureFinanceSetupSheet_(ss, sheetName, LAND_VIEW_FINANCE_SETUP_SHEETS_[sheetName]);
  });
  const defaultAccounts = landViewFinanceEnsureDefaultAccounts_(ss);
  SpreadsheetApp.flush();
  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheets: result,
    defaultAccountsCreated: defaultAccounts,
    canonicalSheets: Object.keys(LAND_VIEW_FINANCE_SETUP_SHEETS_),
    message: "LAND VIEW canonical Finance database is ready. Existing rows were preserved."
  };
}

function verifyLandViewFinanceDatabaseFromEditor() {
  const ss = landViewFinanceSetupWorkbook_();
  const checks = {};
  let ready = true;
  Object.keys(LAND_VIEW_FINANCE_SETUP_SHEETS_).forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    const requiredHeaders = LAND_VIEW_FINANCE_SETUP_SHEETS_[sheetName];
    const headers = sheet && sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0].map(function(value) { return String(value || "").trim(); })
      : [];
    const missingHeaders = requiredHeaders.filter(function(header) { return headers.indexOf(header) < 0; });
    const sheetReady = !!sheet && missingHeaders.length === 0;
    if (!sheetReady) ready = false;
    checks[sheetName] = { exists: !!sheet, ready: sheetReady, missingHeaders: missingHeaders, rows: sheet ? sheet.getLastRow() : 0, columns: sheet ? sheet.getLastColumn() : 0 };
  });
  return { success: ready, spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), spreadsheetUrl: ss.getUrl(), canonicalSheets: Object.keys(LAND_VIEW_FINANCE_SETUP_SHEETS_), checks: checks };
}

function setupAndSyncLandViewFinanceDatabaseFromEditor() {
  const setup = setupLandViewFinanceDatabaseFromEditor();
  const sync = typeof syncLandViewIncomeExpenseLedger === "function" ? syncLandViewIncomeExpenseLedger() : null;
  return { success: true, setup: setup, sync: sync };
}
