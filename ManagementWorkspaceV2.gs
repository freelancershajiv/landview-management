/* LAND VIEW — Management workspace + proposal system V2
 *
 * This file is intentionally self-contained so the production Code.gs can stay stable.
 * It extends the existing ERP action surface by intercepting the already-authenticated
 * getErpRecords/createErpRecord/updateErpRecord actions for V2 workspace modules.
 * It also makes selected existing read/write actions permission-aware for Employees.
 *
 * Proposal database:
 * LAND VIEW — Proposal & Prospective Client Database
 */

const LV2_PROPOSAL_DB_ID_ = "1xRRL01iXMVjxXHA4hxrDXoEothHWSnEPhNN-xaeUbn0";
const LV2_PROSPECTS_SHEET_ = "Prospective Clients";
const LV2_PROPOSALS_SHEET_ = "Proposals";
const LV2_ITEMS_SHEET_ = "Proposal Items";
const LV2_ACTIVITY_SHEET_ = "Proposal Activity";

const LV2_PERMISSION_KEYS_ = [
  "dashboard.view",
  "projects.view", "projects.edit",
  "workflow.view", "workflow.edit", "workflow.assign",
  "employees.view", "employees.manage",
  "requests.view",
  "certificates.view", "certificates.process", "certificates.issue",
  "finance.view", "finance.edit",
  "accounts.view", "accounts.edit",
  "ledger.view",
  "proposals.view", "proposals.create", "proposals.edit", "proposals.print", "proposals.view_all", "proposals.convert",
  "documents.view", "documents.edit",
  "site.view", "site.edit",
  "attendance.view", "attendance.edit",
  "expenses.submit", "expenses.view_all", "expenses.approve",
  "public.view", "public.edit",
  "reports.view"
];

function lv2Role_(session) {
  return normalizeRoleName(session && session.role);
}

function lv2IsManagementAdmin_(session) {
  const role = lv2Role_(session);
  return role === "admin" || role === "manager";
}

function lv2Permission_(session, key) {
  if (!session) return false;
  const role = lv2Role_(session);
  if (role === "admin" || role === "manager") return true;
  if (role === "accounts") {
    return [
      "dashboard.view", "projects.view", "finance.view", "finance.edit",
      "accounts.view", "accounts.edit", "ledger.view", "reports.view",
      "proposals.view", "proposals.create", "proposals.edit", "proposals.print"
    ].indexOf(String(key || "")) >= 0;
  }
  return typeof hasPermission_ === "function" && hasPermission_(session, String(key || ""));
}

function lv2Require_(session, key, message) {
  if (!lv2Permission_(session, key)) {
    throw new Error(message || ("Permission required: " + key));
  }
  return true;
}

