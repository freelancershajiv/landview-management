/* LAND VIEW — CORE DATABASE CONFIGURATION
 * Canonical production database configuration.
 *
 * Run configureLandViewCoreDatabaseFromEditor() once from the Apps Script
 * editor after syncing this GitHub revision. The normal module router already
 * uses these database IDs directly; this helper also corrects legacy Script
 * Properties so older/fallback code cannot point to the retired workbook.
 */

const LAND_VIEW_CORE_DATABASE_ID_ = "1wEY2VmZimjIeU7ex13sMf1oyhLapawYMJeoquuPR44s";

function configureLandViewCoreDatabaseFromEditor() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("LAND_VIEW_SPREADSHEET_ID", LAND_VIEW_CORE_DATABASE_ID_);
  props.setProperty("LAND_VIEW_MODULAR_DB_ACTIVE", "1");

  const ss = SpreadsheetApp.openById(LAND_VIEW_CORE_DATABASE_ID_);
  return {
    success: true,
    data: {
      coreSpreadsheetId: ss.getId(),
      coreSpreadsheet: ss.getName(),
      modularDatabaseActive: true
    }
  };
}

function verifyLandViewCoreDatabaseFromEditor() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(props.getProperty("LAND_VIEW_SPREADSHEET_ID") || "").trim();
  const ss = SpreadsheetApp.openById(LAND_VIEW_CORE_DATABASE_ID_);
  return {
    success: configuredId === LAND_VIEW_CORE_DATABASE_ID_,
    data: {
      expectedId: LAND_VIEW_CORE_DATABASE_ID_,
      configuredId: configuredId,
      spreadsheet: ss.getName(),
      modularDatabaseActive: String(props.getProperty("LAND_VIEW_MODULAR_DB_ACTIVE") || "") !== "0"
    }
  };
}
