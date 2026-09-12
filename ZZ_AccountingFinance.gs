/* LAND VIEW — Admin Accounts Ledger bridge.
 * Keep this file after FinanceSheet.gs in the Apps Script project.
 * It extends the existing getFinanceSheet action without changing billing behavior.
 */

const LAND_VIEW_ACCOUNTING_LEDGER_ID_ = "1E1hCMKn3fGl7LUov1FS60IJNVnZTJUlf6CCO4pFMQw4";
const LAND_VIEW_ACCOUNTING_TABS_ = {
  "Accounting Income": { sheetName: "Income", width: 17 },
  "Accounting Expenses": { sheetName: "Expenses", width: 19 }
};

function landViewIsAccountingTab_(tab) {
  return Object.prototype.hasOwnProperty.call(LAND_VIEW_ACCOUNTING_TABS_, String(tab || ""));
}

function landViewCanViewAccounting_(session) {
  if (!session) return false;
  if (isMainAdminRole_(session.role)) return true;
  return hasPermission_(session, "finance.view") || hasPermission_(session, "reports.view");
}

function landViewGetAccountingSheet_(tab, session) {
  if (!landViewCanViewAccounting_(session)) {
    throw new Error("You do not have permission to view the accounting ledger.");
  }

  const config = LAND_VIEW_ACCOUNTING_TABS_[tab];
  if (!config) throw new Error("Unknown accounting worksheet.");

  const ss = SpreadsheetApp.openById(LAND_VIEW_ACCOUNTING_LEDGER_ID_);
  const sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) throw new Error('Accounting worksheet "' + config.sheetName + '" was not found.');
  if (sheet.getLastRow() > 10000) throw new Error("Accounting worksheet exceeds the 10,000-row reading limit.");

  const height = Math.max(1, sheet.getLastRow());
  const grid = sheet.getRange(1, 1, height, config.width).getDisplayValues();
  const headers = grid[0] || [];
  const rows = grid.slice(1).filter(function(row) {
    return row.some(function(value) { return String(value || "").trim() !== ""; });
  });

  return {
    success: true,
    data: {
      tab: tab,
      tabs: Object.keys(LAND_VIEW_ACCOUNTING_TABS_),
      headers: headers,
      rows: rows,
      totals: { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 },
      url: ss.getUrl() + "#gid=" + sheet.getSheetId(),
      updatedAt: new Date().toISOString()
    }
  };
}

/* FinanceSheet.gs owns the normal billing implementation. This file is deliberately
 * loaded after it and wraps only the two Accounting tabs used by /admin/accounts. */
var LAND_VIEW_BASE_GET_FINANCE_SHEET_ = getFinanceSheet;
getFinanceSheet = function(params) {
  const tab = String((params && params.tab) || "Summary");
  if (landViewIsAccountingTab_(tab)) {
    const session = requireSession(params);
    return landViewGetAccountingSheet_(tab, session);
  }
  return LAND_VIEW_BASE_GET_FINANCE_SHEET_(params);
};
