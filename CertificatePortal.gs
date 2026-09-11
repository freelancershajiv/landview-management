/* LAND VIEW — UNIFIED CERTIFICATE REQUEST PORTAL
 * Client and Employee users may request certificates. Only Admin/Manager may
 * approve/reject requests. Issued certificates are returned only to the
 * concerned project client or employee.
 */

const CERT_PORTAL_REQUEST_SHEET_ = "Certificate Requests";
const CERT_PORTAL_REQUEST_HEADERS_ = [
  "Request_ID", "Requester_Role", "Requester_ID", "Project_ID", "Employee_ID",
  "Client_Name", "Mobile", "Certificate_Type", "Category", "Subject", "Details",
  "Status", "Certificate_ID", "Requested_At", "Reviewed_At", "Reviewed_By", "Admin_Note"
];

const CERT_PORTAL_CATEGORIES_ = {
  project: { label: "Project Certificate", type: "project", roles: ["client"] },
  structural_design: { label: "Structural Design Certificate", type: "project", roles: ["client"] },
  supervision: { label: "Supervision Certificate", type: "project", roles: ["client"] },
  building: { label: "Building Certificate", type: "building", roles: ["client"] },
  employee: { label: "Employee Certificate", type: "employee", roles: ["employee"] }
};

function certPortalClean_(value, maxLength) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, maxLength || 800);
}