function lv2Principals_(session) {
  const values = [session && session.userId, session && session.employeeId, session && session.username]
    .map(function(value) { return String(value || "").trim(); })
    .filter(Boolean);
  const seen = {};
  return values.filter(function(value) {
    const key = value.toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function lv2SelfPermissions_(session) {
  const result = {};
  LV2_PERMISSION_KEYS_.forEach(function(key) { result[key] = lv2Permission_(session, key); });
  return {
    userId: String(session.userId || ""),
    employeeId: String(session.employeeId || ""),
    username: String(session.username || ""),
    name: String(session.name || ""),
    role: String(session.role || ""),
    all: lv2IsManagementAdmin_(session),
    permissions: result
  };
}

function lv2ScopedProjects_(session) {
  const rows = readSheet(CONFIG.SHEETS.PROJECTS);
  if (lv2IsManagementAdmin_(session) || lv2Role_(session) === "accounts") return rows;
  return scopeProjectRecordsForSession(session, rows);
}

function lv2ManagementDashboard_(session) {
  lv2Require_(session, "dashboard.view");
  const projects = lv2ScopedProjects_(session);
  const activeProjects = projects.filter(function(row) { return isActiveRecord(row); });
  const projectIds = {};
  projects.forEach(function(row) {
    const id = String(firstValue(row, ["Project_ID", "Project ID", "ProjectId"]) || "").trim();
    if (id) projectIds[id] = true;
  });

  let documents = readSheet(CONFIG.SHEETS.DOCUMENTS);
  if (!lv2IsManagementAdmin_(session) && lv2Role_(session) !== "accounts") {
    documents = documents.filter(function(row) {
      const id = String(firstValue(row, ["Project_ID", "Project ID", "ProjectId"]) || "").trim();
      return !!projectIds[id];
    });
  }

  let employeeCount = 0;
  if (lv2Permission_(session, "employees.view")) employeeCount = readSheet(CONFIG.SHEETS.EMPLOYEES).length;

  let totalBill = 0;
  let totalPaid = 0;
  if (lv2Permission_(session, "finance.view") || lv2Permission_(session, "accounts.view") || lv2Permission_(session, "ledger.view")) {
    let bills = readSheet(CONFIG.SHEETS.BILLS);
    let payments = readSheet(CONFIG.SHEETS.PAYMENTS);
    if (!lv2IsManagementAdmin_(session) && lv2Role_(session) !== "accounts" && !lv2Permission_(session, "ledger.view")) {
      bills = bills.filter(function(row) { return !!projectIds[String(firstValue(row, ["Project_ID", "Project ID"]) || "").trim()]; });
      payments = payments.filter(function(row) { return !!projectIds[String(firstValue(row, ["Project_ID", "Project ID"]) || "").trim()]; });
    }
    totalBill = sumNetBillAmount_(bills);
    totalPaid = sumAmount(payments);
  }

  return {
    user: {
      userId: session.userId || "",
      employeeId: session.employeeId || "",
      username: session.username || "",
      name: session.name || "",
      role: session.role || ""
    },
    permissions: lv2SelfPermissions_(session).permissions,
    stats: {
      projectCount: projects.length,
      activeProjectCount: activeProjects.length,
      employeeCount: employeeCount,
      documentCount: documents.length,
      totalBill: totalBill,
      totalPaid: totalPaid,
      pendingPayments: totalBill - totalPaid
    },
    recentProjects: projects.slice(Math.max(0, projects.length - 10)).reverse()
  };
}

function lv2ProposalDb_() {
  return SpreadsheetApp.openById(LV2_PROPOSAL_DB_ID_);
}

function lv2Sheet_(name) {
  const sheet = lv2ProposalDb_().getSheetByName(name);
  if (!sheet) throw new Error("Proposal database sheet not found: " + name);
  return sheet;
}

function lv2Headers_(sheet) {
  if (sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function(v) { return String(v || "").trim(); });
}

function lv2Rows_(name) {
  const sheet = lv2Sheet_(name);
  const headers = lv2Headers_(sheet);
  if (sheet.getLastRow() < 2 || !headers.length) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row, index) {
    const record = { __row: index + 2 };
    headers.forEach(function(header, i) {
      const value = row[i];
      record[header] = Object.prototype.toString.call(value) === "[object Date]" ? value.toISOString() : value;
    });
    return record;
  }).filter(function(record) {
    return headers.some(function(header) { return String(record[header] == null ? "" : record[header]).trim() !== ""; });
  });
}

function lv2WriteRow_(name, idHeader, id, record) {
  const sheet = lv2Sheet_(name);
  const headers = lv2Headers_(sheet);
  const idIndex = headers.indexOf(idHeader);
  if (idIndex < 0) throw new Error(idHeader + " is missing from " + name + ".");
  let rowIndex = -1;
  if (sheet.getLastRow() >= 2 && id) {
    const ids = sheet.getRange(2, idIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || "").trim() === String(id || "").trim()) { rowIndex = i + 2; break; }
    }
  }
  const values = headers.map(function(header) { return record[header] === undefined ? "" : record[header]; });
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
  else { sheet.appendRow(values); rowIndex = sheet.getLastRow(); }
  return rowIndex;
}

