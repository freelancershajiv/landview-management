/* LAND VIEW — MODULAR DATABASE ROUTER
 *
 * Canonical production databases. Finance is intentionally limited to the
 * eight authoritative accounting tables; legacy invoice/accounting sheets are
 * not routed or recreated.
 */

const LAND_VIEW_MODULE_DATABASES_ = {
  core: "1wEY2VmZimjIeU7ex13sMf1oyhLapawYMJeoquuPR44s",
  finance: "1RDbzIr4aaysiB-UTZQKRK6m60HLg3zSZVzNrdgnGHBc",
  certificates: "1_IPav88olW2g7f_aM722IOLIqbtPwPzGIlYzW6wxEBU",
  operations: "1x9-g4L8dzVOR4GYcge8CshUFciB8DLKYRzw82k_zO5o",
  documents: "1hj5WJZjIMNX6FGuaHOsrXHPlZ5isrAMGvCQ7juUUOOg"
};

const LAND_VIEW_MODULE_SHEETS_ = {
  core: [
    "Users", "Projects", "Employees", "Clients", "Permissions", "Audit Log",
    "Login Sessions", "Lookup Lists", "Database Map"
  ],
  finance: [
    "Bills", "Payments", "Invoices", "Expenses",
    "Accounts", "Transfers", "Transactions", "Import Audit"
  ],
  certificates: ["Certificates", "Certificate Requests", "Certificate Audit"],
  operations: ["Site Visits", "Tasks", "Attendance", "Leave Requests", "Approvals"],
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
  const value = String(PropertiesService.getScriptProperties().getProperty("LAND_VIEW_MODULAR_DB_ACTIVE") || "").trim();
  return value !== "0";
}

function getSpreadsheetForSheet_(sheetName) {
  const wanted = String(sheetName || "").trim();
  const moduleName = landViewModuleForSheet_(wanted);
  if (!moduleName || !modularDatabaseEnabled_()) return getSpreadsheet();

  const moduleSs = getModuleSpreadsheet_(moduleName);
  if (!moduleSs.getSheetByName(wanted)) {
    throw new Error('Modular database routing error: mapped sheet "' + wanted + '" is missing from the ' + moduleName + ' database.');
  }
  return moduleSs;
}

function getModularDatabaseStatus_(params) {
  if (params) requireSession(params);
  const modules = {};
  Object.keys(LAND_VIEW_MODULE_DATABASES_).forEach(function(name) {
    const ss = getModuleSpreadsheet_(name);
    const expected = LAND_VIEW_MODULE_SHEETS_[name] || [];
    const actual = ss.getSheets().map(function(sheet) {
      return { name: sheet.getName(), rows: sheet.getLastRow(), columns: sheet.getLastColumn() };
    });
    const actualNames = actual.map(function(item) { return item.name; });
    modules[name] = {
      spreadsheetId: ss.getId(),
      name: ss.getName(),
      expectedSheets: expected.slice(),
      missingSheets: expected.filter(function(sheetName) { return actualNames.indexOf(sheetName) < 0; }),
      unexpectedSheets: actualNames.filter(function(sheetName) { return expected.indexOf(sheetName) < 0; }),
      sheets: actual
    };
  });
  return {
    success: true,
    data: {
      active: modularDatabaseEnabled_(),
      canonicalFinanceSheets: LAND_VIEW_MODULE_SHEETS_.finance.slice(),
      modules: modules
    }
  };
}

/*
 * The old migration routine deleted/replaced destination sheets and copied
 * legacy Auto Invoice/accounting workbooks back into Finance. That is retired.
 * This action is now non-destructive and only repairs canonical sheet schemas.
 */
function migrateModularDatabases(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  if (typeof setupLandViewFinanceDatabaseFromEditor !== "function") {
    throw new Error("Canonical finance setup is not installed.");
  }
  const finance = setupLandViewFinanceDatabaseFromEditor();
  PropertiesService.getScriptProperties().setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "1");
  return {
    success: true,
    data: {
      active: true,
      finance: finance,
      message: "Canonical modular routing verified. No legacy sheets were copied."
    }
  };
}

function migrateModularDatabasesFromEditor() {
  if (typeof setupLandViewFinanceDatabaseFromEditor !== "function") {
    throw new Error("Canonical finance setup is not installed.");
  }
  const finance = setupLandViewFinanceDatabaseFromEditor();
  PropertiesService.getScriptProperties().setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "1");
  return { success: true, data: { active: true, finance: finance } };
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
