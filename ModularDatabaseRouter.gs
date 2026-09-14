/* LAND VIEW — MODULAR DATABASE ROUTER
 * Splits the Apps Script data layer by business module while preserving a
 * master-spreadsheet fallback during migration.
 */

const LAND_VIEW_MODULE_DATABASES_ = {
  core: "1wEY2VmZimjIeU7ex13sMf1oyhLapawYMJeoquuPR44s",
  finance: "11NY1kI7Ewr0FsMRI3jN4zcVY2XxbGVc2fWPM6UpByCs",
  certificates: "1_IPav88olW2g7f_aM722IOLIqbtPwPzGIlYzW6wxEBU",
  operations: "1x9-g4L8dzVOR4GYcge8CshUFciB8DLKYRzw82k_zO5o",
  documents: "1hj5WJZjIMNX6FGuaHOsrXHPlZ5isrAMGvCQ7juUUOOg"
};

const LAND_VIEW_MODULE_SHEETS_ = {
  core: ["Users", "Projects", "Employees", "Clients", "Permissions", "Audit Log"],
  finance: ["Summary", "File List", "Design Bill", "Design Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit", "Payments", "Invoices", "Bills", "Ledger Reconciliation"],
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

function getCertificateDatabase_() {
  return getModuleSpreadsheet_("certificates");
}

function getModularDatabaseStatus_(params) {
  if (params) requireSession(params);
  const modules = {};
  Object.keys(LAND_VIEW_MODULE_DATABASES_).forEach(function(name) {
    const ss = getModuleSpreadsheet_(name);
    modules[name] = {
      spreadsheetId: ss.getId(),
      name: ss.getName(),
      sheets: ss.getSheets().map(function(sheet) { return sheet.getName(); })
    };
  });
  return { success: true, data: { active: modularDatabaseEnabled_(), modules: modules } };
}

function copySheetToModule_(sourceSs, targetSs, sheetName) {
  const source = sourceSs.getSheetByName(sheetName);
  if (!source) return { sheet: sheetName, status: "missing-source" };

  const old = targetSs.getSheetByName(sheetName);
  const temporaryName = "__LV_MIGRATE__" + new Date().getTime() + "__" + sheetName.slice(0, 30);
  const copied = source.copyTo(targetSs).setName(temporaryName);
  if (old) targetSs.deleteSheet(old);
  copied.setName(sheetName);
  return { sheet: sheetName, status: "copied", rows: source.getLastRow(), columns: source.getLastColumn() };
}

function migrateModularDatabases(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");

  const master = getSpreadsheet();
  const results = {};
  const failures = [];

  Object.keys(LAND_VIEW_MODULE_SHEETS_).forEach(function(moduleName) {
    const target = getModuleSpreadsheet_(moduleName);
    results[moduleName] = [];
    LAND_VIEW_MODULE_SHEETS_[moduleName].forEach(function(sheetName) {
      try {
        const result = copySheetToModule_(master, target, sheetName);
        results[moduleName].push(result);
        if (result.status !== "copied") failures.push(moduleName + ":" + sheetName + ":" + result.status);
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        results[moduleName].push({ sheet: sheetName, status: "error", error: message });
        failures.push(moduleName + ":" + sheetName + ":" + message);
      }
    });
  });

  // Certificate data historically lives in the finance workbook rather than the
  // master management workbook. Preserve it before enabling modular routing.
  try {
    if (typeof getFinanceWorkbook_ === "function") {
      const financeSource = getFinanceWorkbook_();
      const certificateTarget = getModuleSpreadsheet_("certificates");
      ["Certificates", "Certificate Requests"].forEach(function(sheetName) {
        if (financeSource.getSheetByName(sheetName)) {
          const result = copySheetToModule_(financeSource, certificateTarget, sheetName);
          results.certificates = results.certificates || [];
          results.certificates.push(Object.assign({ source: "finance-workbook" }, result));
        }
      });
    }
  } catch (error) {
    failures.push("certificate-finance-source:" + (error && error.message ? error.message : String(error)));
  }

  if (!failures.length) {
    PropertiesService.getScriptProperties().setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "1");
  }

  return {
    success: !failures.length,
    data: {
      active: !failures.length,
      results: results,
      failures: failures
    },
    error: failures.length ? "Migration completed with missing or failed sheets. Modular mode was not activated." : ""
  };
}

function disableModularDatabases(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  PropertiesService.getScriptProperties().setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "0");
  return { success: true, data: { active: false } };
}
