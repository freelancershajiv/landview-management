/* LAND VIEW — Auto Invoice workbook connection + billing-driven workflow storage. */

const FINANCE_WORKBOOK_ID_ = "1-JoPQqqntxP7NMVNHSYN-RYkHLWMQf4K";

const FINANCE_WORKFLOW_HEADERS_ = [
  "Task_ID", "Project_ID", "Project_Name", "Task_Title", "Assigned_Employee_ID",
  "Priority", "Start_Date", "Due_Date", "Status", "Progress", "Description",
  "Completed_At", "Created_At", "Updated_At"
];

const BILLING_WORKFLOW_SERVICES_ = [
  { title: "Architectural Design", category: "Engineering", aliases: ["architectural design", "architectural", "architect design"] },
  { title: "Structural Design", category: "Engineering", aliases: ["structural design", "structural"] },
  { title: "3D Design Exterior", category: "Engineering", aliases: ["3d design exterior", "3d exterior", "exterior 3d", "3d design - exterior"] },
  { title: "Electrical Design", category: "Engineering", aliases: ["electrical design", "electrical"] },
  { title: "Plumbing Design", category: "Engineering", aliases: ["plumbing design", "plumbing"] },
  { title: "Estimate & Costing", category: "Engineering", aliases: ["estimate & costing", "estimate and costing", "estimate costing", "cost estimate"] },
  { title: "Plan Approval Design", category: "Engineering", aliases: ["plan approval design", "plan approval"] },
  { title: "Soil Test", category: "Others", aliases: ["soil test", "soil testing"] },
  { title: "Digital Survey", category: "Others", aliases: ["digital survey", "measurement / digital survey", "measurement digital survey"] },
  { title: "Municipality File Pass", category: "Others", aliases: ["municipality file pass", "municipality pass", "file pass", "municipality file"] },
  { title: "Site Supervision", category: "Supervision", aliases: ["site supervision", "supervision"] }
];

function normalizeFinanceWorkflowProjectId_(value) {
  const raw = String(value || "").trim().toUpperCase();
  const digits = raw.replace(/\D/g, "");
  return digits ? "LV-" + Number(digits) : raw;
}

function normalizeWorkflowServiceText_(value) {
  return String(value || "").trim().toLowerCase().replace(/[–—_-]+/g, " ").replace(/&/g, " and ").replace(/\s+/g, " ");
}

function canonicalWorkflowService_(value, category) {
  const text = normalizeWorkflowServiceText_(value);
  if (!text) return "";
  for (let i = 0; i < BILLING_WORKFLOW_SERVICES_.length; i++) {
    const service = BILLING_WORKFLOW_SERVICES_[i];
    if (category && service.category !== category) continue;
    const aliases = [service.title].concat(service.aliases || []);
    for (let j = 0; j < aliases.length; j++) {
      const alias = normalizeWorkflowServiceText_(aliases[j]);
      if (text === alias || text.indexOf(alias) >= 0 || alias.indexOf(text) >= 0) return service.title;
    }
  }
  return "";
}

function getFinanceWorkbook_() {
  return SpreadsheetApp.openById(FINANCE_WORKBOOK_ID_);
}

function ensureFinanceWorkflowSheet_(ss) {
  const sheet = ss.getSheetByName("Workflow");
  if (!sheet) throw new Error('Finance worksheet "Workflow" was not found.');
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const existing = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) { return String(value || "").trim(); });
  if (!existing.some(function(value) { return !!value; })) {
    sheet.getRange(1, 1, 1, FINANCE_WORKFLOW_HEADERS_.length).setValues([FINANCE_WORKFLOW_HEADERS_]);
    return sheet;
  }
  let headers = existing.slice();
  FINANCE_WORKFLOW_HEADERS_.forEach(function(header) {
    if (headers.indexOf(header) < 0) {
      headers.push(header);
      sheet.getRange(1, headers.length).setValue(header);
    }
  });
  return sheet;
}

