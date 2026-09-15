/* LAND VIEW — MODULAR DATABASE ROUTER
 * Production routing for the five LAND VIEW module databases.
 *
 * IMPORTANT:
 * - Keep LAND_VIEW_MODULAR_DB_ACTIVE unset/0 until legacy data has been copied.
 * - migrateModularDatabases() copies legacy master + finance/certificate data,
 *   verifies the copy at a basic row/column level, then activates modular mode.
 * - disableModularDatabases() provides an immediate master-database fallback.
 */

const LAND_VIEW_MODULE_DATABASES_ = {
  core: "1wEY2VmZimjIeU7ex13sMf1oyhLapawYMJeoquuPR44s",
  finance: "11NY1kI7Ewr0FsMRI3jN4zcVY2XxbGVc2fWPM6UpByCs",
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
    "Summary", "File List", "Design Bill", "Design Deposit", "Supervision Bill",
    "S Deposit", "Others Bill", "Others Bill Deposit", "Payments", "Invoices",
    "Bills", "Ledger Reconciliation", "Income", "Accounting Expenses",
    "Auto Invoice Reconciliation", "Auto Invoice Projects",
    "Auto Invoice Billing Lines", "Workflow"
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
  const destinationName = String(targetName || sheetName);
  if (!source) return { sheet: sheetName, target: destinationName, status: "not-used-in-source" };

  const old = targetSs.getSheetByName(destinationName);
  const temporaryName = "__LV_MIGRATE__" + new Date().getTime() + "__" + destinationName.slice(0, 25);
  const copied = source.copyTo(targetSs).setName(temporaryName);
  if (old) targetSs.deleteSheet(old);
  copied.setName(destinationName);

  const sourceRows = source.getLastRow();
  const sourceColumns = source.getLastColumn();
  const targetRows = copied.getLastRow();
  const targetColumns = copied.getLastColumn();
  if (sourceRows !== targetRows || sourceColumns !== targetColumns) {
    throw new Error("Copy verification failed for " + sheetName + " -> " + destinationName);
  }

  return {
    sheet: sheetName,
    target: destinationName,
    status: "copied",
    rows: sourceRows,
    columns: sourceColumns
  };
}

function migrateModularDatabases(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");

  const props = PropertiesService.getScriptProperties();
  const master = getSpreadsheet();
  const results = { core: [], finance: [], certificates: [], operations: [], documents: [] };
  const failures = [];

  // 1. Master management database -> module databases.
  Object.keys(LAND_VIEW_MODULE_SHEETS_).forEach(function(moduleName) {
    if (moduleName === "certificates") return;
    const target = getModuleSpreadsheet_(moduleName);
    LAND_VIEW_MODULE_SHEETS_[moduleName].forEach(function(sheetName) {
      // Accounting Expenses is intentionally sourced from the accounting ledger,
      // not from the operational master Expenses sheet.
      if (sheetName === "Accounting Expenses" || sheetName === "Income" ||
          sheetName === "Auto Invoice Reconciliation" || sheetName === "Auto Invoice Projects" ||
          sheetName === "Auto Invoice Billing Lines" || sheetName === "Workflow") return;
      try {
        results[moduleName].push(copySheetToModule_(master, target, sheetName));
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        results[moduleName].push({ sheet: sheetName, status: "error", error: message });
        failures.push(moduleName + ":" + sheetName + ":" + message);
      }
    });
  });

  // 2. Legacy Auto Invoice workbook -> new Finance DB and Certificate DB.
  try {
    if (typeof getLegacyFinanceWorkbook_ === "function") {
      const financeSource = getLegacyFinanceWorkbook_();
      const financeTarget = getFinanceDatabase_();
      [
        "Summary", "File List", "Design Bill", "Design Deposit", "Supervision Bill",
        "S Deposit", "Others Bill", "Others Bill Deposit", "Ledger Reconciliation",
        "Auto Invoice Reconciliation", "Auto Invoice Projects", "Auto Invoice Billing Lines", "Workflow"
      ].forEach(function(sheetName) {
        if (!financeSource.getSheetByName(sheetName)) return;
        try {
          results.finance.push(Object.assign({ source: "legacy-finance" }, copySheetToModule_(financeSource, financeTarget, sheetName)));
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          failures.push("legacy-finance:" + sheetName + ":" + message);
        }
      });

      const certificateTarget = getCertificateDatabase_();
      ["Certificates", "Certificate Requests", "Certificate Audit"].forEach(function(sheetName) {
        if (!financeSource.getSheetByName(sheetName)) return;
        try {
          results.certificates.push(Object.assign({ source: "legacy-finance" }, copySheetToModule_(financeSource, certificateTarget, sheetName)));
        } catch (error) {
          const message = error && error.message ? error.message : String(error);
          failures.push("certificate:" + sheetName + ":" + message);
        }
      });
    }
  } catch (error) {
    failures.push("legacy-finance-source:" + (error && error.message ? error.message : String(error)));
  }

  // 3. Legacy accounting ledger -> new Finance DB. Rename Expenses to avoid
  // collision with the operational Expenses table.
  try {
    if (typeof getLegacyAccountingLedger_ === "function") {
      const accountingSource = getLegacyAccountingLedger_();
      const financeTarget = getFinanceDatabase_();
      if (accountingSource.getSheetByName("Income")) {
        results.finance.push(Object.assign({ source: "legacy-accounting" }, copySheetToModule_(accountingSource, financeTarget, "Income", "Income")));
      }
      if (accountingSource.getSheetByName("Expenses")) {
        results.finance.push(Object.assign({ source: "legacy-accounting" }, copySheetToModule_(accountingSource, financeTarget, "Expenses", "Accounting Expenses")));
      }
      ["Auto Invoice Reconciliation", "Auto Invoice Projects", "Auto Invoice Billing Lines"].forEach(function(sheetName) {
        if (!accountingSource.getSheetByName(sheetName)) return;
        results.finance.push(Object.assign({ source: "legacy-accounting" }, copySheetToModule_(accountingSource, financeTarget, sheetName)));
      });
    }
  } catch (error) {
    failures.push("legacy-accounting-source:" + (error && error.message ? error.message : String(error)));
  }

  if (!failures.length) props.setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "1");
  else props.setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "0");

  return {
    success: !failures.length,
    data: { active: !failures.length, results: results, failures: failures },
    error: failures.length ? "Migration completed with copy errors. Modular mode remains disabled." : ""
  };
}

function disableModularDatabases(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  PropertiesService.getScriptProperties().setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "0");
  return { success: true, data: { active: false } };
}