function lv2NextId_(name, header, prefix, digits) {
  const rows = lv2Rows_(name);
  let max = 0;
  rows.forEach(function(row) {
    const value = String(row[header] || "");
    const match = value.match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return prefix + String(max + 1).padStart(digits || 4, "0");
}

function lv2Number_(value) {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  const n = Number(String(value == null ? "" : value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
}

function lv2DateOnly_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone() || "Asia/Dhaka", "yyyy-MM-dd");
}

function lv2AddDays_(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + Math.max(0, Number(days || 0)));
  return copy;
}

function lv2ProposalCanSee_(session, proposal) {
  if (lv2IsManagementAdmin_(session) || lv2Role_(session) === "accounts" || lv2Permission_(session, "proposals.view_all")) return true;
  const principals = lv2Principals_(session).map(function(value) { return value.toLowerCase(); });
  const assigned = String(proposal.Assigned_To || "").trim().toLowerCase();
  const created = String(proposal.Created_By || "").trim().toLowerCase();
  return principals.indexOf(assigned) >= 0 || principals.indexOf(created) >= 0;
}

function lv2ProposalList_(session) {
  lv2Require_(session, "proposals.view");
  return lv2Rows_(LV2_PROPOSALS_SHEET_)
    .filter(function(row) { return lv2ProposalCanSee_(session, row); })
    .map(function(row) { const copy = Object.assign({}, row); delete copy.__row; return copy; })
    .sort(function(a, b) { return String(b.Updated_At || b.Created_At || "").localeCompare(String(a.Updated_At || a.Created_At || "")); });
}

function lv2ProposalGet_(session, proposalId) {
  lv2Require_(session, "proposals.view");
  const id = String(proposalId || "").trim();
  const proposal = lv2Rows_(LV2_PROPOSALS_SHEET_).find(function(row) { return String(row.Proposal_ID || "").trim() === id; });
  if (!proposal || !lv2ProposalCanSee_(session, proposal)) throw new Error("Proposal not found or access denied.");
  const prospect = lv2Rows_(LV2_PROSPECTS_SHEET_).find(function(row) { return String(row.Prospect_ID || "").trim() === String(proposal.Prospect_ID || "").trim(); }) || null;
  const items = lv2Rows_(LV2_ITEMS_SHEET_).filter(function(row) { return String(row.Proposal_ID || "").trim() === id; }).sort(function(a, b) { return Number(a.Sort_Order || 0) - Number(b.Sort_Order || 0); });
  const activity = lv2Rows_(LV2_ACTIVITY_SHEET_).filter(function(row) { return String(row.Proposal_ID || "").trim() === id; }).sort(function(a, b) { return String(b.Performed_At || "").localeCompare(String(a.Performed_At || "")); });
  [proposal].concat(items, activity).forEach(function(row) { if (row) delete row.__row; });
  if (prospect) delete prospect.__row;
  return { proposal: proposal, prospect: prospect, items: items, activity: activity };
}

function lv2Activity_(session, proposal, action, fromStatus, toStatus, details, reference) {
  const record = {
    Activity_ID: lv2NextId_(LV2_ACTIVITY_SHEET_, "Activity_ID", "PA-", 6),
    Proposal_ID: String(proposal.Proposal_ID || ""),
    Prospect_ID: String(proposal.Prospect_ID || ""),
    Action: String(action || ""),
    From_Status: String(fromStatus || ""),
    To_Status: String(toStatus || ""),
    Performed_By: String(session.name || session.username || session.userId || ""),
    Performed_At: new Date().toISOString(),
    Details: String(details || "").slice(0, 1200),
    User_ID: String(session.userId || session.employeeId || ""),
    Role: String(session.role || ""),
    Reference: String(reference || "")
  };
  lv2WriteRow_(LV2_ACTIVITY_SHEET_, "Activity_ID", "", record);
}

function lv2NormalizeItems_(input) {
  const source = Array.isArray(input) ? input : [];
  return source.map(function(item, index) {
    const qty = Math.max(0, lv2Number_(item.Quantity === undefined ? item.quantity : item.Quantity));
    const rate = lv2Number_(item.Rate === undefined ? item.rate : item.Rate);
    const explicit = lv2Number_(item.Amount === undefined ? item.amount : item.Amount);
    const amount = explicit || (qty * rate);
    return {
      Service: String(item.Service || item.service || "").trim(),
      Description: String(item.Description || item.description || "").trim(),
      Quantity: qty || 1,
      Unit: String(item.Unit || item.unit || "Job").trim() || "Job",
      Rate: rate,
      Amount: amount,
      Sort_Order: index + 1,
      Status: "Active",
      Notes: String(item.Notes || item.notes || "").trim(),
      Category: String(item.Category || item.category || "Engineering").trim() || "Engineering",
      Taxable: String(item.Taxable || item.taxable || "FALSE")
    };
  }).filter(function(item) { return item.Service || item.Description || Math.abs(item.Amount) > 0.009; });
}

function lv2ReplaceItems_(session, proposalId, items) {
  const sheet = lv2Sheet_(LV2_ITEMS_SHEET_);
  const headers = lv2Headers_(sheet);
  const proposalCol = headers.indexOf("Proposal_ID");
  if (proposalCol < 0) throw new Error("Proposal_ID is missing from Proposal Items.");
  if (sheet.getLastRow() >= 2) {
    const values = sheet.getRange(2, proposalCol + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || "").trim() === proposalId) sheet.deleteRow(i + 2);
    }
  }
  const now = new Date().toISOString();
  items.forEach(function(item) {
    const record = Object.assign({}, item, {
      Item_ID: lv2NextId_(LV2_ITEMS_SHEET_, "Item_ID", "PI-", 6),
      Proposal_ID: proposalId,
      Created_At: now,
      Created_By: String(session.userId || session.employeeId || session.username || ""),
      Updated_At: now
    });
    lv2WriteRow_(LV2_ITEMS_SHEET_, "Item_ID", "", record);
  });
}

