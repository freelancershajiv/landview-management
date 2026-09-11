/* LAND VIEW — CERTIFICATE REQUEST SCHEMA MIGRATION
 * Migrates the legacy Certificate Requests tab to the unified client/employee
 * request schema without losing existing requests.
 */

function migrateCertificateRequestSheet_() {
  const ss = getFinanceWorkbook_();
  let sheet = ss.getSheetByName("Certificate Requests");
  if (!sheet) return { migrated: false, reason: "missing" };

  const targetHeaders = [
    "Request_ID", "Requester_Role", "Requester_ID", "Project_ID", "Employee_ID",
    "Client_Name", "Mobile", "Certificate_Type", "Category", "Subject", "Details",
    "Status", "Certificate_ID", "Requested_At", "Reviewed_At", "Reviewed_By", "Admin_Note"
  ];

  const lastColumn = Math.max(1, sheet.getLastColumn());
  const lastRow = Math.max(1, sheet.getLastRow());
  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(v) {
    return String(v || "").trim();
  });

  const alreadyCanonical = targetHeaders.every(function(header, index) {
    return currentHeaders[index] === header;
  });
  if (alreadyCanonical) return { migrated: false, reason: "current" };

  const values = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues()
    : [];

  function detectCategory(record) {
    const existing = String(record.Category || "").trim().toLowerCase();
    if (existing) return existing;
    const type = String(record.Certificate_Type || "").trim().toLowerCase();
    const subject = String(record.Subject || "").trim().toLowerCase();
    if (type === "employee") return "employee";
    if (type === "building" || subject.indexOf("building") >= 0) return "building";
    if (subject.indexOf("structural") >= 0) return "structural_design";
    if (subject.indexOf("supervision") >= 0) return "supervision";
    return "project";
  }

  const migratedRows = values.map(function(row) {
    const source = {};
    currentHeaders.forEach(function(header, index) {
      if (header) source[header] = row[index] === undefined ? "" : row[index];
    });

    const category = detectCategory(source);
    const employeeId = String(source.Employee_ID || "").trim();
    const projectId = String(source.Project_ID || "").trim();
    const requesterRole = String(source.Requester_Role || "").trim().toLowerCase() || (employeeId || category === "employee" ? "employee" : "client");
    const requesterId = String(source.Requester_ID || "").trim() || (requesterRole === "employee" ? employeeId : projectId);

    const record = {
      Request_ID: source.Request_ID || "",
      Requester_Role: requesterRole,
      Requester_ID: requesterId,
      Project_ID: projectId,
      Employee_ID: employeeId,
      Client_Name: source.Client_Name || "",
      Mobile: source.Mobile || "",
      Certificate_Type: source.Certificate_Type || (category === "employee" ? "employee" : category === "building" ? "building" : "project"),
      Category: category,
      Subject: source.Subject || "",
      Details: source.Details || "",
      Status: source.Status || "Pending",
      Certificate_ID: source.Certificate_ID || "",
      Requested_At: source.Requested_At || "",
      Reviewed_At: source.Reviewed_At || "",
      Reviewed_By: source.Reviewed_By || "",
      Admin_Note: source.Admin_Note || ""
    };
    return targetHeaders.map(function(header) { return record[header] === undefined ? "" : record[header]; });
  }).filter(function(row) { return String(row[0] || "").trim(); });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
  if (migratedRows.length) sheet.getRange(2, 1, migratedRows.length, targetHeaders.length).setValues(migratedRows);
  sheet.setFrozenRows(1);
  return { migrated: true, rows: migratedRows.length };
}