function financeWorkflowProjectNameMap_(ss) {
  const map = {};
  const sheet = ss.getSheetByName("File List");
  if (!sheet || sheet.getLastRow() < 2) return map;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  rows.forEach(function(row) {
    const id = normalizeFinanceWorkflowProjectId_(row[0]);
    if (id) map[id] = String(row[1] || "").trim();
  });
  return map;
}

function financeWorkflowProjectName_(ss, projectId) {
  return financeWorkflowProjectNameMap_(ss)[normalizeFinanceWorkflowProjectId_(projectId)] || "";
}

function financeWorkflowRecordFromParams_(params, ss, current) {
  const record = Object.assign({}, current || {});
  const allowed = FINANCE_WORKFLOW_HEADERS_.slice();
  allowed.forEach(function(key) { if (Object.prototype.hasOwnProperty.call(params, key)) record[key] = params[key]; });
  if (params.projectId && !record.Project_ID) record.Project_ID = params.projectId;
  if (params.id && !record.Task_ID) record.Task_ID = params.id;
  record.Project_ID = normalizeFinanceWorkflowProjectId_(record.Project_ID);
  if (!record.Project_Name && record.Project_ID) record.Project_Name = financeWorkflowProjectName_(ss, record.Project_ID);
  if (!record.Priority) record.Priority = "Normal";
  if (!record.Status) record.Status = "Pending";
  const progress = Number(record.Progress || 0);
  record.Progress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  if (String(record.Status).toLowerCase() === "completed") record.Progress = 100;
  return record;
}

function financeWorkflowRows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const width = Math.max(FINANCE_WORKFLOW_HEADERS_.length, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues();
  return values.map(function(row) {
    const record = {};
    headers.forEach(function(header, index) { if (header) record[header] = row[index] === undefined ? "" : row[index]; });
    return record;
  }).filter(function(record) { return String(record.Task_ID || record.Project_ID || "").trim(); });
}

function addWorkflowRequirement_(requirements, projectId, serviceTitle) {
  const id = normalizeFinanceWorkflowProjectId_(projectId);
  if (!id || !serviceTitle) return;
  if (!requirements[id]) requirements[id] = {};
  requirements[id][serviceTitle] = true;
}

function collectWorkflowRequirementsFromBillSheet_(ss, sheetName, category, requirements) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  const width = sheetName === "Supervision Bill" ? 7 : 6;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(width, Math.max(width, sheet.getLastColumn()))).getDisplayValues();
  rows.forEach(function(row) {
    const projectId = normalizeFinanceWorkflowProjectId_(row[0]);
    if (!projectId) return;
    if (category === "Supervision") {
      if (row.slice(2).some(function(value) { return String(value || "").trim(); })) addWorkflowRequirement_(requirements, projectId, "Site Supervision");
      return;
    }
    const serviceTitle = canonicalWorkflowService_(row[2], category);
    if (serviceTitle) addWorkflowRequirement_(requirements, projectId, serviceTitle);
  });
}

function billingWorkflowRequirements_(ss) {
  const requirements = {};
  collectWorkflowRequirementsFromBillSheet_(ss, "Design Bill", "Engineering", requirements);
  collectWorkflowRequirementsFromBillSheet_(ss, "Others Bill", "Others", requirements);
  collectWorkflowRequirementsFromBillSheet_(ss, "Supervision Bill", "Supervision", requirements);
  return requirements;
}

