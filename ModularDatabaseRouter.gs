/* LAND VIEW — MODULAR DATABASE ROUTER
 * Production routing + one-time migration for all known LAND VIEW legacy databases.
 *
 * Copy this file into the deployed Apps Script project together with Code.gs,
 * FinanceSheet.gs, FinanceLedger.gs, CertificateRegistry.gs, CertificatePortal.gs
 * and ZZ_AccountingFinance.gs from the same GitHub revision.
 */

const LAND_VIEW_MODULE_DATABASES_ = {
  core: "1wEY2VmZimjIeU7ex13sMf1oyhLapawYMJeoquuPR44s",
  finance: "11NY1kI7Ewr0FsMRI3jN4zcVY2XxbGVc2fWPM6UpByCs",
  certificates: "1_IPav88olW2g7f_aM722IOLIqbtPwPzGIlYzW6wxEBU",
  operations: "1x9-g4L8dzVOR4GYcge8CshUFciB8DLKYRzw82k_zO5o",
  documents: "1hj5WJZjIMNX6FGuaHOsrXHPlZ5isrAMGvCQ7juUUOOg"
};

const LAND_VIEW_LEGACY_DATABASES_ = {
  autoInvoice: "1N4U5l7SqMXlCMND3se-J1GmU3SPI3xGyGaR2WR_Eodg",
  incomeExpense: "1e51Mq3hOj9rUH9ugF8SiHe4SYJW3dJ3Bcw9JNgii_bs",
  proposals: "1xRRL01iXMVjxXHA4hxrDXoEothHWSnEPhNN-xaeUbn0",
  historicalLedger: "1UEqVtreZArHFIFkV-aHtMbIp732PgTyerepDyFeYYMM",
  shajivIncome: "13O33kQSmmpea_WbXgNXHY2TY-iW_E2OA8hMz0brqkPQ"
};

const LAND_VIEW_MODULE_SHEETS_ = {
  core: [
    "Users", "Projects", "Employees", "Clients", "Permissions", "Audit Log",
    "Login Sessions", "Lookup Lists", "Database Map"
  ],
  finance: [
    "Summary", "Invoice", "File List", "Design Bill", "Design Deposit",
    "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit",
    "Payments", "Invoices", "Bills", "Ledger Reconciliation", "Workflow",
    "Income", "Accounting Expenses", "Accounting Dashboard", "Pending Approvals",
    "Categories", "Source Summary", "Import Audit", "Auto Invoice Reconciliation",
    "Auto Invoice Projects", "Auto Invoice Billing Lines"
  ],
  certificates: ["Certificates", "Certificate Requests", "Certificate Audit"],
  operations: ["Site Visits", "Tasks", "Attendance", "Leave Requests", "Expenses", "Approvals"],
  documents: ["Documents", "Drawing Submissions", "Project Files", "Quotations"]
};

const LAND_VIEW_MODULE_CACHE_ = {};

function landViewModuleForSheet_(sheetName) {
  const wanted = String(sheetName || "").trim();
  const modules = Object.keys(LAND_VIEW_MODULE_SHEETS_);
  for (let i = 0; i < modules.length; i += 1) {
    const moduleName = modules[i];
    if (LAND_VIEW_MODULE_SHEETS_[moduleName].indexOf(wanted) >= 0) return moduleName;
  }
  return "";
}

function getModuleSpreadsheet_(moduleName) {
  const key = String(moduleName || "").trim().toLowerCase();
  const id = LAND_VIEW_MODULE_DATABASES_[key];
  if (!id) throw new Error("Unknown LAND VIEW database module: " + key);
  if (!LAND_VIEW_MODULE_CACHE_[key]) LAND_VIEW_MODULE_CACHE_[key] = SpreadsheetApp.openById(id);
  return LAND_VIEW_MODULE_CACHE_[key];
}

function getCoreDatabase_() { return getModuleSpreadsheet_("core"); }
function getFinanceDatabase_() { return getModuleSpreadsheet_("finance"); }
function getCertificateDatabase_() { return getModuleSpreadsheet_("certificates"); }
function getOperationsDatabase_() { return getModuleSpreadsheet_("operations"); }
function getDocumentsDatabase_() { return getModuleSpreadsheet_("documents"); }

