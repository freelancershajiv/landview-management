/* LAND VIEW — CENTRAL CERTIFICATE REGISTRY
 * Stores certificate lifecycle state in the LV - Auto Invoice workbook.
 * Public verification is read-only. Admin/Manager registry operations require
 * an authenticated LAND VIEW session even though they share getPublicProjects
 * as a gateway action.
 */

const CERTIFICATE_REGISTRY_SHEET_ = "Certificates";
const CERTIFICATE_REGISTRY_HEADERS_ = [
  "Certificate_ID", "Type", "Category", "Request_ID", "Name", "Address", "Position", "Subject", "Reference",
  "Description", "Issued_At", "Expires_At", "Status", "Revision", "Parent_ID",
  "Superseded_By", "Revoked_At", "Revoked_Reason", "Deleted_At", "Deleted_Reason",
  "Created_By", "Created_At", "Updated_At", "Token"
];

function ensureCertificateRegistrySheet_() {
  const ss = getFinanceWorkbook_();
  let sheet = ss.getSheetByName(CERTIFICATE_REGISTRY_SHEET_);
  if (!sheet) sheet = ss.insertSheet(CERTIFICATE_REGISTRY_SHEET_);
  const width = Math.max(sheet.getLastColumn(), CERTIFICATE_REGISTRY_HEADERS_.length, 1);
  const existing = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(value) { return String(value || "").trim(); });
  if (!existing.some(function(value) { return !!value; })) {
    sheet.getRange(1, 1, 1, CERTIFICATE_REGISTRY_HEADERS_.length).setValues([CERTIFICATE_REGISTRY_HEADERS_]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const headers = existing.slice();
  CERTIFICATE_REGISTRY_HEADERS_.forEach(function(header) {
    if (headers.indexOf(header) < 0) {
      headers.push(header);
      sheet.getRange(1, headers.length).setValue(header);
    }
  });
  sheet.setFrozenRows(1);
  return sheet;
}

function certificateRegistryHeaders_(sheet) {
  const width = Math.max(sheet.getLastColumn(), CERTIFICATE_REGISTRY_HEADERS_.length);
  return sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(value) { return String(value || "").trim(); });
}

function certificateRegistryRows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const headers = certificateRegistryHeaders_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
  return values.map(function(row, index) {
    const record = { _row: index + 2 };
    headers.forEach(function(header, column) { if (header) record[header] = row[column] === undefined ? "" : row[column]; });
    return record;
  }).filter(function(record) { return String(record.Certificate_ID || "").trim(); });
}

function certificateRegistryClean_(value, maxLength) { return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, maxLength || 900); }

function certificateRegistryFind_(sheet, certificateId) {
  const id = certificateRegistryClean_(certificateId, 60).toUpperCase();
  if (!id) return null;
  return certificateRegistryRows_(sheet).find(function(row) { return String(row.Certificate_ID || "").trim().toUpperCase() === id; }) || null;
}

function certificateRegistryWriteRow_(sheet, rowIndex, record) {
  const headers = certificateRegistryHeaders_(sheet);
  const values = headers.map(function(header) { return record[header] === undefined || record[header] === null ? "" : record[header]; });
  if (rowIndex) sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
  else sheet.appendRow(values);
}

function certificateRegistryPublicRecord_(record) {
  if (!record) return null;
  return {
    certificateId: String(record.Certificate_ID || ""),
    type: String(record.Type || ""),
    category: String(record.Category || ""),
    requestId: String(record.Request_ID || ""),
    name: String(record.Name || ""),
    address: String(record.Address || ""),
    position: String(record.Position || ""),
    subject: String(record.Subject || ""),
    reference: String(record.Reference || ""),
    description: String(record.Description || ""),
    issuedAt: String(record.Issued_At || ""),
    expiresAt: String(record.Expires_At || ""),
    status: String(record.Status || "Active"),
    revision: Number(record.Revision || 1),
    parentId: String(record.Parent_ID || ""),
    supersededBy: String(record.Superseded_By || ""),
    revokedAt: String(record.Revoked_At || ""),
    revokedReason: String(record.Revoked_Reason || ""),
    deletedAt: String(record.Deleted_At || ""),
    deletedReason: String(record.Deleted_Reason || ""),
    createdAt: String(record.Created_At || ""),
    updatedAt: String(record.Updated_At || "")
  };
}

function certificateVerificationFromGateway_(params) {
  const certificateId = certificateRegistryClean_(params && params._certificateVerify, 60).toUpperCase();
  if (!certificateId) return null;
  const sheet = ensureCertificateRegistrySheet_();
  const record = certificateRegistryFind_(sheet, certificateId);
  return { success: true, data: { found: !!record, certificate: certificateRegistryPublicRecord_(record) } };
}