function syncBillingWorkflow_(ss, sheet) {
  const requirements = billingWorkflowRequirements_(ss);
  const projectNames = financeWorkflowProjectNameMap_(ss);
  const existing = financeWorkflowRows_(sheet);
  const existingKeys = {};
  existing.forEach(function(row) {
    const id = normalizeFinanceWorkflowProjectId_(row.Project_ID);
    const title = String(row.Task_Title || "").trim();
    if (id && title) existingKeys[id + "\n" + title] = true;
  });

  const headers = sheet.getRange(1, 1, 1, Math.max(FINANCE_WORKFLOW_HEADERS_.length, sheet.getLastColumn())).getDisplayValues()[0];
  const newRows = [];
  const now = new Date().toISOString();
  Object.keys(requirements).forEach(function(projectId) {
    Object.keys(requirements[projectId]).forEach(function(title) {
      const key = projectId + "\n" + title;
      if (existingKeys[key]) return;
      const record = {
        Task_ID: "WF-" + Utilities.getUuid().split("-")[0].toUpperCase(),
        Project_ID: projectId,
        Project_Name: projectNames[projectId] || "",
        Task_Title: title,
        Assigned_Employee_ID: "",
        Priority: "Normal",
        Start_Date: "",
        Due_Date: "",
        Status: "Pending",
        Progress: 0,
        Description: "Auto-created from billing service",
        Completed_At: "",
        Created_At: now,
        Updated_At: now
      };
      newRows.push(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
      existingKeys[key] = true;
    });
  });
  if (newRows.length) sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
  return { created: newRows.length, projects: Object.keys(requirements).length };
}

function handleFinanceWorkflowOperation_(params, session, ss, sheet) {
  const op = String(params.workflowOp || "").trim().toLowerCase();
  if (!op) return null;
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  const headers = sheet.getRange(1, 1, 1, Math.max(FINANCE_WORKFLOW_HEADERS_.length, sheet.getLastColumn())).getDisplayValues()[0];

  if (op === "sync") {
    return { success: true, data: syncBillingWorkflow_(ss, sheet) };
  }

  if (op === "create") {
    const record = financeWorkflowRecordFromParams_(params, ss, {});
    if (!record.Project_ID) throw new Error("Project ID is required.");
    if (!String(record.Task_Title || "").trim()) throw new Error("Workflow stage is required.");
    const existing = financeWorkflowRows_(sheet).find(function(row) {
      return normalizeFinanceWorkflowProjectId_(row.Project_ID) === record.Project_ID && String(row.Task_Title || "").trim() === String(record.Task_Title || "").trim();
    });
    if (existing) return { success: true, data: existing };
    record.Task_ID = String(record.Task_ID || ("WF-" + Utilities.getUuid().split("-")[0].toUpperCase()));
    record.Created_At = String(record.Created_At || new Date().toISOString());
    record.Updated_At = new Date().toISOString();
    sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
    return { success: true, data: record };
  }

  if (op === "update") {
    const taskId = String(params.id || params.Task_ID || "").trim();
    if (!taskId) throw new Error("Workflow Task ID is required.");
    if (sheet.getLastRow() < 2) throw new Error("Workflow record not found.");
    const idIndex = headers.indexOf("Task_ID");
    if (idIndex < 0) throw new Error("Workflow Task_ID column was not found.");
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    let rowIndex = -1;
    let current = {};
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][idIndex] || "").trim() === taskId) {
        rowIndex = i + 2;
        headers.forEach(function(header, index) { if (header) current[header] = values[i][index]; });
        break;
      }
    }
    if (rowIndex < 0) throw new Error("Workflow record not found.");
    const record = financeWorkflowRecordFromParams_(params, ss, current);
    record.Task_ID = taskId;
    record.Created_At = current.Created_At || new Date().toISOString();
    record.Updated_At = new Date().toISOString();
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([headers.map(function(header) { return record[header] === undefined ? "" : record[header]; })]);
    return { success: true, data: record };
  }
  throw new Error("Unknown Workflow operation.");
}

