/* LAND VIEW — CLIENT PORTAL BACKEND
 * Project-ID + mobile login, billing/workflow workspace and certificate requests.
 * This file is reached through getPublicProjects() in PublicProjects.gs.
 */

const CLIENT_CERT_REQUEST_SHEET_ = "Certificate Requests";
const CLIENT_CERT_REQUEST_HEADERS_ = [
  "Request_ID", "Project_ID", "Client_Name", "Mobile", "Certificate_Type", "Subject",
  "Details", "Status", "Certificate_ID", "Requested_At", "Reviewed_At", "Reviewed_By", "Admin_Note"
];

function clientPortalClean_(value, maxLength) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, maxLength || 500);
}

function clientPortalPhone_(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.indexOf("880") === 0 && digits.length >= 13) digits = "0" + digits.slice(3);
  if (digits.length === 10 && digits.charAt(0) === "1") digits = "0" + digits;
  return digits;
}

function clientPortalRows_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(v) { return String(v || "").trim(); });
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues().map(function(row, index) {
    const record = { _row: index + 2 };
    headers.forEach(function(header, column) { if (header) record[header] = row[column] === undefined ? "" : row[column]; });
    return record;
  });
}

function clientPortalPick_(row, keys) {
  for (let i = 0; i < keys.length; i++) {
    const value = row && row[keys[i]];
    if (String(value == null ? "" : value).trim()) return value;
  }
  return "";
}

function clientPortalProjectId_(row) {
  return normalizeFinanceWorkflowProjectId_(clientPortalPick_(row, ["FILE ID", "File ID", "File_ID", "Project_ID", "Project ID", "ProjectId"]));
}

function clientPortalFindProject_(ss, projectId) {
  const id = normalizeFinanceWorkflowProjectId_(projectId);
  if (!id) return null;
  const sources = ["File List", "Summary"];
  for (let s = 0; s < sources.length; s++) {
    const rows = clientPortalRows_(ss, sources[s]);
    const found = rows.find(function(row) { return clientPortalProjectId_(row) === id; });
    if (found) return { row: found, source: sources[s] };
  }
  return null;
}

function clientPortalMobileFromProject_(row) {
  return clientPortalPhone_(clientPortalPick_(row, [
    "Contact", "CONTACT", "Mobile", "Mobile Number", "Mobile_Number", "Phone", "Phone Number", "Phone_Number", "Client Phone", "Client_Phone"
  ]));
}

function clientPortalClientName_(row, fallback) {
  return clientPortalClean_(clientPortalPick_(row, ["Client Name", "Client_Name", "CLIENT NAME", "Name", "Client", "Project Name", "Project_Name"]), 120) || fallback;
}

