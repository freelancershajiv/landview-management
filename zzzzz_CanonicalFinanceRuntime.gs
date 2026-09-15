/* LAND VIEW — CANONICAL FINANCE RUNTIME
 *
 * Final runtime overrides loaded after the legacy compatibility files.
 * Canonical sources:
 *   Core: Projects
 *   Finance: Bills, Payments, Invoices, Expenses, Accounts, Transfers, Transactions, Import Audit
 *
 * Legacy invoice-style tabs are generated in memory from canonical rows. They are
 * never read as a financial source of truth.
 */

const LV_CANONICAL_BILL_CATEGORIES_ = ["Engineering Bill", "Supervision Bill", "Other Services Bill"];
const LV_CANONICAL_COMPAT_TABS_ = [
  "Summary", "File List", "Design Bill", "Design Deposit",
  "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"
];
const LV_CANONICAL_FINANCE_TABS_ = [
  "Bills", "Payments", "Invoices", "Expenses", "Accounts",
  "Transfers", "Transactions", "Import Audit"
];

function lvCanonicalText_(value) {
  return String(value == null ? "" : value).trim();
}

function lvCanonicalNumber_(value) {
  const number = Number(String(value == null ? 0 : value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return isFinite(number) ? number : 0;
}

function lvCanonicalFirst_(record, keys) {
  if (!record) return "";
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
  }
  return "";
}

function lvCanonicalNormalizeProjectId_(value) {
  const raw = lvCanonicalText_(value).toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? "LV-" + Number(match[1]) : raw;
}

function lvCanonicalCategory_(record) {
  const explicit = lvCanonicalText_(lvCanonicalFirst_(record, [
    "Billing_Category", "Billing Category", "Category",
    "Income_Category", "Income Category", "Payment_For", "Payment For"
  ]));
  const description = lvCanonicalText_(lvCanonicalFirst_(record, [
    "Description", "Service", "Particulars", "Item", "Notes"
  ]));
  const text = (explicit + " " + description)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "Other Services Bill";
  if (/\bsupervision\b|site supervision/.test(text)) return "Supervision Bill";
  if (
    /\bengineering\b|\bdesign\b|architect|structur|electrical|plumbing|\b3d\b|estimate|costing|plan approval/.test(text)
  ) return "Engineering Bill";
  if (/\bother\b|\bothers\b|soil|survey|municipality|site visit|printing|document|material|certificate|rent/.test(text)) {
    return "Other Services Bill";
  }
  if (text === "engineering") return "Engineering Bill";
  if (text === "supervision") return "Supervision Bill";
  return "Other Services Bill";
}

function lvCanonicalBillEffective_(bill) {
  const status = lvCanonicalText_(lvCanonicalFirst_(bill, ["Status", "Bill_Status", "Bill Status"]))
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  return ["cancelled", "canceled", "void", "voided", "rejected"].indexOf(status) < 0;
}

function lvCanonicalPaymentEffective_(payment) {
  const type = lvCanonicalText_(lvCanonicalFirst_(payment, ["Transaction_Type", "Transaction Type"])).toLowerCase();
  if (type === "personal income") return false;

  const impact = lvCanonicalFirst_(payment, ["Affects_Business_Balance", "Affects Business Balance"]);
  if (impact === false) return false;
  const impactText = lvCanonicalText_(impact).toLowerCase();
  if (["false", "no", "0"].indexOf(impactText) >= 0) return false;

  const status = lvCanonicalText_(lvCanonicalFirst_(payment, ["Approval_Status", "Approval Status", "Status"]))
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  if (!status) return true;
  return ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid"].indexOf(status) >= 0;
}

function lvCanonicalExpenseEffective_(expense) {
  const status = lvCanonicalText_(lvCanonicalFirst_(expense, ["Approval_Status", "Approval Status", "Status"]))
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  if (!status) return true;
  return ["approved", "paid", "complete", "completed"].indexOf(status) >= 0;
}

function lvCanonicalRecordsFromSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Finance worksheet "' + sheetName + '" was not found.');
  if (sheet.getLastRow() < 2) return [];
  const width = Math.max(1, sheet.getLastColumn());
  const values = sheet.getRange(1, 1, sheet.getLastRow(), width).getValues();
  const headers = values[0].map(function(value) { return lvCanonicalText_(value); });
  return values.slice(1).map(function(row) {
    const record = {};
    headers.forEach(function(header, index) {
      if (header) record[header] = row[index];
    });
    return record;
  }).filter(function(record) {
    return Object.keys(record).some(function(key) { return lvCanonicalText_(record[key]) !== ""; });
  });
}

function lvCanonicalSheetData_(tab, headers, rows, url) {
  return {
    success: true,
    data: {
      tab: tab,
      tabs: LV_CANONICAL_COMPAT_TABS_.concat(LV_CANONICAL_FINANCE_TABS_),
      headers: headers,
      rows: rows.map(function(row) {
        return row.map(function(value) {
          if (value instanceof Date) return Utilities.formatDate(value, "Asia/Dhaka", "yyyy-MM-dd");
          return value == null ? "" : String(value);
        });
      }),
      totals: { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 },
      url: url || "",
      updatedAt: new Date().toISOString()
    }
  };
}