function lv2ProposalSave_(session, params, isUpdate) {
  const incoming = params && params.record ? params.record : params || {};
  const existingId = String(incoming.Proposal_ID || incoming.proposalId || params.id || "").trim();
  if (existingId) lv2Require_(session, "proposals.edit");
  else lv2Require_(session, "proposals.create");

  const clientName = String(incoming.Client_Name || incoming.clientName || "").trim();
  const phone = String(incoming.Phone || incoming.phone || "").trim();
  if (!clientName) throw new Error("Client name is required.");
  if (!phone) throw new Error("Phone number is required.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    let existing = null;
    if (existingId) {
      existing = lv2Rows_(LV2_PROPOSALS_SHEET_).find(function(row) { return String(row.Proposal_ID || "").trim() === existingId; }) || null;
      if (!existing || !lv2ProposalCanSee_(session, existing)) throw new Error("Proposal not found or access denied.");
    }

    let prospectId = String(incoming.Prospect_ID || (existing && existing.Prospect_ID) || "").trim();
    if (!prospectId) prospectId = lv2NextId_(LV2_PROSPECTS_SHEET_, "Prospect_ID", "PC-", 4);

    const assignedTo = String(incoming.Assigned_To || (existing && existing.Assigned_To) || (lv2Role_(session) === "employee" ? (session.employeeId || session.userId || "") : "")).trim();
    const prospect = {
      Prospect_ID: prospectId,
      Client_Name: clientName,
      Phone: phone,
      Email: String(incoming.Email || incoming.email || "").trim(),
      Address: String(incoming.Address || incoming.address || "").trim(),
      Source: String(incoming.Source || incoming.source || "").trim(),
      Assigned_To: assignedTo,
      Status: String(incoming.Prospect_Status || incoming.prospectStatus || "Prospect").trim() || "Prospect",
      Created_At: String((existing && existing.Created_At) || incoming.Prospect_Created_At || nowIso),
      Created_By: String((existing && existing.Created_By) || session.userId || session.employeeId || session.username || ""),
      Updated_At: nowIso,
      Notes: String(incoming.Prospect_Notes || incoming.prospectNotes || "").trim()
    };
    lv2WriteRow_(LV2_PROSPECTS_SHEET_, "Prospect_ID", prospectId, prospect);

    const proposalId = existingId || lv2NextId_(LV2_PROPOSALS_SHEET_, "Proposal_ID", "PROP-" + now.getFullYear() + "-", 4);
    const items = lv2NormalizeItems_(incoming.items || params.items || []);
    const gross = items.reduce(function(sum, item) { return sum + lv2Number_(item.Amount); }, 0);
    const discount = Math.max(0, lv2Number_(incoming.Discount || incoming.discount));
    const net = Math.max(0, gross - discount);
    const validityDays = Math.max(1, Number(incoming.Validity_Days || incoming.validityDays || 30));
    const statusBefore = String(existing && existing.Status || "");
    const status = String(incoming.Status || incoming.status || (existing ? existing.Status : "Draft")).trim() || "Draft";
    const createdAt = String(existing && existing.Created_At || nowIso);
    const createdBy = String(existing && existing.Created_By || session.userId || session.employeeId || session.username || "");
    const proposal = {
      Proposal_ID: proposalId,
      Prospect_ID: prospectId,
      Client_Name: clientName,
      Phone: phone,
      Email: prospect.Email,
      Address: prospect.Address,
      Project_Title: String(incoming.Project_Title || incoming.projectTitle || "").trim(),
      Project_Location: String(incoming.Project_Location || incoming.projectLocation || "").trim(),
      Project_Type: String(incoming.Project_Type || incoming.projectType || "").trim(),
      Plot_Area: String(incoming.Plot_Area || incoming.plotArea || "").trim(),
      Floors: String(incoming.Floors || incoming.floors || "").trim(),
      Gross_Amount: gross,
      Discount: discount,
      Net_Amount: net,
      Validity_Days: validityDays,
      Valid_Until: String(incoming.Valid_Until || incoming.validUntil || lv2DateOnly_(lv2AddDays_(now, validityDays))),
      Status: status,
      Assigned_To: assignedTo,
      Created_At: createdAt,
      Created_By: createdBy,
      Updated_At: nowIso,
      Notes: String(incoming.Notes || incoming.notes || "").trim(),
      Converted_Project_ID: String(existing && existing.Converted_Project_ID || incoming.Converted_Project_ID || ""),
      Last_Printed_At: String(existing && existing.Last_Printed_At || "")
    };
    lv2WriteRow_(LV2_PROPOSALS_SHEET_, "Proposal_ID", proposalId, proposal);
    lv2ReplaceItems_(session, proposalId, items);
    lv2Activity_(session, proposal, existing ? "Edited" : "Created", statusBefore, status, items.length + " service item(s); net BDT " + net, "");
    return lv2ProposalGet_(session, proposalId);
  } finally {
    lock.releaseLock();
  }
}