function modularDatabaseEnabled_() {
  return String(PropertiesService.getScriptProperties().getProperty("LAND_VIEW_MODULAR_DB_ACTIVE") || "") === "1";
}

function getSpreadsheetForSheet_(sheetName) {
  const moduleName = landViewModuleForSheet_(sheetName);
  if (!moduleName || !modularDatabaseEnabled_()) return getSpreadsheet();
  const moduleSs = getModuleSpreadsheet_(moduleName);
  if (moduleSs.getSheetByName(String(sheetName || "").trim())) return moduleSs;
  return getSpreadsheet();
}

function getModularDatabaseStatus_(params) {
  if (params) requireSession(params);
  const modules = {};
  Object.keys(LAND_VIEW_MODULE_DATABASES_).forEach(function(name) {
    const ss = getModuleSpreadsheet_(name);
    modules[name] = {
      spreadsheetId: ss.getId(),
      name: ss.getName(),
      sheets: ss.getSheets().map(function(sheet) {
        return { name: sheet.getName(), rows: sheet.getLastRow(), columns: sheet.getLastColumn() };
      })
    };
  });
  return { success: true, data: { active: modularDatabaseEnabled_(), modules: modules } };
}

function copySheetToModule_(sourceSs, targetSs, sheetName, targetName) {
  const source = sourceSs.getSheetByName(sheetName);
  const destinationName = String(targetName || sheetName).slice(0, 99);
  if (!source) return { sheet: sheetName, target: destinationName, status: "not-used-in-source" };

  const old = targetSs.getSheetByName(destinationName);
  const temporaryName = ("__LV_MIGRATE__" + new Date().getTime() + "__" + destinationName).slice(0, 99);
  const copied = source.copyTo(targetSs).setName(temporaryName);
  if (old) targetSs.deleteSheet(old);
  copied.setName(destinationName);

  const sourceRows = source.getLastRow();
  const sourceColumns = source.getLastColumn();
  if (sourceRows !== copied.getLastRow() || sourceColumns !== copied.getLastColumn()) {
    throw new Error("Copy verification failed for " + sheetName + " -> " + destinationName);
  }

  return { sheet: sheetName, target: destinationName, status: "copied", rows: sourceRows, columns: sourceColumns };
}

function copyCertificateSheetIfPopulated_(sourceSs, targetSs, sheetName) {
  const source = sourceSs.getSheetByName(sheetName);
  if (!source) return { sheet: sheetName, status: "not-used-in-source" };
  // Do not replace the richer new certificate schema with an old header-only sheet.
  if (source.getLastRow() <= 1) return { sheet: sheetName, status: "header-only-source-skipped" };
  return copySheetToModule_(sourceSs, targetSs, sheetName, sheetName);
}

function copyAllLegacySheets_(sourceSs, targetSs, prefix, resultList) {
  sourceSs.getSheets().forEach(function(sheet) {
    const targetName = (prefix + sheet.getName()).slice(0, 99);
    resultList.push(copySheetToModule_(sourceSs, targetSs, sheet.getName(), targetName));
  });
}