function lvCanonicalDirectSheetData_(tab) {
  const ss = getFinanceDatabase_();
  const sheet = ss.getSheetByName(tab);
  if (!sheet) throw new Error('Finance worksheet "' + tab + '" was not found.');
  const height = Math.max(1, sheet.getLastRow());
  const width = Math.max(1, sheet.getLastColumn());
  const grid = sheet.getRange(1, 1, height, width).getDisplayValues();
  const headers = grid[0] || [];
  const rows = grid.slice(1).filter(function(row) {
    return row.some(function(value) { return lvCanonicalText_(value) !== ""; });
  });
  return lvCanonicalSheetData_(tab, headers, rows, ss.getUrl() + "#gid=" + sheet.getSheetId());
}

function lvCanonicalProjectMap_() {
  const projects = readSheet(CONFIG.SHEETS.PROJECTS) || [];
  const map = {};
  projects.forEach(function(project) {
    const id = lvCanonicalNormalizeProjectId_(lvCanonicalFirst_(project, ["Project_ID", "Project ID", "ProjectId"]));
    if (!id) return;
    map[id] = project;
  });
  return map;
}

function lvCanonicalBillingState_() {
  const finance = getFinanceDatabase_();
  const projects = readSheet(CONFIG.SHEETS.PROJECTS) || [];
  const bills = lvCanonicalRecordsFromSheet_(finance, "Bills").filter(lvCanonicalBillEffective_);
  const payments = lvCanonicalRecordsFromSheet_(finance, "Payments").filter(lvCanonicalPaymentEffective_);
  const projectMap = {};

  function ensureProject(id) {
    const projectId = lvCanonicalNormalizeProjectId_(id);
    if (!projectId) return null;
    if (!projectMap[projectId]) {
      projectMap[projectId] = {
        projectId: projectId,
        project: null,
        categories: {
          "Engineering Bill": { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, bills: [], payments: [] },
          "Supervision Bill": { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, bills: [], payments: [] },
          "Other Services Bill": { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, bills: [], payments: [] }
        },
        gross: 0,
        discount: 0,
        billed: 0,
        paid: 0,
        due: 0
      };
    }
    return projectMap[projectId];
  }

  projects.forEach(function(project) {
    const id = lvCanonicalNormalizeProjectId_(lvCanonicalFirst_(project, ["Project_ID", "Project ID", "ProjectId"]));
    const summary = ensureProject(id);
    if (summary) summary.project = project;
  });

  bills.forEach(function(bill) {
    const summary = ensureProject(lvCanonicalFirst_(bill, ["Project_ID", "Project ID", "ProjectId"]));
    if (!summary) return;
    const categoryName = lvCanonicalCategory_(bill);
    const category = summary.categories[categoryName];
    const gross = lvCanonicalNumber_(lvCanonicalFirst_(bill, ["Amount", "Bill_Amount", "Bill Amount", "Total", "Grand_Total"]));
    const discount = lvCanonicalNumber_(lvCanonicalFirst_(bill, ["Discount", "Discount_Amount", "Discount Amount"]));
    category.gross += gross;
    category.discount += discount;
    category.billed += gross - discount;
    category.bills.push(bill);
    summary.gross += gross;
    summary.discount += discount;
    summary.billed += gross - discount;
  });

  payments.forEach(function(payment) {
    const summary = ensureProject(lvCanonicalFirst_(payment, ["Project_ID", "Project ID", "ProjectId"]));
    if (!summary) return;
    const categoryName = lvCanonicalCategory_(payment);
    const category = summary.categories[categoryName];
    const paid = lvCanonicalNumber_(lvCanonicalFirst_(payment, ["Amount", "Payment_Amount", "Payment Amount"]));
    category.paid += paid;
    category.payments.push(payment);
    summary.paid += paid;
  });

  Object.keys(projectMap).forEach(function(id) {
    const summary = projectMap[id];
    LV_CANONICAL_BILL_CATEGORIES_.forEach(function(categoryName) {
      const category = summary.categories[categoryName];
      category.due = category.billed - category.paid;
    });
    summary.due = summary.billed - summary.paid;
  });

  return { projects: projects, bills: bills, payments: payments, projectMap: projectMap };
}