function lv2ProposalUpdate_(session, params) {
  const op = String(params.op || params.operation || "save").trim().toLowerCase();
  const proposalId = String(params.id || params.proposalId || (params.record && params.record.Proposal_ID) || "").trim();
  if (op === "save" || op === "edit") return lv2ProposalSave_(session, params, true);
  if (!proposalId) throw new Error("Proposal ID is required.");
  const bundle = lv2ProposalGet_(session, proposalId);
  const proposal = bundle.proposal;

  if (op === "print" || op === "markprinted") {
    lv2Require_(session, "proposals.print");
    const before = String(proposal.Status || "");
    proposal.Last_Printed_At = new Date().toISOString();
    if (["Draft", "Prepared"].indexOf(before) >= 0) proposal.Status = "Sent";
    proposal.Updated_At = new Date().toISOString();
    lv2WriteRow_(LV2_PROPOSALS_SHEET_, "Proposal_ID", proposalId, proposal);
    lv2Activity_(session, proposal, "Printed / PDF", before, proposal.Status, "Proposal printed or saved as PDF.", "");
    return lv2ProposalGet_(session, proposalId);
  }

  if (op === "status") {
    lv2Require_(session, "proposals.edit");
    const next = String(params.status || params.Status || "").trim();
    const allowed = ["Draft", "Prepared", "Sent", "Negotiating", "Accepted", "Rejected", "Expired", "Converted"];
    if (allowed.indexOf(next) < 0) throw new Error("Invalid proposal status.");
    const before = String(proposal.Status || "");
    proposal.Status = next;
    proposal.Updated_At = new Date().toISOString();
    lv2WriteRow_(LV2_PROPOSALS_SHEET_, "Proposal_ID", proposalId, proposal);
    lv2Activity_(session, proposal, "Status", before, next, String(params.note || params.Notes || ""), "");
    return lv2ProposalGet_(session, proposalId);
  }

  if (op === "convert") {
    lv2Require_(session, "proposals.convert");
    const before = String(proposal.Status || "");
    proposal.Status = "Converted";
    proposal.Converted_Project_ID = String(params.projectId || params.Converted_Project_ID || proposal.Converted_Project_ID || "").trim();
    proposal.Updated_At = new Date().toISOString();
    lv2WriteRow_(LV2_PROPOSALS_SHEET_, "Proposal_ID", proposalId, proposal);
    lv2Activity_(session, proposal, "Converted", before, "Converted", "Marked as converted to an active LAND VIEW client/project.", proposal.Converted_Project_ID);
    return lv2ProposalGet_(session, proposalId);
  }

  throw new Error("Unknown proposal operation.");
}