function getFinanceSheet(params) {
  const session = requireSession(params);
  if (!isWorkspaceRole(session.role)) throw new Error("Access denied.");

  const widths = {
    "Summary": 18, "Invoice": 20, "File List": 8, "Design Bill": 6, "Design Deposit": 5,
    "Supervision Bill": 7, "S Deposit": 5, "Others Bill": 6, "Others Bill Deposit": 5, "Workflow": 14
  };
  const tab = String(params.tab || "Summary");
  if (!Object.prototype.hasOwnProperty.call(widths, tab)) throw new Error("Unknown finance worksheet.");
  const ss = getFinanceWorkbook_();
  let sheet = null;
  if (tab === "S Deposit") sheet = ss.getSheetByName("Supervision Deposit") || ss.getSheetByName("S Deposit");
  else if (tab === "Workflow") sheet = ensureFinanceWorkflowSheet_(ss);
  else sheet = ss.getSheetByName(tab);
  if (!sheet) throw new Error(tab === "S Deposit" ? 'Supervision Deposit worksheet was not found. Name the tab either "Supervision Deposit" or "S Deposit".' : 'Finance worksheet "' + tab + '" was not found.');

  if (tab === "Workflow") {
    const workflowResult = handleFinanceWorkflowOperation_(params, session, ss, sheet);
    if (workflowResult) return workflowResult;
    syncBillingWorkflow_(ss, sheet);
  }

  const summary = ss.getSheetByName("Summary");
  if (!summary) throw new Error('Finance worksheet "Summary" was not found.');
  if (summary.getLastRow() > 10000 || sheet.getLastRow() > 10000) throw new Error("Finance worksheet exceeds the 10,000-row reading limit.");

  const summaryRows = summary.getRange(1, 1, Math.max(1, summary.getLastRow()), 18).getValues().slice(1);
  const totals = { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 };
  const populatedIds = Object.create(null);
  const number = function(value) {
    if (value === "" || value === null || value === undefined) return 0;
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error("A Summary amount is invalid. Check formulas in the Google Sheet.");
    return result;
  };
  const hasValue = function(value) { return value !== "" && value !== null && value !== undefined && value !== 0; };

  summaryRows.forEach(function(row) {
    if (!row[0] || (!hasValue(row[1]) && !row.slice(3, 16).some(hasValue))) return;
    populatedIds[String(row[0])] = true;
    totals.projects++;
    totals.gross += number(row[3]) + number(row[7]) + number(row[11]);
    totals.discount += number(row[4]) + number(row[8]) + number(row[12]);
    totals.paid += number(row[5]) + number(row[9]) + number(row[13]);
    totals.due += number(row[15]);
  });

  totals.billed = totals.gross - totals.discount;
  if (Math.abs(totals.billed - totals.paid - totals.due) > 0.01) throw new Error("Summary totals do not reconcile. Check the Google Sheet before using these balances.");

  const height = tab === "Invoice" ? Math.min(40, Math.max(1, sheet.getLastRow())) : Math.max(1, sheet.getLastRow());
  const readWidth = tab === "Summary" ? Math.max(18, Math.min(30, sheet.getLastColumn())) : widths[tab];
  const grid = sheet.getRange(1, 1, height, readWidth).getDisplayValues();
  let headers = tab === "Invoice" ? Array.from({ length: readWidth }, function(_, i) { return String.fromCharCode(65 + i); }) : grid[0];
  let rows = (tab === "Invoice" ? grid : grid.slice(1)).filter(function(row) {
    if (tab === "Invoice") return row.some(hasValue);
    if (tab === "Summary") return !!populatedIds[String(row[0])];
    if (tab === "File List") return hasValue(row[0]);
    if (tab === "Workflow") return hasValue(row[0]) || hasValue(row[1]);
    return row.slice(2).some(hasValue);
  });

  if (tab !== "Summary" && !["Invoice", "File List", "Workflow"].includes(tab)) {
    const omit = 1;
    headers = headers.filter(function(_, i) { return i !== omit; });
    rows = rows.map(function(row) { return row.filter(function(_, i) { return i !== omit; }); });
  }

  return {
    success: true,
    data: { tab: tab, tabs: Object.keys(widths), headers: headers, rows: rows, totals: totals, url: ss.getUrl() + "#gid=" + sheet.getSheetId(), updatedAt: new Date().toISOString() }
  };
}