function lvCanonicalFileListData_(state, onlyProjectId) {
  const headers = ["FILE ID", "Client Name", "Address", "Phone", "Floor/Story", "Build Type", "Land Area"];
  const rows = [];
  Object.keys(state.projectMap)
    .sort(function(a, b) { return Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")); })
    .forEach(function(id) {
      if (onlyProjectId && id !== onlyProjectId) return;
      const project = state.projectMap[id].project || {};
      rows.push([
        id,
        lvCanonicalFirst_(project, ["Client_Name", "Client Name", "Client"]),
        lvCanonicalFirst_(project, ["Client_Address", "Client Address", "Address", "Location"]),
        lvCanonicalFirst_(project, ["Phone_Number", "Phone Number", "Phone", "Mobile"]),
        lvCanonicalFirst_(project, ["Floor_Story", "Floor/Story", "Floors", "Floor", "Story"]),
        lvCanonicalFirst_(project, ["Build_Type", "Build Type", "Building_Type", "Project_Type", "Project Type"]),
        lvCanonicalFirst_(project, ["Land_Area", "Land Area", "Plot_Area", "Plot Area"])
      ]);
    });
  return lvCanonicalSheetData_("File List", headers, rows);
}

function lvCanonicalSummaryData_(state, onlyProjectId) {
  const headers = [
    "FILE ID", "Client Name", "Project Name",
    "Engineering Bill", "Engineering Discount", "Engineering Deposit", "Engineering Due",
    "Supervision Bill", "Supervision Discount", "Supervision Deposit", "Supervision Due",
    "Other Services Bill", "Other Services Discount", "Other Services Deposit", "Other Services Due",
    "Total Due", "Status"
  ];
  const rows = [];
  Object.keys(state.projectMap)
    .sort(function(a, b) { return Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")); })
    .forEach(function(id) {
      if (onlyProjectId && id !== onlyProjectId) return;
      const summary = state.projectMap[id];
      const project = summary.project || {};
      const engineering = summary.categories["Engineering Bill"];
      const supervision = summary.categories["Supervision Bill"];
      const others = summary.categories["Other Services Bill"];
      const status = summary.due > 0.009 ? "DUE" : (summary.billed > 0 ? "FULL PAID" : "");
      rows.push([
        id,
        lvCanonicalFirst_(project, ["Client_Name", "Client Name", "Client"]),
        lvCanonicalFirst_(project, ["Project_Name", "Project Name", "Name"]),
        engineering.gross, engineering.discount, engineering.paid, engineering.due,
        supervision.gross, supervision.discount, supervision.paid, supervision.due,
        others.gross, others.discount, others.paid, others.due,
        summary.due, status
      ]);
    });
  return lvCanonicalSheetData_("Summary", headers, rows);
}

function lvCanonicalBillTabData_(state, tab, categoryName, onlyProjectId) {
  const headers = ["FILE ID", "Service Name", "Price", "Qty", "Amount", "Bill ID"];
  const rows = [];
  Object.keys(state.projectMap).forEach(function(id) {
    if (onlyProjectId && id !== onlyProjectId) return;
    state.projectMap[id].categories[categoryName].bills.forEach(function(bill) {
      const gross = lvCanonicalNumber_(lvCanonicalFirst_(bill, ["Amount", "Bill_Amount", "Total", "Grand_Total"]));
      const description = lvCanonicalText_(lvCanonicalFirst_(bill, ["Description", "Service", "Particulars", "Item"]))
        .replace(/^\[(Engineering Bill|Supervision Bill|Other Services Bill)\]\s*/i, "");
      rows.push([id, description || categoryName, gross, 1, gross, lvCanonicalFirst_(bill, ["Bill_ID", "Bill ID"])]);
    });
  });
  return lvCanonicalSheetData_(tab, headers, rows);
}

function lvCanonicalPaymentTabData_(state, tab, categoryName, onlyProjectId) {
  const headers = ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"];
  const rows = [];
  Object.keys(state.projectMap).forEach(function(id) {
    if (onlyProjectId && id !== onlyProjectId) return;
    state.projectMap[id].categories[categoryName].payments.forEach(function(payment) {
      const method = lvCanonicalText_(lvCanonicalFirst_(payment, ["Payment_Method", "Payment Method", "Method"]));
      const reference = lvCanonicalText_(lvCanonicalFirst_(payment, ["Reference_No", "Reference No", "Reference"]));
      rows.push([
        id,
        lvCanonicalFirst_(payment, ["Payment_Date", "Payment Date", "Date"]),
        [method, reference].filter(Boolean).join(" · ") || "Client Payment",
        lvCanonicalNumber_(lvCanonicalFirst_(payment, ["Amount", "Payment_Amount", "Payment Amount"])),
        "Verified",
        lvCanonicalFirst_(payment, ["Payment_ID", "Payment ID", "Income_ID", "Income ID"])
      ]);
    });
  });
  return lvCanonicalSheetData_(tab, headers, rows);
}

function lvCanonicalCompatibilityTab_(tab, state, onlyProjectId) {
  if (tab === "Summary") return lvCanonicalSummaryData_(state, onlyProjectId);
  if (tab === "File List") return lvCanonicalFileListData_(state, onlyProjectId);
  if (tab === "Design Bill") return lvCanonicalBillTabData_(state, tab, "Engineering Bill", onlyProjectId);
  if (tab === "Design Deposit") return lvCanonicalPaymentTabData_(state, tab, "Engineering Bill", onlyProjectId);
  if (tab === "Supervision Bill") return lvCanonicalBillTabData_(state, tab, "Supervision Bill", onlyProjectId);
  if (tab === "S Deposit") return lvCanonicalPaymentTabData_(state, tab, "Supervision Bill", onlyProjectId);
  if (tab === "Others Bill") return lvCanonicalBillTabData_(state, tab, "Other Services Bill", onlyProjectId);
  if (tab === "Others Bill Deposit") return lvCanonicalPaymentTabData_(state, tab, "Other Services Bill", onlyProjectId);
  throw new Error("Unknown finance worksheet.");
}

function lvCanonicalAccountingIncome_(state) {
  const projectMap = lvCanonicalProjectMap_();
  const headers = ["Income_ID", "Payment_Date", "File_ID", "Project_Name", "Client_Name", "Payment_For", "Amount", "Payment_Method", "Reference_No", "Received_From", "Received_By", "Deposit_Account", "Receipt_URL", "Notes", "Created_At", "Created_By", "Income_Category"];
  const rows = state.payments.map(function(payment) {
    const id = lvCanonicalNormalizeProjectId_(lvCanonicalFirst_(payment, ["Project_ID", "Project ID", "ProjectId"]));
    const project = projectMap[id] || {};
    return [
      lvCanonicalFirst_(payment, ["Payment_ID", "Payment ID"]),
      lvCanonicalFirst_(payment, ["Payment_Date", "Payment Date", "Date"]),
      id,
      lvCanonicalFirst_(project, ["Project_Name", "Project Name", "Name"]),
      lvCanonicalFirst_(project, ["Client_Name", "Client Name", "Client"]),
      lvCanonicalFirst_(payment, ["Payment_For", "Payment For", "Description"]),
      lvCanonicalFirst_(payment, ["Amount", "Payment_Amount", "Payment Amount"]),
      lvCanonicalFirst_(payment, ["Payment_Method", "Payment Method", "Method"]),
      lvCanonicalFirst_(payment, ["Reference_No", "Reference No", "Reference"]),
      lvCanonicalFirst_(payment, ["Received_From", "Received From", "Payer"]),
      lvCanonicalFirst_(payment, ["Received_By", "Received By"]),
      lvCanonicalFirst_(payment, ["Deposit_Account", "Deposit Account", "Account"]),
      lvCanonicalFirst_(payment, ["Receipt_URL", "Receipt URL"]),
      lvCanonicalFirst_(payment, ["Notes", "Remarks"]),
      lvCanonicalFirst_(payment, ["Created_At", "Created At"]),
      lvCanonicalFirst_(payment, ["Created_By", "Created By"]),
      lvCanonicalCategory_(payment)
    ];
  });
  return lvCanonicalSheetData_("Accounting Income", headers, rows);
}

function lvCanonicalAccountingExpenses_() {
  const finance = getFinanceDatabase_();
  const expenses = lvCanonicalRecordsFromSheet_(finance, "Expenses");
  const projectMap = lvCanonicalProjectMap_();
  const headers = ["Expense_ID", "Expense_Date", "File_ID", "Project_Name", "Category", "Description", "Amount", "Requested_By", "Requested_At", "Approval_Status", "Approved_By", "Approved_At", "Paid_To", "Payment_Method", "Reference_No", "Receipt_URL", "Notes", "Created_At", "Created_By"];
  const rows = expenses.map(function(expense) {
    const id = lvCanonicalNormalizeProjectId_(lvCanonicalFirst_(expense, ["Project_ID", "Project ID", "ProjectId"]));
    const project = projectMap[id] || {};
    return [
      lvCanonicalFirst_(expense, ["Expense_ID", "Expense ID"]),
      lvCanonicalFirst_(expense, ["Expense_Date", "Expense Date", "Date"]),
      id,
      lvCanonicalFirst_(project, ["Project_Name", "Project Name", "Name"]),
      lvCanonicalFirst_(expense, ["Category", "Expense_Category", "Expense Category"]),
      lvCanonicalFirst_(expense, ["Description", "Particulars", "Expense"]),
      lvCanonicalFirst_(expense, ["Amount", "Expense_Amount", "Expense Amount"]),
      lvCanonicalFirst_(expense, ["Requested_By", "Requested By", "Created_By", "Created By"]),
      lvCanonicalFirst_(expense, ["Requested_At", "Requested At", "Created_At", "Created At"]),
      lvCanonicalFirst_(expense, ["Approval_Status", "Approval Status", "Status"]) || "Pending",
      lvCanonicalFirst_(expense, ["Approved_By", "Approved By", "Reviewed_By", "Reviewed By"]),
      lvCanonicalFirst_(expense, ["Approved_At", "Approved At", "Reviewed_At", "Reviewed At"]),
      lvCanonicalFirst_(expense, ["Paid_To", "Paid To", "Payee", "Vendor"]),
      lvCanonicalFirst_(expense, ["Payment_Method", "Payment Method", "Method"]),
      lvCanonicalFirst_(expense, ["Reference_No", "Reference No", "Reference"]),
      lvCanonicalFirst_(expense, ["Receipt_URL", "Receipt URL"]),
      lvCanonicalFirst_(expense, ["Notes", "Remarks"]),
      lvCanonicalFirst_(expense, ["Created_At", "Created At"]),
      lvCanonicalFirst_(expense, ["Created_By", "Created By"])
    ];
  });
  return lvCanonicalSheetData_("Accounting Expenses", headers, rows);
}

function lvCanonicalWorkflowHeaders_() {
  return ["Task_ID", "Project_ID", "Project_Name", "Task_Title", "Assigned_Employee_ID", "Priority", "Start_Date", "Due_Date", "Status", "Progress", "Description", "Completed_At", "Created_At", "Updated_At"];
}

function lvCanonicalWorkflowSheet_() {
  const ss = getOperationsDatabase_();
  let sheet = ss.getSheetByName("Tasks");
  if (!sheet) sheet = ss.insertSheet("Tasks");
  const headers = lvCanonicalWorkflowHeaders_();
  const current = sheet.getLastRow() > 0 && sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0].map(lvCanonicalText_)
    : [];
  if (!current.some(Boolean)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    headers.forEach(function(header) {
      if (current.indexOf(header) < 0) {
        current.push(header);
        sheet.getRange(1, current.length).setValue(header);
      }
    });
  }
  return sheet;
}

function lvCanonicalWorkflowOperation_(params, session) {
  const role = normalizeRoleName(session.role);
  if (!isAdminRole(role)) throw new Error("Access denied.");
  const sheet = lvCanonicalWorkflowSheet_();
  const width = Math.max(sheet.getLastColumn(), lvCanonicalWorkflowHeaders_().length);
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(lvCanonicalText_);
  const op = lvCanonicalText_(params.workflowOp).toLowerCase();

  function recordFromParams(current) {
    const record = Object.assign({}, current || {});
    headers.forEach(function(header) {
      if (Object.prototype.hasOwnProperty.call(params, header)) record[header] = params[header];
    });
    if (params.projectId && !record.Project_ID) record.Project_ID = params.projectId;
    record.Project_ID = lvCanonicalNormalizeProjectId_(record.Project_ID);
    record.Progress = Math.max(0, Math.min(100, Number(record.Progress || 0) || 0));
    if (!record.Status) record.Status = "Pending";
    if (String(record.Status).toLowerCase() === "completed") record.Progress = 100;
    record.Updated_At = new Date().toISOString();
    return record;
  }

  if (op === "create") {
    const input = recordFromParams({});
    if (!input.Project_ID) throw new Error("Project ID is required.");
    if (!lvCanonicalText_(input.Task_Title)) throw new Error("Workflow stage is required.");
    const existingRows = lvCanonicalRecordsFromSheet_(getOperationsDatabase_(), "Tasks");
    const existing = existingRows.find(function(row) {
      return lvCanonicalNormalizeProjectId_(row.Project_ID) === input.Project_ID && lvCanonicalText_(row.Task_Title) === lvCanonicalText_(input.Task_Title);
    });
    if (existing) return { success: true, data: existing };
    input.Task_ID = lvCanonicalText_(input.Task_ID) || ("WF-" + Utilities.getUuid().split("-")[0].toUpperCase());
    input.Created_At = lvCanonicalText_(input.Created_At) || new Date().toISOString();
    sheet.appendRow(headers.map(function(header) { return input[header] === undefined ? "" : input[header]; }));
    return { success: true, data: input };
  }

  if (op === "update") {
    const id = lvCanonicalText_(params.id || params.Task_ID);
    if (!id) throw new Error("Workflow Task ID is required.");
    if (sheet.getLastRow() < 2) throw new Error("Workflow record not found.");
    const idIndex = headers.indexOf("Task_ID");
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (let i = 0; i < values.length; i += 1) {
      if (lvCanonicalText_(values[i][idIndex]) !== id) continue;
      const current = {};
      headers.forEach(function(header, index) { current[header] = values[i][index]; });
      const updated = recordFromParams(current);
      sheet.getRange(i + 2, 1, 1, headers.length).setValues([headers.map(function(header) { return updated[header] === undefined ? "" : updated[header]; })]);
      return { success: true, data: updated };
    }
    throw new Error("Workflow record not found.");
  }

  const grid = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), Math.max(1, sheet.getLastColumn())).getDisplayValues();
  return lvCanonicalSheetData_("Workflow", grid[0] || [], grid.slice(1));
}

function lvCanonicalCanWriteBilling_(session) {
  const role = normalizeRoleName(session.role);
  return isAdminRole(role) || role === "accounts";
}

function lvCanonicalMutationKey_(kind, params) {
  const explicit = lvCanonicalText_(params && (params.Idempotency_Key || params.idempotencyKey || params._requestId));
  if (explicit) return explicit.slice(0, 120);
  const safe = {};
  Object.keys(params || {}).sort().forEach(function(key) {
    if (["token", "proxySecret", "action", "_clientKey"].indexOf(key) >= 0) return;
    safe[key] = params[key];
  });
  const source = kind + "|" + JSON.stringify(safe);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "").slice(0, 64);
}