/* -------------------------------------------------------------------------
   Intercept safe custom modules through actions already allowed to Employees.
   ------------------------------------------------------------------------- */
var LV2_BASE_GET_ERP_RECORDS_ = getErpRecords;
var LV2_BASE_CREATE_ERP_RECORD_ = createErpRecord;
var LV2_BASE_UPDATE_ERP_RECORD_ = updateErpRecord;

getErpRecords = function(params) {
  const moduleName = String(params && params.module || "").trim();
  const session = requireSession(params || {});
  if (moduleName === "workspacePermissionsV2") return { success: true, data: lv2SelfPermissions_(session) };
  if (moduleName === "managementDashboardV2") return { success: true, data: lv2ManagementDashboard_(session) };
  if (moduleName === "proposalsV2") {
    const op = String(params.op || "list").trim().toLowerCase();
    if (op === "list") return { success: true, data: lv2ProposalList_(session) };
    if (op === "get") return { success: true, data: lv2ProposalGet_(session, params.id || params.proposalId) };
    throw new Error("Unknown proposal read operation.");
  }
  return LV2_BASE_GET_ERP_RECORDS_(params);
};

createErpRecord = function(params) {
  const moduleName = String(params && params.module || "").trim();
  if (moduleName === "proposalsV2") {
    const session = requireSession(params || {});
    return { success: true, data: lv2ProposalSave_(session, params, false) };
  }
  return LV2_BASE_CREATE_ERP_RECORD_(params);
};

updateErpRecord = function(params) {
  const moduleName = String(params && params.module || "").trim();
  if (moduleName === "proposalsV2") {
    const session = requireSession(params || {});
    return { success: true, data: lv2ProposalUpdate_(session, params) };
  }
  return LV2_BASE_UPDATE_ERP_RECORD_(params);
};

/* -------------------------------------------------------------------------
   Permission-aware bridge for existing Admin pages used by Employee accounts.
   The base backend remains unchanged for Admin/Manager/Accounts/Client.
   ------------------------------------------------------------------------- */
var LV2_BASE_AUTHORIZE_ACTION_REQUEST_ = authorizeActionRequest;
var LV2_BASE_GET_EMPLOYEES_ = getEmployees;
var LV2_BASE_GET_FINANCE_SHEET_ = typeof getFinanceSheet === "function" ? getFinanceSheet : null;
var LV2_BASE_GET_BILLING_DASHBOARD_ = getBillingDashboard;
var LV2_BASE_GET_BILLING_BOOK_ = getBillingBook;
var LV2_BASE_SAVE_BILL_ = saveBill;
var LV2_BASE_CREATE_BILL_ = createBill;
var LV2_BASE_SAVE_PAYMENT_ = savePayment;
var LV2_BASE_CREATE_PAYMENT_ = createPayment;
var LV2_BASE_CREATE_INVOICE_ = createInvoice;

function lv2FinanceSheetPermission_(params) {
  const tab = String(params && params.tab || "").trim().toLowerCase();
  if (tab === "file list") return "projects.view";
  if (tab === "workflow") return "workflow.view";
  if (["income", "expenses", "pending approvals", "categories", "source summary", "import audit", "auto invoice reconciliation", "auto invoice projects", "auto invoice billing lines"].indexOf(tab) >= 0) return "ledger.view";
  return "finance.view";
}

function lv2EmployeeActionPermission_(action, params) {
  const map = {
    getDashboard: "dashboard.view",
    getProjects: "projects.view", getProject: "projects.view", getProjectDriveFolder: "projects.view", getProjectServiceFolders: "projects.view",
    createProject: "projects.edit", updateProject: "projects.edit", deleteProject: "projects.edit", updateProjectEmployees: "projects.edit", syncProjectDriveFolders: "projects.edit",
    getEmployees: "employees.view", createEmployee: "employees.manage", updateEmployee: "employees.manage", deleteEmployee: "employees.manage",
    getDocuments: "documents.view", createDocument: "documents.edit", uploadProjectServiceFile: "documents.edit",
    getSiteVisits: "site.view", createSiteVisit: "site.edit",
    getBillingDashboard: "finance.view", getBillingBook: "finance.view", getProjectBilling: "finance.view", getBillingRecords: "finance.view", getPayments: "finance.view", getInvoices: "finance.view",
    saveBill: "finance.edit", createBill: "finance.edit", savePayment: "accounts.edit", createPayment: "accounts.edit", createInvoice: "finance.edit"
  };
  if (action === "getFinanceSheet") return lv2FinanceSheetPermission_(params);
  return map[action] || "";
}