function ensureClientCertificateRequestSheet_() {
  const ss = getFinanceWorkbook_();
  let sheet = ss.getSheetByName(CLIENT_CERT_REQUEST_SHEET_);
  if (!sheet) sheet = ss.insertSheet(CLIENT_CERT_REQUEST_SHEET_);
  const width = Math.max(sheet.getLastColumn(), CLIENT_CERT_REQUEST_HEADERS_.length, 1);
  const existing = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function(v) { return String(v || "").trim(); });
  if (!existing.some(function(v) { return !!v; })) {
    sheet.getRange(1, 1, 1, CLIENT_CERT_REQUEST_HEADERS_.length).setValues([CLIENT_CERT_REQUEST_HEADERS_]);
  } else {
    const headers = existing.slice();
    CLIENT_CERT_REQUEST_HEADERS_.forEach(function(header) {
      if (headers.indexOf(header) < 0) {
        headers.push(header);
        sheet.getRange(1, headers.length).setValue(header);
      }
    });
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function clientCertificateRequests_() {
  const sheet = ensureClientCertificateRequestSheet_();
  return clientPortalRows_(sheet.getParent(), CLIENT_CERT_REQUEST_SHEET_).filter(function(row) {
    return String(row.Request_ID || "").trim();
  });
}

function clientCertificatePublic_(row) {
  return {
    requestId: String(row.Request_ID || ""),
    projectId: String(row.Project_ID || ""),
    clientName: String(row.Client_Name || ""),
    mobile: String(row.Mobile || ""),
    certificateType: String(row.Certificate_Type || "project"),
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

function clientPortalSession_(params) {
  const session = requireSession(params);
  if (normalizeRoleName(session.role) !== "client") throw new Error("Client access required.");
  return session;
}

function clientPortalLogin_(params) {
  const projectId = normalizeFinanceWorkflowProjectId_(params.projectId || params.Project_ID || "");
  const mobile = clientPortalPhone_(params.mobile || params.phone || params.Mobile || "");
  if (!projectId || !mobile) return { success: false, error: "Project ID and mobile number are required." };

  const ss = getFinanceWorkbook_();
  let match = clientPortalFindProject_(ss, projectId);
  if (!match) return { success: false, error: "Project ID or mobile number did not match our records." };

  let storedMobile = clientPortalMobileFromProject_(match.row);
  let clientName = clientPortalClientName_(match.row, projectId);

  // File List may not carry the phone while Summary does, so check both before failing.
  if (!storedMobile) {
    const summary = clientPortalRows_(ss, "Summary").find(function(row) { return clientPortalProjectId_(row) === projectId; });
    if (summary) {
      storedMobile = clientPortalMobileFromProject_(summary);
      clientName = clientPortalClientName_(summary, clientName);
    }
  }

  if (!storedMobile || storedMobile !== mobile) {
    return { success: false, error: "Project ID or mobile number did not match our records." };
  }

  const virtualUser = {
    User_ID: "CLIENT-" + projectId,
    Username: projectId,
    Name: clientName,
    Role: "Client",
    Project_IDs: projectId
  };
  const token = createSession(virtualUser);
  const safeUser = sanitizeUser(virtualUser);
  safeUser.projectIds = projectId;
  safeUser.Project_IDs = projectId;
  return { success: true, data: { token: token, user: safeUser, projectId: projectId } };
}

function clientPortalWorkspace_(params) {
  const session = clientPortalSession_(params);
  const allowed = getAllowedProjectIds(session) || [];
  if (!allowed.length) throw new Error("No project is linked to this client session.");

  const ss = getFinanceWorkbook_();
  const workflowSheet = ensureFinanceWorkflowSheet_(ss);
  syncBillingWorkflow_(ss, workflowSheet);
  const workflowRows = financeWorkflowRows_(workflowSheet);
  const summaryRows = clientPortalRows_(ss, "Summary");
  const invoiceRows = clientPortalRows_(ss, "Invoice");
  const requestRows = clientCertificateRequests_();
  const billingSheets = ["Design Bill", "Design Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"];

  const projects = allowed.map(function(rawId) {
    const id = normalizeFinanceWorkflowProjectId_(rawId);
    const source = clientPortalFindProject_(ss, id);
    const summary = summaryRows.find(function(row) { return clientPortalProjectId_(row) === id; }) || {};
    const base = source ? source.row : summary;
    const tasks = workflowRows.filter(function(row) { return normalizeFinanceWorkflowProjectId_(row.Project_ID) === id; });
    const completed = tasks.filter(function(row) { return String(row.Status || "").trim().toLowerCase() === "completed"; }).length;
    const bill = Number(String(clientPortalPick_(summary, ["Engineering Bill"]) || 0).replace(/[^0-9.-]/g, "")) +
      Number(String(clientPortalPick_(summary, ["Supervision Bill"]) || 0).replace(/[^0-9.-]/g, "")) +
      Number(String(clientPortalPick_(summary, ["Others Bill"]) || 0).replace(/[^0-9.-]/g, ""));
    const paid = Number(String(clientPortalPick_(summary, ["Engineering Deposit"]) || 0).replace(/[^0-9.-]/g, "")) +
      Number(String(clientPortalPick_(summary, ["S Deposit"]) || 0).replace(/[^0-9.-]/g, "")) +
      Number(String(clientPortalPick_(summary, ["OB Deposit"]) || 0).replace(/[^0-9.-]/g, ""));
    const dueRaw = clientPortalPick_(summary, ["Total Due", "Due", "Balance Due"]);
    const due = String(dueRaw || "").trim() ? Number(String(dueRaw).replace(/[^0-9.-]/g, "")) || 0 : Math.max(0, bill - paid);

    const billing = {};
    billingSheets.forEach(function(sheetName) {
      billing[sheetName] = clientPortalRows_(ss, sheetName).filter(function(row) { return clientPortalProjectId_(row) === id; });
    });

    return {
      projectId: id,
      clientName: clientPortalClientName_(base, id),
      projectName: clientPortalClean_(clientPortalPick_(base, ["Project Name", "Project_Name", "Project Type", "Project_Type", "Name"]), 160) || id,
      location: clientPortalClean_(clientPortalPick_(base, ["Location", "Project Location", "Project_Location", "Address"]), 220),
      mobile: clientPortalMobileFromProject_(base),
      status: clientPortalClean_(clientPortalPick_(summary, ["Status"]) || clientPortalPick_(base, ["Status"]), 40) || "Active",
      finance: {
        totalBill: bill,
        totalPaid: paid,
        due: due,
        engineeringBill: clientPortalPick_(summary, ["Engineering Bill"]),
        engineeringPaid: clientPortalPick_(summary, ["Engineering Deposit"]),
        engineeringDue: clientPortalPick_(summary, ["Engineering Due"]),
        supervisionBill: clientPortalPick_(summary, ["Supervision Bill"]),
        supervisionPaid: clientPortalPick_(summary, ["S Deposit"]),
        supervisionDue: clientPortalPick_(summary, ["SB Due"]),
        othersBill: clientPortalPick_(summary, ["Others Bill"]),
        othersPaid: clientPortalPick_(summary, ["OB Deposit"]),
        othersDue: clientPortalPick_(summary, ["OB Due"])
      },
      workflow: tasks,
      progress: tasks.length ? Math.round(completed * 100 / tasks.length) : 0,
      completedServices: completed,
      totalServices: tasks.length,
      invoices: invoiceRows.filter(function(row) { return clientPortalProjectId_(row) === id; }),
      billing: billing,
      certificateRequests: requestRows.filter(function(row) { return normalizeFinanceWorkflowProjectId_(row.Project_ID) === id; }).map(clientCertificatePublic_)
    };
  });

  return { success: true, data: { projects: projects, client: { name: session.name || "Client", projectIds: allowed }, updatedAt: new Date().toISOString() } };
}

function clientPortalRequestCertificate_(params) {
  const session = clientPortalSession_(params);
  const allowed = getAllowedProjectIds(session) || [];
  const projectId = normalizeFinanceWorkflowProjectId_(params.projectId || params.Project_ID || allowed[0] || "");
  if (!projectId || allowed.indexOf(projectId) < 0) throw new Error("Project access denied.");

  const type = clientPortalClean_(params.certificateType || params.type || "project", 30).toLowerCase();
  if (["project", "building"].indexOf(type) < 0) throw new Error("Invalid certificate request type.");
  const subject = clientPortalClean_(params.subject, 160) || (type === "building" ? "Building Certificate" : "Project Certificate");
  const details = clientPortalClean_(params.details, 800);
  const existing = clientCertificateRequests_().find(function(row) {
    return normalizeFinanceWorkflowProjectId_(row.Project_ID) === projectId && String(row.Status || "").toLowerCase() === "pending" && String(row.Certificate_Type || "").toLowerCase() === type;
  });
  if (existing) return { success: true, data: { request: clientCertificatePublic_(existing), duplicate: true } };

  const ss = getFinanceWorkbook_();
  const source = clientPortalFindProject_(ss, projectId);
  const row = source ? source.row : {};
  const requestId = "CR-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Dhaka", "yyyyMMdd-HHmmss") + "-" + Math.floor(100 + Math.random() * 900);
  const now = new Date().toISOString();
  const record = {
    Request_ID: requestId,
    Project_ID: projectId,
    Client_Name: clientPortalClientName_(row, session.name || projectId),
    Mobile: clientPortalMobileFromProject_(row),
    Certificate_Type: type,
    Subject: subject,
    Details: details,
    Status: "Pending",
    Certificate_ID: "",
    Requested_At: now,
    Reviewed_At: "",
    Reviewed_By: "",
    Admin_Note: ""
  };
  const sheet = ensureClientCertificateRequestSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
  return { success: true, data: { request: clientCertificatePublic_(record) } };
}

function clientPortalAdminRequests_(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  const rows = clientCertificateRequests_().map(clientCertificatePublic_).sort(function(a, b) { return String(b.requestedAt).localeCompare(String(a.requestedAt)); });
  return { success: true, data: { requests: rows } };
}

function clientPortalReviewRequest_(params) {
  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Admin or Manager access required.");
  const requestId = clientPortalClean_(params.requestId, 80);
  const decision = clientPortalClean_(params.decision, 20).toLowerCase();
  if (["approved", "rejected"].indexOf(decision) < 0) throw new Error("Decision must be approved or rejected.");
  const sheet = ensureClientCertificateRequestSheet_();
  const rows = clientCertificateRequests_();
  const record = rows.find(function(row) { return String(row.Request_ID || "") === requestId; });
  if (!record) throw new Error("Certificate request not found.");

  record.Status = decision === "approved" ? "Approved" : "Rejected";
  record.Reviewed_At = new Date().toISOString();
  record.Reviewed_By = String(session.userId || session.username || "Admin");
  record.Admin_Note = clientPortalClean_(params.note, 400);
  if (params.certificateId) record.Certificate_ID = clientPortalClean_(params.certificateId, 80).toUpperCase();

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  sheet.getRange(record._row, 1, 1, headers.length).setValues([headers.map(function(header) { return record[header] === undefined ? "" : record[header]; })]);
  return { success: true, data: { request: clientCertificatePublic_(record) } };
}

function clientPortalGateway_(params) {
  if (String((params && params._clientPortal) || "").trim() !== "1") return null;
  const op = String((params && params.clientOp) || "workspace").trim().toLowerCase();
  if (op === "login") return clientPortalLogin_(params);
  if (op === "workspace") return clientPortalWorkspace_(params);
  if (op === "requestcertificate") return clientPortalRequestCertificate_(params);
  if (op === "adminrequests") return clientPortalAdminRequests_(params);
  if (op === "reviewrequest") return clientPortalReviewRequest_(params);
  throw new Error("Unknown client portal operation.");
}