function lvCanonicalGuardMutation_(kind, params, callback) {
  const key = lvCanonicalMutationKey_(kind, params);
  const cacheKey = "LV_MUT_" + kind + "_" + key;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const prior = cache.get(cacheKey);
    if (prior) {
      try {
        const parsed = JSON.parse(prior);
        if (parsed && typeof parsed === "object") {
          parsed.deduplicated = true;
          return parsed;
        }
      } catch (ignore) {}
    }
    const result = callback(key);
    try { cache.put(cacheKey, JSON.stringify(result), 120); } catch (ignore) {}
    return result;
  } finally {
    lock.releaseLock();
  }
}

function lvCanonicalAppendFinanceRecord_(sheetName, record, idPrefix, idHeader) {
  const sheet = getFinanceDatabase_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Finance worksheet "' + sheetName + '" was not found.');
  const required = Object.keys(record);
  required.push(idHeader);
  const headers = ensureHeaders_(sheet, required);
  if (!record[idHeader]) record[idHeader] = generateId(idPrefix, sheet, idHeader);
  sheet.appendRow(headers.map(function(header) { return record[header] === undefined || record[header] === null ? "" : record[header]; }));
  return { success: true, data: record };
}

function lvCanonicalSaveBill_(params) {
  const session = requireSession(params);
  if (!lvCanonicalCanWriteBilling_(session)) throw new Error("Access denied.");
  return lvCanonicalGuardMutation_("bill", params, function(idempotencyKey) {
    const record = cleanParams(params);
    const projectId = lvCanonicalNormalizeProjectId_(record.Project_ID || record.projectId);
    if (!projectId) throw new Error("Project ID is required.");
    const category = lvCanonicalCategory_(record);
    const amount = lvCanonicalNumber_(record.Amount);
    if (!(amount > 0)) throw new Error("Bill amount must be greater than zero.");
    record.Project_ID = projectId;
    record.Amount = amount;
    record.Billing_Category = category;
    record.Category = category;
    record.Status = lvCanonicalText_(record.Status) || "Issued";
    record.Created_At = record.Created_At || new Date().toISOString();
    record.Created_By = record.Created_By || session.userId || session.username || "";
    record.Idempotency_Key = idempotencyKey;
    return lvCanonicalAppendFinanceRecord_("Bills", record, "BILL-", "Bill_ID");
  });
}