function certificateRegistryFromGateway_(params) {
  const requested = String((params && params._certificateRegistry) || "").trim();
  if (requested !== "1") return null;
  const session = requireSession(params);
  if (!isAdminRole(session.role)) return { success: false, error: "Admin or Manager access required." };

  const op = String((params && params.registryOp) || "list").trim().toLowerCase();
  const sheet = ensureCertificateRegistrySheet_();
  const now = new Date().toISOString();

  if (op === "list") {
    const rows = certificateRegistryRows_(sheet).map(function(record) {
      const item = certificateRegistryPublicRecord_(record);
      item.token = String(record.Token || "");
      item.createdBy = String(record.Created_By || "");
      return item;
    }).sort(function(a, b) { return String(b.createdAt || b.issuedAt || "").localeCompare(String(a.createdAt || a.issuedAt || "")); });
    return { success: true, data: { certificates: rows, updatedAt: now } };
  }

  if (op === "create") {
    const id = certificateRegistryClean_(params.Certificate_ID || params.certificateId, 60).toUpperCase();
    if (!/^LVC-[A-Z]{3}-\d{8}-[A-Z0-9]{6}$/.test(id)) throw new Error("Invalid certificate ID.");
    if (certificateRegistryFind_(sheet, id)) throw new Error("Certificate ID already exists.");
    const type = certificateRegistryClean_(params.Type || params.type, 20).toLowerCase();
    if (["project", "employee", "building"].indexOf(type) < 0) throw new Error("Invalid certificate type.");

    const record = {
      Certificate_ID: id,
      Type: type,
      Category: certificateRegistryClean_(params.Category || params.category, 40).toLowerCase(),
      Request_ID: certificateRegistryClean_(params.Request_ID || params.requestId, 80),
      Name: certificateRegistryClean_(params.Name || params.name, 120),
      Address: certificateRegistryClean_(params.Address || params.address, 220),
      Position: certificateRegistryClean_(params.Position || params.position, 120),
      Subject: certificateRegistryClean_(params.Subject || params.subject, 140),
      Reference: certificateRegistryClean_(params.Reference || params.reference, 80),
      Description: certificateRegistryClean_(params.Description || params.description, 900),
      Issued_At: certificateRegistryClean_(params.Issued_At || params.issuedAt, 40),
      Expires_At: certificateRegistryClean_(params.Expires_At || params.expiresAt, 40),
      Status: "Active",
      Revision: Math.max(1, Number(params.Revision || params.revision || 1) || 1),
      Parent_ID: certificateRegistryClean_(params.Parent_ID || params.parentId, 60).toUpperCase(),
      Superseded_By: "", Revoked_At: "", Revoked_Reason: "", Deleted_At: "", Deleted_Reason: "",
      Created_By: String(session.userId || session.username || "Admin"),
      Created_At: now, Updated_At: now,
      Token: certificateRegistryClean_(params.Token || params.token, 5000)
    };
    if (!record.Name) throw new Error("Certificate name is required.");
    if (!record.Issued_At) throw new Error("Certificate issue date is required.");
    certificateRegistryWriteRow_(sheet, null, record);
    return { success: true, data: { certificate: certificateRegistryPublicRecord_(record) } };
  }

  const id = certificateRegistryClean_(params.certificateId || params.Certificate_ID, 60).toUpperCase();
  const current = certificateRegistryFind_(sheet, id);
  if (!current) throw new Error("Certificate was not found in the registry.");

  if (op === "supersede") {
    const replacementId = certificateRegistryClean_(params.supersededBy, 60).toUpperCase();
    if (!replacementId) throw new Error("Replacement certificate ID is required.");
    current.Status = "Superseded"; current.Superseded_By = replacementId; current.Updated_At = now;
    certificateRegistryWriteRow_(sheet, current._row, current);
    return { success: true, data: { certificate: certificateRegistryPublicRecord_(current) } };
  }
  if (op === "revoke") {
    if (String(current.Status || "").toLowerCase() === "deleted") throw new Error("Deleted certificates cannot be revoked.");
    current.Status = "Revoked"; current.Revoked_At = now; current.Revoked_Reason = certificateRegistryClean_(params.reason, 300) || "Revoked by LAND VIEW administration"; current.Updated_At = now;
    certificateRegistryWriteRow_(sheet, current._row, current);
    return { success: true, data: { certificate: certificateRegistryPublicRecord_(current) } };
  }
  if (op === "delete") {
    current.Status = "Deleted"; current.Deleted_At = now; current.Deleted_Reason = certificateRegistryClean_(params.reason, 300) || "Withdrawn by LAND VIEW administration"; current.Updated_At = now;
    certificateRegistryWriteRow_(sheet, current._row, current);
    return { success: true, data: { certificate: certificateRegistryPublicRecord_(current) } };
  }
  throw new Error("Unknown certificate registry operation.");
}