authorizeActionRequest = function(action, params) {
  const token = String(params && params.token || "").trim();
  if (!token) return LV2_BASE_AUTHORIZE_ACTION_REQUEST_(action, params);
  const session = readSession(token);
  if (!session || lv2Role_(session) !== "employee") return LV2_BASE_AUTHORIZE_ACTION_REQUEST_(action, params);

  const permission = lv2EmployeeActionPermission_(String(action || ""), params || {});
  if (permission) {
    lv2Require_(session, permission, "You do not have permission to use this function.");
    return session;
  }

  /* Existing ERP actions still run through the original role/security rules. */
  return LV2_BASE_AUTHORIZE_ACTION_REQUEST_(action, params);
};

getEmployees = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_GET_EMPLOYEES_(params);
  lv2Require_(session, "employees.view");
  return {
    success: true,
    data: readSheet(CONFIG.SHEETS.EMPLOYEES).map(function(row) {
      return {
        Employee_ID: firstValue(row, ["Employee_ID", "Employee ID"]),
        Employee_Name: firstValue(row, ["Employee_Name", "Employee Name", "Name"]),
        Position: firstValue(row, ["Position", "Designation"]),
        Department: firstValue(row, ["Department"]),
        Email: firstValue(row, ["Email"]),
        Phone: firstValue(row, ["Phone", "Phone_Number"]),
        Status: firstValue(row, ["Status"]),
        Joining_Date: firstValue(row, ["Joining_Date", "Joining Date"])
      };
    })
  };
};

function lv2TemporarilyWorkspace_(callback) {
  const original = isWorkspaceRole;
  isWorkspaceRole = function(role) { return normalizeRoleName(role) === "employee" || original(role); };
  try { return callback(); } finally { isWorkspaceRole = original; }
}

function lv2TemporarilyAdmin_(callback) {
  const original = isAdminRole;
  isAdminRole = function(role) { return normalizeRoleName(role) === "employee" || original(role); };
  try { return callback(); } finally { isAdminRole = original; }
}

if (LV2_BASE_GET_FINANCE_SHEET_) {
  getFinanceSheet = function(params) {
    const session = requireSession(params || {});
    if (lv2Role_(session) !== "employee") return LV2_BASE_GET_FINANCE_SHEET_(params);
    lv2Require_(session, lv2FinanceSheetPermission_(params));
    return lv2TemporarilyWorkspace_(function() { return LV2_BASE_GET_FINANCE_SHEET_(params); });
  };
}

getBillingDashboard = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_GET_BILLING_DASHBOARD_(params);
  lv2Require_(session, "finance.view");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_GET_BILLING_DASHBOARD_(params); });
};

getBillingBook = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_GET_BILLING_BOOK_(params);
  lv2Require_(session, "finance.view");
  return lv2TemporarilyWorkspace_(function() { return LV2_BASE_GET_BILLING_BOOK_(params); });
};

saveBill = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_SAVE_BILL_(params);
  lv2Require_(session, "finance.edit");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_SAVE_BILL_(params); });
};
createBill = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_CREATE_BILL_(params);
  lv2Require_(session, "finance.edit");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_CREATE_BILL_(params); });
};
savePayment = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_SAVE_PAYMENT_(params);
  lv2Require_(session, "accounts.edit");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_SAVE_PAYMENT_(params); });
};
createPayment = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_CREATE_PAYMENT_(params);
  lv2Require_(session, "accounts.edit");
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_CREATE_PAYMENT_(params); });
};
createInvoice = function(params) {
  const session = requireSession(params || {});
  if (lv2Role_(session) !== "employee") return LV2_BASE_CREATE_INVOICE_(params);
  lv2Require_(session, "finance.edit");
  const projectId = String(params.projectId || params.Project_ID || "").trim();
  if (projectId) assertProjectAccess(session, projectId);
  return lv2TemporarilyAdmin_(function() { return LV2_BASE_CREATE_INVOICE_(params); });
};