function lvCanonicalSavePayment_(params) {
  const session = requireSession(params);
  if (!lvCanonicalCanWriteBilling_(session)) throw new Error("Access denied.");
  return lvCanonicalGuardMutation_("payment", params, function(idempotencyKey) {
    let record = cleanParams(params);
    const projectId = lvCanonicalNormalizeProjectId_(record.Project_ID || record.projectId);
    if (!projectId) throw new Error("Project ID is required.");
    const amount = lvCanonicalNumber_(record.Amount);
    if (!(amount > 0)) throw new Error("Payment amount must be greater than zero.");
    const category = lvCanonicalCategory_(record);
    record.Project_ID = projectId;
    record.Amount = amount;
    record.Payment_For = category;
    record.Income_Category = category;
    record.Transaction_Type = lvCanonicalText_(record.Transaction_Type) || "Business Income";
    if (record.Affects_Business_Balance === undefined || record.Affects_Business_Balance === "") record.Affects_Business_Balance = "Yes";
    record.Approval_Status = "Pending";
    record.Reviewed_By = "";
    record.Reviewed_At = "";
    record.Review_Notes = "";
    record.Approved_By = "";
    record.Approved_At = "";
    record.Created_At = record.Created_At || new Date().toISOString();
    record.Created_By = record.Created_By || session.userId || session.username || "";
    record.Idempotency_Key = idempotencyKey;
    return lvCanonicalAppendFinanceRecord_("Payments", record, "PAY-", "Payment_ID");
  });
}