/* Permanent QR verification source. */
function getPublicBillingVerification(params) {
  const raw = String((params && params.fileId) || "").trim().toUpperCase();
  const digits = raw.replace(/\D/g, "");
  const fileId = raw.indexOf("LV-") === 0 ? raw : (digits ? "LV-" + digits : "");
  if (!/^LV-\d+$/.test(fileId)) throw new Error("Invalid File ID.");
  const ss = getFinanceWorkbook_();
  const summary = ss.getSheetByName("Summary");
  if (!summary) throw new Error('Finance worksheet "Summary" was not found.');
  const lastRow = summary.getLastRow();
  if (lastRow < 2) throw new Error("Project billing record was not found.");
  if (lastRow > 10000) throw new Error("Finance worksheet exceeds the 10,000-row reading limit.");
  const values = summary.getRange(2, 1, lastRow - 1, 18).getValues();
  const normalizeId = function(value) {
    const text = String(value || "").trim().toUpperCase();
    const idDigits = text.replace(/\D/g, "");
    return text.indexOf("LV-") === 0 ? text : (idDigits ? "LV-" + idDigits : "");
  };
  const amount = function(value, label) {
    if (value === "" || value === null || value === undefined) return 0;
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(label + " is invalid in the Summary sheet.");
    return Math.round(result * 100) / 100;
  };
  let row = null;
  for (let i = 0; i < values.length; i++) { if (normalizeId(values[i][0]) === fileId) { row = values[i]; break; } }
  if (!row) throw new Error("Project billing record was not found.");
  const categories = [
    { name: "Engineering", gross: amount(row[3], "Engineering Bill"), discount: amount(row[4], "Engineering Discount"), paid: amount(row[5], "Engineering Deposit"), due: amount(row[6], "Engineering Due") },
    { name: "Supervision", gross: amount(row[7], "Supervision Bill"), discount: amount(row[8], "Supervision Discount"), paid: amount(row[9], "Supervision Deposit"), due: amount(row[10], "Supervision Due") },
    { name: "Others", gross: amount(row[11], "Others Bill"), discount: amount(row[12], "Others Discount"), paid: amount(row[13], "Others Deposit"), due: amount(row[14], "Others Due") }
  ];
  const totals = categories.reduce(function(acc, item) { acc.gross += item.gross; acc.discount += item.discount; acc.paid += item.paid; acc.due += item.due; return acc; }, { gross: 0, discount: 0, paid: 0, due: 0 });
  totals.gross = Math.round(totals.gross * 100) / 100;
  totals.discount = Math.round(totals.discount * 100) / 100;
  totals.paid = Math.round(totals.paid * 100) / 100;
  totals.due = Math.round(totals.due * 100) / 100;
  const summaryTotalDue = amount(row[15], "Total Due");
  if (Math.abs(summaryTotalDue - totals.due) > 0.01) throw new Error("Project due amounts do not reconcile with Total Due in the Summary sheet.");
  categories.forEach(function(item) {
    const calculatedDue = Math.round((item.gross - item.discount - item.paid) * 100) / 100;
    if (Math.abs(calculatedDue - item.due) > 0.01) throw new Error(item.name + " billing does not reconcile in the Summary sheet.");
  });
  const status = String(row[16] || "").trim() || (totals.due > 0 ? "Due" : totals.due < 0 ? "Credit" : "Full Paid");
  return {
    success: true,
    data: {
      fileId: fileId, clientName: String(row[1] || "").trim(), contact: String(row[2] || "").trim(), status: status,
      categories: categories,
      totals: { gross: totals.gross, discount: totals.discount, paid: totals.paid, due: summaryTotalDue },
      updatedAt: new Date().toISOString()
    }
  };
}