function certPortalEnsureRequestSheet_() {
  const ss = getFinanceWorkbook_();
  let sheet = ss.getSheetByName(CERT_PORTAL_REQUEST_SHEET_);
  if (!sheet) sheet = ss.insertSheet(CERT_PORTAL_REQUEST_SHEET_);
  const width = Math.max(sheet.getLastColumn(), CERT_PORTAL_REQUEST_HEADERS_.length, 1);
  const existing = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(v) { return String(v || "").trim(); });
  if (!existing.some(function(v) { return !!v; })) {
    sheet.getRange(1, 1, 1, CERT_PORTAL_REQUEST_HEADERS_.length).setValues([CERT_PORTAL_REQUEST_HEADERS_]);
  } else {
    const headers = existing.slice();
    CERT_PORTAL_REQUEST_HEADERS_.forEach(function(header) {
      if (headers.indexOf(header) < 0) {
        headers.push(header);
        sheet.getRange(1, headers.length).setValue(header);
      }
    });
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function certPortalRequestRows_() {
  const sheet = certPortalEnsureRequestSheet_();
  if (sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
  return values.map(function(row, index) {
    const record = { _row: index + 2 };
    headers.forEach(function(header, col) { if (header) record[header] = row[col] === undefined ? "" : row[col]; });
    return record;
  }).filter(function(row) { return String(row.Request_ID || "").trim(); });
}

function certPortalPublicRequest_(row) {
  const category = String(row.Category || "").trim() || (String(row.Certificate_Type || "").toLowerCase() === "employee" ? "employee" : "project");
  return {
    requestId: String(row.Request_ID || ""),
    requesterRole: String(row.Requester_Role || (row.Employee_ID ? "employee" : "client") || "client").toLowerCase(),
    requesterId: String(row.Requester_ID || row.Employee_ID || row.Project_ID || ""),
    projectId: String(row.Project_ID || ""),
    employeeId: String(row.Employee_ID || ""),
    clientName: String(row.Client_Name || ""),
    mobile: String(row.Mobile || ""),
    certificateType: String(row.Certificate_Type || (category === "employee" ? "employee" : "project")),
    category: category,
    categoryLabel: CERT_PORTAL_CATEGORIES_[category] ? CERT_PORTAL_CATEGORIES_[category].label : String(row.Subject || "Certificate"),
    subject: String(row.Subject || ""),
    details: String(row.Details || ""),
    status: String(row.Status || "Pending"),
    certificateId: String(row.Certificate_ID || ""),
    requestedAt: String(row.Requested_At || ""),
    reviewedAt: String(row.Reviewed_At || ""),
    reviewedBy: String(row.Reviewed_By || ""),
    adminNote: String(row.Admin_Note || "")
  };
}

function certPortalWriteRequest_(sheet, rowIndex, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const values = headers.map(function(header) { return record[header] === undefined ? "" : record[header]; });
  if (rowIndex) sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
  else sheet.appendRow(values);
}

function certPortalEmployeeId_(session) {
  return certPortalClean_(session.employeeId || session.Employee_ID || session.userId || session.User_ID, 80);
}

function certPortalMyCertificates_(session) {
  if (typeof ensureCertificateRegistrySheet_ !== "function") return [];
  const sheet = ensureCertificateRegistrySheet_();
  const rows = certificateRegistryRows_(sheet);
  const role = normalizeRoleName(session.role);
  if (role === "client") {
    const allowed = {};
    (getAllowedProjectIds(session) || []).forEach(function(id) { allowed[normalizeFinanceWorkflowProjectId_(id)] = true; });
    return rows.filter(function(row) {
      return !!allowed[normalizeFinanceWorkflowProjectId_(row.Reference)];
    }).map(certificateRegistryPublicRecord_);
  }
  if (role === "employee") {
    const employeeId = certPortalEmployeeId_(session).toUpperCase();
    return rows.filter(function(row) {
      return employeeId && String(row.Reference || "").trim().toUpperCase() === employeeId;
    }).map(certificateRegistryPublicRecord_);
  }
  return [];
}

function certPortalMyRequests_(session) {
  const role = normalizeRoleName(session.role);
  const rows = certPortalRequestRows_();
  if (role === "client") {
    const allowed = {};
    (getAllowedProjectIds(session) || []).forEach(function(id) { allowed[normalizeFinanceWorkflowProjectId_(id)] = true; });
    return rows.filter(function(row) { return !!allowed[normalizeFinanceWorkflowProjectId_(row.Project_ID)]; }).map(certPortalPublicRequest_);
  }
  if (role === "employee") {
    const employeeId = certPortalEmployeeId_(session).toUpperCase();
    return rows.filter(function(row) {
      const rowId = String(row.Employee_ID || row.Requester_ID || "").trim().toUpperCase();
      return employeeId && rowId === employeeId;
    }).map(certPortalPublicRequest_);
  }
  return [];
}

function certPortalCreateRequest_(params, session) {
  const role = normalizeRoleName(session.role);
  if (["client", "employee"].indexOf(role) < 0) throw new Error("Only clients and employees submit certificate requests here.");
  const category = certPortalClean_(params.category || params.certificateCategory, 40).toLowerCase();
  const config = CERT_PORTAL_CATEGORIES_[category];
  if (!config || config.roles.indexOf(role) < 0) throw new Error("This certificate category is not available for your account.");

  let projectId = "";
  let employeeId = "";
  let requesterId = "";
  let name = certPortalClean_(session.name || session.Name || session.username || "", 120);
  let mobile = "";

  if (role === "client") {
    const allowed = (getAllowedProjectIds(session) || []).map(normalizeFinanceWorkflowProjectId_);
    projectId = normalizeFinanceWorkflowProjectId_(params.projectId || params.Project_ID || allowed[0] || "");
    if (!projectId || allowed.indexOf(projectId) < 0) throw new Error("Project access denied.");
    requesterId = projectId;
    try {
      const source = clientPortalFindProject_(getFinanceWorkbook_(), projectId);
      if (source && source.row) {
        name = clientPortalClientName_(source.row, name || projectId);
        mobile = clientPortalMobileFromProject_(source.row);
      }
    } catch (error) {}
  } else {
    employeeId = certPortalEmployeeId_(session);
    if (!employeeId) throw new Error("Employee ID is missing from this session.");
    requesterId = employeeId;
  }

  const existing = certPortalRequestRows_().find(function(row) {
    const sameRequester = role === "client"
      ? normalizeFinanceWorkflowProjectId_(row.Project_ID) === projectId
      : String(row.Employee_ID || row.Requester_ID || "").trim().toUpperCase() === employeeId.toUpperCase();
    return sameRequester && String(row.Category || "").trim().toLowerCase() === category && ["pending", "approved"].indexOf(String(row.Status || "").trim().toLowerCase()) >= 0;
  });
  if (existing) return { success: true, data: { request: certPortalPublicRequest_(existing), duplicate: true } };

  const requestId = "CR-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Dhaka", "yyyyMMdd-HHmmss") + "-" + Math.floor(100 + Math.random() * 900);
  const now = new Date().toISOString();
  const subject = certPortalClean_(params.subject, 160) || config.label;
  const record = {
    Request_ID: requestId,
    Requester_Role: role,
    Requester_ID: requesterId,
    Project_ID: projectId,
    Employee_ID: employeeId,
    Client_Name: name,
    Mobile: mobile,
    Certificate_Type: config.type,
    Category: category,
    Subject: subject,
    Details: certPortalClean_(params.details, 800),
    Status: "Pending",
    Certificate_ID: "",
    Requested_At: now,
    Reviewed_At: "",
    Reviewed_By: "",
    Admin_Note: ""
  };
  const sheet = certPortalEnsureRequestSheet_();
  certPortalWriteRequest_(sheet, null, record);
  return { success: true, data: { request: certPortalPublicRequest_(record), duplicate: false } };
}

function certPortalAdminList_(session) {
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  const requests = certPortalRequestRows_().map(certPortalPublicRequest_).sort(function(a, b) {
    return String(b.requestedAt || "").localeCompare(String(a.requestedAt || ""));
  });
  return { success: true, data: { requests: requests } };
}

function certPortalReview_(params, session) {
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  const requestId = certPortalClean_(params.requestId, 80);
  const decision = certPortalClean_(params.decision, 20).toLowerCase();
  if (["approved", "rejected"].indexOf(decision) < 0) throw new Error("Decision must be approved or rejected.");
  const sheet = certPortalEnsureRequestSheet_();
  const record = certPortalRequestRows_().find(function(row) { return String(row.Request_ID || "") === requestId; });
  if (!record) throw new Error("Certificate request not found.");
  if (String(record.Status || "").toLowerCase() === "issued") throw new Error("Issued requests cannot be changed.");
  record.Status = decision === "approved" ? "Approved" : "Rejected";
  record.Reviewed_At = new Date().toISOString();
  record.Reviewed_By = String(session.userId || session.username || "Admin");
  record.Admin_Note = certPortalClean_(params.note, 400);
  certPortalWriteRequest_(sheet, record._row, record);
  return { success: true, data: { request: certPortalPublicRequest_(record) } };
}

function certPortalLinkIssued_(params, session) {
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  const requestId = certPortalClean_(params.requestId, 80);
  const certificateId = certPortalClean_(params.certificateId, 80).toUpperCase();
  if (!requestId || !certificateId) throw new Error("Request ID and Certificate ID are required.");
  const sheet = certPortalEnsureRequestSheet_();
  const record = certPortalRequestRows_().find(function(row) { return String(row.Request_ID || "") === requestId; });
  if (!record) throw new Error("Certificate request not found.");
  record.Status = "Issued";
  record.Certificate_ID = certificateId;
  record.Reviewed_At = new Date().toISOString();
  record.Reviewed_By = String(session.userId || session.username || "Admin");
  certPortalWriteRequest_(sheet, record._row, record);
  return { success: true, data: { request: certPortalPublicRequest_(record) } };
}

function certificatePortalFromGateway_(params) {
  if (String((params && params._certificatePortal) || "").trim() !== "1") return null;
  const session = requireSession(params);
  const op = String((params && params.certificatePortalOp) || "mine").trim().toLowerCase();
  if (op === "mine") return { success: true, data: { requests: certPortalMyRequests_(session), certificates: certPortalMyCertificates_(session) } };
  if (op === "request") return certPortalCreateRequest_(params, session);
  if (op === "adminlist") return certPortalAdminList_(session);
  if (op === "review") return certPortalReview_(params, session);
  if (op === "linkissued") return certPortalLinkIssued_(params, session);
  throw new Error("Unknown certificate portal operation.");
}