function lvCanonicalBillingBook_(params) {
  const session = requireSession(params);
  const role = normalizeRoleName(session.role);
  if (!(isAdminRole(role) || role === "accounts" || role === "client")) throw new Error("Access denied.");
  const state = lvCanonicalBillingState_();
  const projectRows = [];
  const categories = {};
  LV_CANONICAL_BILL_CATEGORIES_.forEach(function(name) { categories[name] = { category: name, gross: 0, discount: 0, billed: 0, paid: 0, due: 0 }; });

  Object.keys(state.projectMap).forEach(function(id) {
    const item = state.projectMap[id];
    const project = item.project || {};
    const row = {
      projectId: id,
      projectName: lvCanonicalText_(lvCanonicalFirst_(project, ["Project_Name", "Project Name", "Name"])) || id,
      clientName: lvCanonicalText_(lvCanonicalFirst_(project, ["Client_Name", "Client Name", "Client"])),
      gross: item.gross, discount: item.discount, billed: item.billed, paid: item.paid, due: item.due, categories: {}
    };
    LV_CANONICAL_BILL_CATEGORIES_.forEach(function(name) {
      const source = item.categories[name];
      row.categories[name] = { gross: source.gross, discount: source.discount, billed: source.billed, paid: source.paid, due: source.due };
      categories[name].gross += source.gross;
      categories[name].discount += source.discount;
      categories[name].billed += source.billed;
      categories[name].paid += source.paid;
      categories[name].due += source.due;
    });
    projectRows.push(row);
  });

  const categoryRows = LV_CANONICAL_BILL_CATEGORIES_.map(function(name) { return categories[name]; });
  const totals = categoryRows.reduce(function(total, item) {
    total.gross += item.gross; total.discount += item.discount; total.billed += item.billed; total.paid += item.paid; total.due += item.due; return total;
  }, { gross: 0, discount: 0, billed: 0, paid: 0, due: 0 });

  return { success: true, data: { totals: totals, categories: categoryRows, projects: projectRows, billCount: state.bills.length, paymentCount: state.payments.length } };
}

