/* LAND VIEW — CORE DATABASE CONFIGURATION
 * Canonical production database configuration.
 *
 * Apps Script's Project Settings UI becomes read-only when the script has more
 * than 50 Script Properties. These helpers intentionally use PropertiesService
 * so the Core database can still be corrected programmatically.
 */

const LAND_VIEW_CORE_DATABASE_ID_ = "1wEY2VmZimjIeU7ex13sMf1oyhLapawYMJeoquuPR44s";

function configureLandViewCoreDatabaseFromEditor() {
  return repairLandViewCoreDatabasePropertiesFromEditor();
}

function repairLandViewCoreDatabasePropertiesFromEditor() {
  const props = PropertiesService.getScriptProperties();
  const before = String(props.getProperty("LAND_VIEW_SPREADSHEET_ID") || "").trim();

  // Force all legacy/fallback management traffic onto the new Core database.
  props.setProperty("LAND_VIEW_SPREADSHEET_ID", LAND_VIEW_CORE_DATABASE_ID_);
  props.setProperty("LAND_VIEW_CORE_SPREADSHEET_ID", LAND_VIEW_CORE_DATABASE_ID_);
  props.setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "1");

  const configuredId = String(props.getProperty("LAND_VIEW_SPREADSHEET_ID") || "").trim();
  const ss = SpreadsheetApp.openById(configuredId);

  return {
    success: configuredId === LAND_VIEW_CORE_DATABASE_ID_,
    data: {
      previousSpreadsheetId: before,
      configuredSpreadsheetId: configuredId,
      expectedSpreadsheetId: LAND_VIEW_CORE_DATABASE_ID_,
      spreadsheet: ss.getName(),
      modularDatabaseActive: String(props.getProperty("LAND_VIEW_MODULAR_DB_ACTIVE") || "") === "1",
      propertyCount: Object.keys(props.getProperties()).length
    }
  };
}

function verifyLandViewCoreDatabaseFromEditor() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(props.getProperty("LAND_VIEW_SPREADSHEET_ID") || "").trim();
  const coreConfiguredId = String(props.getProperty("LAND_VIEW_CORE_SPREADSHEET_ID") || "").trim();
  const ss = SpreadsheetApp.openById(LAND_VIEW_CORE_DATABASE_ID_);

  return {
    success:
      configuredId === LAND_VIEW_CORE_DATABASE_ID_ &&
      coreConfiguredId === LAND_VIEW_CORE_DATABASE_ID_ &&
      String(props.getProperty("LAND_VIEW_MODULAR_DB_ACTIVE") || "") === "1",
    data: {
      expectedId: LAND_VIEW_CORE_DATABASE_ID_,
      configuredId: configuredId,
      coreConfiguredId: coreConfiguredId,
      spreadsheet: ss.getName(),
      modularDatabaseActive: String(props.getProperty("LAND_VIEW_MODULAR_DB_ACTIVE") || "") === "1",
      propertyCount: Object.keys(props.getProperties()).length
    }
  };
}

function listLandViewDatabasePropertiesFromEditor() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const result = {};

  Object.keys(all).sort().forEach(function(key) {
    if (/SPREADSHEET|DATABASE|MODULAR_DB/i.test(key)) {
      result[key] = all[key];
    }
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
