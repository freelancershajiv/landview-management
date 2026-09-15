/* LAND VIEW — FINANCE DATABASE SETUP
 *
 * Copy this file into the same Google Apps Script project as:
 *   - Code.gs
 *   - ModularDatabaseRouter.gs
 *   - FinanceSheet.gs
 *   - FinanceLedger.gs
 *   - ZZ_AccountingFinance.gs
 *
 * Then run setupLandViewFinanceDatabaseFromEditor() once from the Apps Script editor.
 *
 * IMPORTANT:
 * - The Finance workbook is resolved by getFinanceDatabase_() from ModularDatabaseRouter.gs.
 * - This setup is non-destructive: it never clears existing rows or removes columns.
 * - Operational expense submissions remain in the Operations database sheet "Expenses".
 * - The Finance database uses "Accounting Expenses" for the accounting ledger mirror.
 */

const LAND_VIEW_FINANCE_SETUP_SHEETS_ = {
  "Bills": [
    "Bill_ID",
    "Project_ID",
    "Bill_Date",
    "Description",
    "Amount",
    "Status",
    "Notes",
    "Billing_Category",
    "Category",
    "Created_Via",
    "Created_At",
    "Created_By",
    "Legacy_Source_ID"
  ],

  "Income": [
    "Income_ID",
    "Payment_Date",
    "File_ID",
    "Project_Name",
    "Client_Name",
    "Payment_For",
    "Amount",
    "Payment_Method",
    "Reference_No",
    "Received_From",
    "Received_By",
    "Deposit_Account",
    "Receipt_URL",
    "Notes",
    "Created_At",
    "Created_By",
    "Income_Category"
  ],

  "Accounting Expenses": [
    "Expense_ID",
    "Expense_Date",
    "File_ID",
    "Project_Name",
    "Category",
    "Description",
    "Amount",
    "Requested_By",
    "Requested_At",
    "Approval_Status",
    "Approved_By",
    "Approved_At",
    "Paid_To",
    "Payment_Method",
    "Reference_No",
    "Receipt_URL",
    "Notes",
    "Created_At",
    "Created_By"
  ]
};

function landViewFinanceSetupWorkbook_() {
  if (typeof getFinanceDatabase_ !== "function") {
    throw new Error(
      "getFinanceDatabase_() is missing. Copy ModularDatabaseRouter.gs into this Apps Script project first."
    );
  }

  return getFinanceDatabase_();
}

function landViewEnsureFinanceSetupSheet_(ss, sheetName, requiredHeaders) {
  var sheet = ss.getSheetByName(sheetName);
  var created = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    created = true;
  }

  var lastColumn = Math.max(1, sheet.getLastColumn());
  var existingHeaders = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) {
        return String(value || "").trim();
      })
    : [];

  var hasHeaders = existingHeaders.some(function(value) { return !!value; });
  var addedHeaders = [];

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    existingHeaders = requiredHeaders.slice();
    addedHeaders = requiredHeaders.slice();
  } else {
    requiredHeaders.forEach(function(header) {
      if (existingHeaders.indexOf(header) < 0) {
        existingHeaders.push(header);
        sheet.getRange(1, existingHeaders.length).setValue(header);
        addedHeaders.push(header);
      }
    });
  }

  sheet.setFrozenRows(1);

  if (existingHeaders.length) {
    sheet.getRange(1, 1, 1, existingHeaders.length).setFontWeight("bold");
  }

  return {
    sheet: sheetName,
    created: created,
    addedHeaders: addedHeaders,
    rows: sheet.getLastRow(),
    columns: sheet.getLastColumn(),
    sheetId: sheet.getSheetId()
  };
}

/**
 * Run once after copying the finance Apps Script files.
 * Creates/repairs the three app accounting sheets without deleting existing data.
 */
function setupLandViewFinanceDatabaseFromEditor() {
  var ss = landViewFinanceSetupWorkbook_();
  var result = {};

  Object.keys(LAND_VIEW_FINANCE_SETUP_SHEETS_).forEach(function(sheetName) {
    result[sheetName] = landViewEnsureFinanceSetupSheet_(
      ss,
      sheetName,
      LAND_VIEW_FINANCE_SETUP_SHEETS_[sheetName]
    );
  });

  SpreadsheetApp.flush();

  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheets: result,
    message: "LAND VIEW Finance database setup completed. Existing data was preserved."
  };
}

/**
 * Checks that the Finance database connection and required accounting sheets are ready.
 */
function verifyLandViewFinanceDatabaseFromEditor() {
  var ss = landViewFinanceSetupWorkbook_();
  var checks = {};
  var ready = true;

  Object.keys(LAND_VIEW_FINANCE_SETUP_SHEETS_).forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    var requiredHeaders = LAND_VIEW_FINANCE_SETUP_SHEETS_[sheetName];
    var headers = [];

    if (sheet && sheet.getLastRow() > 0) {
      headers = sheet
        .getRange(1, 1, 1, Math.max(1, sheet.getLastColumn()))
        .getDisplayValues()[0]
        .map(function(value) { return String(value || "").trim(); });
    }

    var missingHeaders = requiredHeaders.filter(function(header) {
      return headers.indexOf(header) < 0;
    });

    var sheetReady = !!sheet && missingHeaders.length === 0;
    if (!sheetReady) ready = false;

    checks[sheetName] = {
      exists: !!sheet,
      ready: sheetReady,
      missingHeaders: missingHeaders,
      rows: sheet ? sheet.getLastRow() : 0,
      columns: sheet ? sheet.getLastColumn() : 0
    };
  });

  return {
    success: ready,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    checks: checks
  };
}

/**
 * Optional: run after setup if you want to immediately mirror current Payments and
 * approved/recorded Expenses into the Finance database accounting ledgers.
 */
function setupAndSyncLandViewFinanceDatabaseFromEditor() {
  var setup = setupLandViewFinanceDatabaseFromEditor();

  if (typeof syncLandViewIncomeExpenseLedger !== "function") {
    return {
      success: true,
      setup: setup,
      sync: null,
      message: "Finance sheets are ready. Copy FinanceLedger.gs to enable ledger sync."
    };
  }

  return {
    success: true,
    setup: setup,
    sync: syncLandViewIncomeExpenseLedger()
  };
}