function lvCanonicalProjectBilling_(params) {
  const session = requireSession(params);
  const projectId = lvCanonicalNormalizeProjectId_(params.projectId || params.Project_ID);
  assertProjectAccess(session, projectId);
  const state = lvCanonicalBillingState_();
  const item = state.projectMap[projectId] || { billed: 0, paid: 0, due: 0, categories: { "Engineering Bill": { bills: [], payments: [] }, "Supervision Bill": { bills: [], payments: [] }, "Other Services Bill": { bills: [], payments: [] } } };
  let bills = [];
  let payments = [];
  LV_CANONICAL_BILL_CATEGORIES_.forEach(function(name) { bills = bills.concat(item.categories[name].bills || []); payments = payments.concat(item.categories[name].payments || []); });
  if (normalizeRoleName(session.role) === "client") {
    bills = bills.map(function(record) { return sanitizeBillingRecordForClient(record, "bill"); });
    payments = payments.map(function(record) { return sanitizeBillingRecordForClient(record, "payment"); });
  }
  return { success: true, data: { projectId: projectId, bills: bills, payments: payments, totalBill: item.billed || 0, totalPaid: item.paid || 0, due: item.due || 0 } };
}

function lvCanonicalBillingDashboard_(params) {
  const session = requireSession(params);
  if (!lvCanonicalCanWriteBilling_(session)) throw new Error("Access denied.");
  const book = lvCanonicalBillingBook_(params).data;
  return { success: true, data: { projectCount: book.projects.length, billCount: book.billCount, paymentCount: book.paymentCount, totalBill: book.totals.billed, totalPaid: book.totals.paid, pending: book.totals.due } };
}

function lvCanonicalProjectForVerification_(fileId) {
  const state = lvCanonicalBillingState_();
  const item = state.projectMap[fileId];
  if (!item) throw new Error("Project not found.");
  const project = item.project || {};
  return {
    fileId: fileId,
    clientName: lvCanonicalFirst_(project, ["Client_Name", "Client Name", "Client"]),
    projectName: lvCanonicalFirst_(project, ["Project_Name", "Project Name", "Name"]),
    projectType: lvCanonicalFirst_(project, ["Project_Type", "Project Type", "Build_Type", "Build Type"]),
    location: lvCanonicalFirst_(project, ["Location", "Project_Location", "Project Location", "Address"]),
    totals: { gross: item.gross, discount: item.discount, billed: item.billed, paid: item.paid, due: item.due },
    categories: LV_CANONICAL_BILL_CATEGORIES_.map(function(name) { const category = item.categories[name]; return { category: name, gross: category.gross, discount: category.discount, billed: category.billed, paid: category.paid, due: category.due }; }),
    status: item.due > 0.009 ? "DUE" : (item.billed > 0 ? "FULL PAID" : "NO BILL"),
    updatedAt: new Date().toISOString()
  };
}

function lvCanonicalCreateProjectGuard_(params) {
  const project = Object.assign({}, params || {});
  const projectId = lvCanonicalNormalizeProjectId_(project.Project_ID || project.projectId);
  if (!projectId || !/^LV-\d+$/.test(projectId)) throw new Error("Project_ID is required and must use the LV-### format.");
  const duplicate = (readSheet(CONFIG.SHEETS.PROJECTS) || []).some(function(row) { return lvCanonicalNormalizeProjectId_(lvCanonicalFirst_(row, ["Project_ID", "Project ID", "ProjectId"])) === projectId; });
  if (duplicate) throw new Error("Project_ID already exists: " + projectId);
  project.Project_ID = projectId;
  project.projectId = projectId;
  return project;
}