function migrateModularDatabasesCore_(activateWhenSuccessful) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "0");

  const results = { core: [], finance: [], certificates: [], operations: [], documents: [] };
  const failures = [];
  const fail = function(label, error) {
    failures.push(label + ":" + (error && error.message ? error.message : String(error)));
  };

  // 1) Legacy main management spreadsheet -> Core / Finance / Operations / Documents.
  const master = getSpreadsheet();
  ["Users", "Projects", "Employees", "Clients", "Permissions", "Audit Log", "Login Sessions", "Lookup Lists", "Database Map"].forEach(function(name) {
    try { results.core.push(copySheetToModule_(master, getCoreDatabase_(), name)); } catch (e) { fail("master:core:" + name, e); }
  });
  ["Payments", "Invoices", "Bills", "Ledger Reconciliation"].forEach(function(name) {
    try { results.finance.push(copySheetToModule_(master, getFinanceDatabase_(), name)); } catch (e) { fail("master:finance:" + name, e); }
  });
  ["Site Visits", "Tasks", "Attendance", "Leave Requests", "Expenses", "Approvals"].forEach(function(name) {
    try { results.operations.push(copySheetToModule_(master, getOperationsDatabase_(), name)); } catch (e) { fail("master:operations:" + name, e); }
  });
  ["Documents", "Drawing Submissions", "Project Files", "Quotations"].forEach(function(name) {
    try { results.documents.push(copySheetToModule_(master, getDocumentsDatabase_(), name)); } catch (e) { fail("master:documents:" + name, e); }
  });

  // 2) Old Auto Invoice Source -> new Finance + Certificates.
  try {
    const autoInvoice = SpreadsheetApp.openById(LAND_VIEW_LEGACY_DATABASES_.autoInvoice);
    ["Summary", "Invoice", "File List", "Design Bill", "Design Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit", "Workflow"].forEach(function(name) {
      try { results.finance.push(Object.assign({ source: "auto-invoice" }, copySheetToModule_(autoInvoice, getFinanceDatabase_(), name))); } catch (e) { fail("auto-invoice:" + name, e); }
    });
    ["Certificates", "Certificate Requests", "Certificate Audit"].forEach(function(name) {
      try { results.certificates.push(Object.assign({ source: "auto-invoice" }, copyCertificateSheetIfPopulated_(autoInvoice, getCertificateDatabase_(), name))); } catch (e) { fail("auto-invoice:certificate:" + name, e); }
    });
  } catch (e) { fail("auto-invoice-workbook", e); }

  // 3) Old Income & Expense DB -> new Finance DB.
  try {
    const accounting = SpreadsheetApp.openById(LAND_VIEW_LEGACY_DATABASES_.incomeExpense);
    const map = {
      "Dashboard": "Accounting Dashboard",
      "Income": "Income",
      "Expenses": "Accounting Expenses",
      "Pending Approvals": "Pending Approvals",
      "Categories": "Categories",
      "Source Summary": "Source Summary",
      "Import Audit": "Import Audit",
      "Auto Invoice Reconciliation": "Auto Invoice Reconciliation",
      "Auto Invoice Projects": "Auto Invoice Projects",
      "Auto Invoice Billing Lines": "Auto Invoice Billing Lines"
    };
    Object.keys(map).forEach(function(sourceName) {
      try { results.finance.push(Object.assign({ source: "income-expense" }, copySheetToModule_(accounting, getFinanceDatabase_(), sourceName, map[sourceName]))); } catch (e) { fail("income-expense:" + sourceName, e); }
    });
  } catch (e) { fail("income-expense-workbook", e); }

  // 4) Preserve every tab from remaining legacy databases. Prefixing avoids
  // collisions while retaining all historical data in the new modular system.
  try {
    copyAllLegacySheets_(SpreadsheetApp.openById(LAND_VIEW_LEGACY_DATABASES_.proposals), getDocumentsDatabase_(), "Legacy Proposal - ", results.documents);
  } catch (e) { fail("proposal-database", e); }
  try {
    copyAllLegacySheets_(SpreadsheetApp.openById(LAND_VIEW_LEGACY_DATABASES_.historicalLedger), getFinanceDatabase_(), "Historical Ledger - ", results.finance);
  } catch (e) { fail("historical-ledger-database", e); }
  try {
    copyAllLegacySheets_(SpreadsheetApp.openById(LAND_VIEW_LEGACY_DATABASES_.shajivIncome), getFinanceDatabase_(), "Shajiv Income - ", results.finance);
  } catch (e) { fail("shajiv-income-database", e); }

  const active = !!activateWhenSuccessful && failures.length === 0;
  props.setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", active ? "1" : "0");

  return {
    success: failures.length === 0,
    data: { active: active, results: results, failures: failures },
    error: failures.length ? "Migration completed with one or more errors. Modular mode remains disabled." : ""
  };
}

function migrateModularDatabases(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  return migrateModularDatabasesCore_(true);
}

// Run this directly once from the Apps Script editor after you paste the updated files.
// It is intended for the script owner and does not require a web-app session token.
function migrateModularDatabasesFromEditor() {
  return migrateModularDatabasesCore_(true);
}

function verifyModularDatabasesFromEditor() {
  return getModularDatabaseStatus_();
}

function disableModularDatabases(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  PropertiesService.getScriptProperties().setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "0");
  return { success: true, data: { active: false } };
}

function disableModularDatabasesFromEditor() {
  PropertiesService.getScriptProperties().setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "0");
  return { success: true, data: { active: false } };
}
