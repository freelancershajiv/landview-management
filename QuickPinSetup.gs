/************************************************************
 * LAND VIEW — QUICK PIN PERMISSIONS SETUP
 *
 * Run initializeQuickPinPermissions() once from Apps Script.
 * It creates/repairs the Permissions sheet header row used by
 * the permanent Admin/Manager PIN feature.
 ************************************************************/

function initializeQuickPinPermissions() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.PERMISSIONS);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.PERMISSIONS);
  }

  const requiredHeaders = [
    "Permission_ID",
    "User_ID",
    "Role",
    "Permission",
    "Status",
    "Created_At"
  ];

  const lastColumn = sheet.getLastColumn();
  let headers = [];

  if (sheet.getLastRow() > 0 && lastColumn > 0) {
    headers = sheet
      .getRange(1, 1, 1, lastColumn)
      .getValues()[0]
      .map(function(value) { return String(value || "").trim(); });
  }

  if (!headers.some(Boolean)) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return {
      success: true,
      created: true,
      headers: requiredHeaders
    };
  }

  requiredHeaders.forEach(function(header) {
    const exists = headers.some(function(existing) {
      return String(existing || "").trim().toLowerCase() === header.toLowerCase();
    });

    if (!exists) {
      headers.push(header);
      sheet.getRange(1, headers.length).setValue(header);
    }
  });

  sheet.setFrozenRows(1);

  return {
    success: true,
    created: false,
    headers: headers
  };
}