function lvCanonicalDisableEmployeeAccount_(employeeId) {
  const target = lvCanonicalText_(employeeId).toUpperCase();
  if (!target) return [];
  const sheet = getSheet(CONFIG.SHEETS.USERS);
  const headers = getHeaders(sheet);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const disabled = [];
  const employeeCol = findHeaderIndex(headers, ["Employee_ID", "Employee ID", "EmployeeId"]);
  const userCol = findHeaderIndex(headers, ["User_ID", "User ID", "UserId"]);
  const usernameCol = findHeaderIndex(headers, ["Username", "username"]);
  const activeCol = findHeaderIndex(headers, ["Active"]);
  const statusCol = findHeaderIndex(headers, ["Status"]);
  for (let i = 0; i < values.length; i += 1) {
    const matches = (employeeCol >= 0 && lvCanonicalText_(values[i][employeeCol]).toUpperCase() === target) || (userCol >= 0 && lvCanonicalText_(values[i][userCol]).toUpperCase() === target) || (usernameCol >= 0 && lvCanonicalText_(values[i][usernameCol]).toUpperCase() === target);
    if (!matches) continue;
    if (activeCol >= 0) sheet.getRange(i + 2, activeCol + 1).setValue("FALSE");
    if (statusCol >= 0) sheet.getRange(i + 2, statusCol + 1).setValue("Inactive");
    const userId = userCol >= 0 ? lvCanonicalText_(values[i][userCol]) : target;
    if (userId) { disabled.push(userId); try { revokeUserSessions_(userId); } catch (ignore) {} }
  }
  return disabled;
}

var LV_CANONICAL_BASE_CREATE_PROJECT_ = createProject;
createProject = function(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  return LV_CANONICAL_BASE_CREATE_PROJECT_(lvCanonicalCreateProjectGuard_(params));
};

var LV_CANONICAL_BASE_DELETE_EMPLOYEE_ = deleteEmployee;
deleteEmployee = function(params) {
  const session = requireSession(params || {});
  if (!isAdminRole(session.role)) throw new Error("Access denied.");
  const employeeId = lvCanonicalText_(params && (params.employeeId || params.Employee_ID));
  const disabledUsers = lvCanonicalDisableEmployeeAccount_(employeeId);
  const result = LV_CANONICAL_BASE_DELETE_EMPLOYEE_(params);
  if (result && result.data && typeof result.data === "object") result.data.disabledUsers = disabledUsers;
  return result;
};

saveBill = function(params) { return lvCanonicalSaveBill_(params || {}); };
createBill = function(params) { return lvCanonicalSaveBill_(params || {}); };
savePayment = function(params) { return lvCanonicalSavePayment_(params || {}); };
createPayment = function(params) { return lvCanonicalSavePayment_(params || {}); };
getBillingBook = function(params) { return lvCanonicalBillingBook_(params || {}); };
getProjectBilling = function(params) { return lvCanonicalProjectBilling_(params || {}); };
getBillingDashboard = function(params) { return lvCanonicalBillingDashboard_(params || {}); };

if (typeof sumAmount === "function") {
  var LV_CANONICAL_BASE_SUM_AMOUNT_ = sumAmount;
  sumAmount = function(records) {
    if (Array.isArray(records) && records.some(function(record) { return !!lvCanonicalFirst_(record, ["Payment_ID", "Payment ID", "PaymentId"]); })) return LV_CANONICAL_BASE_SUM_AMOUNT_(records.filter(lvCanonicalPaymentEffective_));
    return LV_CANONICAL_BASE_SUM_AMOUNT_(records);
  };
}

getFinanceSheet = function(params) {
  params = params || {};
  const session = requireSession(params);
  const role = normalizeRoleName(session.role);
  if (!(isAdminRole(role) || role === "accounts")) throw new Error("Access denied.");
  const tab = lvCanonicalText_(params.tab || "Summary");
  if (tab === "Workflow") return lvCanonicalWorkflowOperation_(params, session);

  const state = lvCanonicalBillingState_();
  if (lvCanonicalText_(params.bundle).toLowerCase() === "projectbilling") {
    const projectId = lvCanonicalNormalizeProjectId_(params.projectId);
    if (!projectId) throw new Error("Project ID is required.");
    assertProjectAccess(session, projectId);
    const sheets = LV_CANONICAL_COMPAT_TABS_.map(function(name) { return lvCanonicalCompatibilityTab_(name, state, projectId).data; });
    const projectPayments = state.payments.filter(function(payment) { return lvCanonicalNormalizeProjectId_(lvCanonicalFirst_(payment, ["Project_ID", "Project ID", "ProjectId"])) === projectId; });
    return { success: true, data: { projectId: projectId, sheets: sheets, payments: projectPayments, updatedAt: new Date().toISOString(), mode: "canonical-project-bundle" } };
  }

  if (LV_CANONICAL_COMPAT_TABS_.indexOf(tab) >= 0) return lvCanonicalCompatibilityTab_(tab, state);
  if (tab === "Accounting Income") return lvCanonicalAccountingIncome_(state);
  if (tab === "Accounting Expenses") return lvCanonicalAccountingExpenses_();
  if (LV_CANONICAL_FINANCE_TABS_.indexOf(tab) >= 0) return lvCanonicalDirectSheetData_(tab);
  throw new Error("Unknown finance worksheet.");
};

getPublicBillingVerification = function(params) {
  const fileId = lvCanonicalNormalizeProjectId_(lvCanonicalText_(params && params.fileId).toUpperCase());
  if (!/^LV-\d+$/.test(fileId)) throw new Error("Invalid File ID.");
  return { success: true, data: lvCanonicalProjectForVerification_(fileId) };
};
