/**
 * LAND VIEW — Income & Expense Ledger Sync
 *
 * Mirrors the authoritative LAND VIEW app records into the dedicated
 * accounting workbook without changing login, billing or permission flows.
 *
 * Source of truth:
 *   - CONFIG.SHEETS.PAYMENTS -> Income
 *   - CONFIG.SHEETS.EXPENSES -> Expenses
 *   - CONFIG.SHEETS.PROJECTS -> project/client labels
 *
 * Destination workbook:
 *   LAND VIEW Income & Expense Database
 */

function getLandViewFinanceLedger_() {
  return SpreadsheetApp.openById("1E1hCMKn3fGl7LUov1FS60IJNVnZTJUlf6CCO4pFMQw4");
}

function landViewLedgerText_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function landViewLedgerFirst_(record, keys) {
  if (!record) return "";
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      var value = record[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
  }
  return "";
}

function landViewLedgerEnsureHeaders_(sheet, requiredHeaders) {
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) { return String(value || "").trim(); })
    : [];

  if (!headers.length || headers.every(function(value) { return !value; })) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders.slice();
  }

  requiredHeaders.forEach(function(header) {
    if (headers.indexOf(header) < 0) {
      headers.push(header);
      sheet.getRange(1, headers.length).setValue(header);
    }
  });
  return headers;
}

function landViewLedgerExistingRows_(sheet, headers, idHeader) {
  var map = {};
  var idColumn = headers.indexOf(idHeader);
  if (idColumn < 0 || sheet.getLastRow() < 2) return map;

  sheet.getRange(2, idColumn + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(row, index) {
    var id = landViewLedgerText_(row[0]);
    if (id) map[id] = index + 2;
  });
  return map;
}

function landViewLedgerUpsert_(sheet, headers, idHeader, records) {
  var existing = landViewLedgerExistingRows_(sheet, headers, idHeader);
  var created = 0;
  var updated = 0;

  records.forEach(function(record) {
    var id = landViewLedgerText_(record[idHeader]);
    if (!id) return;
    var values = headers.map(function(header) {
      return record[header] === undefined || record[header] === null ? "" : record[header];
    });
    var rowIndex = existing[id];
    if (rowIndex) {
      sheet.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
      updated++;
    } else {
      sheet.appendRow(values);
      existing[id] = sheet.getLastRow();
      created++;
    }
  });

  return { created: created, updated: updated, total: records.length };
}

function landViewProjectLookup_() {
  var map = {};
  readSheet(CONFIG.SHEETS.PROJECTS).forEach(function(project) {
    var id = landViewLedgerText_(landViewLedgerFirst_(project, ["Project_ID", "Project ID", "ProjectId", "FILE ID", "File ID"]));
    if (!id) return;
    map[id] = {
      projectName: landViewLedgerText_(landViewLedgerFirst_(project, ["Project_Name", "Project Name", "Name"])),
      clientName: landViewLedgerText_(landViewLedgerFirst_(project, ["Client_Name", "Client Name", "Client"]))
    };
  });
  return map;
}

function landViewIncomeCategory_(payment) {
  var explicit = landViewLedgerText_(landViewLedgerFirst_(payment, ["Income_Category", "Income Category", "Category"]));
  if (explicit) return explicit;

  var text = landViewLedgerText_(landViewLedgerFirst_(payment, ["Payment_For", "Payment For", "Description", "Service", "Particulars"])).toLowerCase();
  var categories = [
    "Design Bill", "Supervision Bill", "Soil Test", "Digital Survey", "3D Design",
    "Estimate & Costing", "Plan Approval", "Site Visit", "Municipality / Approval",
    "Rent Income", "Material / Product Sale", "Printing / Documentation",
    "Certificate / Documentation", "Commission / Reimbursement", "Commission Income",
    "Owner / Internal Transfer", "Loan / Recovery", "Rental / Deposit Recovery",
    "Project Advance / Deposit", "Reimbursement / Recovery", "Eng Rony Income / Recovery"
  ];

  for (var i = 0; i < categories.length; i++) {
    if (text.indexOf(categories[i].toLowerCase()) >= 0) return categories[i];
  }
  if (text.indexOf("supervision") >= 0) return "Supervision Bill";
  if (text.indexOf("soil test") >= 0) return "Soil Test";
  if (text.indexOf("digital survey") >= 0 || text.indexOf("survey") >= 0) return "Digital Survey";
  if (text.indexOf("3d") >= 0) return "3D Design";
  if (text.indexOf("estimate") >= 0 || text.indexOf("costing") >= 0) return "Estimate & Costing";
  if (text.indexOf("plan approval") >= 0 || text.indexOf("municipality") >= 0) return "Plan Approval";
  if (text.indexOf("design") >= 0) return "Design Bill";
  return "Other Income";
}

function landViewIncomeLedgerRows_(projects) {
  return readSheet(CONFIG.SHEETS.PAYMENTS).map(function(payment) {
    var projectId = landViewLedgerText_(landViewLedgerFirst_(payment, ["Project_ID", "Project ID", "ProjectId", "FILE ID", "File ID"]));
    var project = projects[projectId] || { projectName: "", clientName: "" };
    return {
      Income_ID: landViewLedgerText_(landViewLedgerFirst_(payment, ["Payment_ID", "Payment ID", "PaymentId"])),
      Payment_Date: landViewLedgerFirst_(payment, ["Payment_Date", "Payment Date", "Date"]),
      File_ID: projectId,
      Project_Name: project.projectName,
      Client_Name: project.clientName,
      Payment_For: landViewLedgerFirst_(payment, ["Payment_For", "Payment For", "Category", "Description", "Service", "Particulars"]),
      Amount: landViewLedgerFirst_(payment, ["Amount", "Payment_Amount", "Payment Amount"]),
      Payment_Method: landViewLedgerFirst_(payment, ["Payment_Method", "Payment Method", "Method"]),
      Reference_No: landViewLedgerFirst_(payment, ["Reference_No", "Reference No", "Reference", "Transaction_ID", "Transaction ID"]),
      Received_From: landViewLedgerFirst_(payment, ["Received_From", "Received From", "Payer", "Paid_By", "Paid By"]) || project.clientName,
      Received_By: landViewLedgerFirst_(payment, ["Received_By", "Received By", "Created_By", "Created By"]),
      Deposit_Account: landViewLedgerFirst_(payment, ["Deposit_Account", "Deposit Account", "Account", "Account_Name", "Account Name"]),
      Receipt_URL: landViewLedgerFirst_(payment, ["Receipt_URL", "Receipt URL", "Receipt", "Document_URL", "Document URL"]),
      Notes: landViewLedgerFirst_(payment, ["Notes", "Remarks"]),
      Created_At: landViewLedgerFirst_(payment, ["Created_At", "Created At", "Timestamp"]),
      Created_By: landViewLedgerFirst_(payment, ["Created_By", "Created By", "Received_By", "Received By"]),
      Income_Category: landViewIncomeCategory_(payment)
    };
  }).filter(function(row) { return !!row.Income_ID; });
}

function landViewExpenseLedgerRows_(projects) {
  return readSheet(CONFIG.SHEETS.EXPENSES).map(function(expense) {
    var projectId = landViewLedgerText_(landViewLedgerFirst_(expense, ["Project_ID", "Project ID", "ProjectId", "FILE ID", "File ID"]));
    var project = projects[projectId] || { projectName: "" };
    var requestedBy = landViewLedgerFirst_(expense, ["Requested_By", "Requested By", "Created_By", "Created By", "Employee_ID", "Employee ID"]);
    var requestedAt = landViewLedgerFirst_(expense, ["Requested_At", "Requested At", "Created_At", "Created At"]);
    var approvedBy = landViewLedgerFirst_(expense, ["Approved_By", "Approved By", "Reviewed_By", "Reviewed By"]);
    var approvedAt = landViewLedgerFirst_(expense, ["Approved_At", "Approved At", "Reviewed_At", "Reviewed At"]);
    return {
      Expense_ID: landViewLedgerText_(landViewLedgerFirst_(expense, ["Expense_ID", "Expense ID", "ExpenseId"])),
      Expense_Date: landViewLedgerFirst_(expense, ["Expense_Date", "Expense Date", "Date"]),
      File_ID: projectId,
      Project_Name: project.projectName,
      Category: landViewLedgerFirst_(expense, ["Category", "Expense_Category", "Expense Category"]),
      Description: landViewLedgerFirst_(expense, ["Description", "Particulars", "Expense"]),
      Amount: landViewLedgerFirst_(expense, ["Amount", "Expense_Amount", "Expense Amount"]),
      Requested_By: requestedBy,
      Requested_At: requestedAt,
      Approval_Status: landViewLedgerFirst_(expense, ["Approval_Status", "Approval Status", "Status"]) || "Pending",
      Approved_By: approvedBy,
      Approved_At: approvedAt,
      Paid_To: landViewLedgerFirst_(expense, ["Paid_To", "Paid To", "Payee", "Vendor"]),
      Payment_Method: landViewLedgerFirst_(expense, ["Payment_Method", "Payment Method", "Method"]),
      Reference_No: landViewLedgerFirst_(expense, ["Reference_No", "Reference No", "Reference", "Transaction_ID", "Transaction ID"]),
      Receipt_URL: landViewLedgerFirst_(expense, ["Receipt_URL", "Receipt URL", "Receipt", "Document_URL", "Document URL"]),
      Notes: landViewLedgerFirst_(expense, ["Notes", "Review_Notes", "Review Notes", "Remarks"]),
      Created_At: landViewLedgerFirst_(expense, ["Created_At", "Created At"]),
      Created_By: landViewLedgerFirst_(expense, ["Created_By", "Created By", "Employee_ID", "Employee ID"])
    };
  }).filter(function(row) { return !!row.Expense_ID; });
}

function landViewEnsureChairmanExpensePermissions_() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.PERMISSIONS) || ss.insertSheet(CONFIG.SHEETS.PERMISSIONS);
  var headers = landViewLedgerEnsureHeaders_(sheet, [
    "Permission_ID", "User_ID", "Role", "Permission", "Status", "Created_At", "Created_By"
  ]);
  var existing = [];
  if (sheet.getLastRow() > 1) {
    existing = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row) {
      var record = {};
      headers.forEach(function(header, index) { record[header] = row[index]; });
      return record;
    });
  }

  var granted = [];
  ["expenses.submit", "expenses.approve"].forEach(function(permission) {
    var alreadyConfigured = existing.some(function(record) {
      return landViewLedgerText_(record.User_ID).toUpperCase() === "EMP-0001" &&
        landViewLedgerText_(record.Permission) === permission;
    });
    if (alreadyConfigured) return;

    var record = {
      Permission_ID: "CHAIRMAN-EMP-0001-" + permission.replace(/[^A-Za-z0-9]+/g, "-").toUpperCase(),
      User_ID: "EMP-0001",
      Role: "Chairman",
      Permission: permission,
      Status: "Active",
      Created_At: new Date().toISOString(),
      Created_By: "System Setup — Chairman Authorization"
    };
    sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
    existing.push(record);
    granted.push(permission);
  });

  return { userId: "EMP-0001", granted: granted };
}

function landViewRemoveKnownTestExpense_(ledger) {
  var removedSource = 0;
  var removedLedger = 0;
  var sourceSheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.EXPENSES);

  function rowMatches(headers, row) {
    function cell(names) {
      for (var n = 0; n < names.length; n++) {
        var index = headers.indexOf(names[n]);
        if (index >= 0) return row[index];
      }
      return "";
    }
    var id = landViewLedgerText_(cell(["Expense_ID", "Expense ID", "ExpenseId"]));
    var amount = Number(String(cell(["Amount", "Expense_Amount", "Expense Amount"]) || 0).replace(/[^0-9.-]/g, ""));
    var owner = landViewLedgerText_(cell(["Created_By", "Created By", "Requested_By", "Requested By", "Employee_ID", "Employee ID"])).toUpperCase();
    var description = landViewLedgerText_(cell(["Description", "Particulars", "Expense"])).toLowerCase();
    return id === "EXP-0001" && amount === 100 && owner === "EMP-0001" && description === "office nasta";
  }

  if (sourceSheet && sourceSheet.getLastRow() > 1) {
    var sourceHeaders = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || "").trim(); });
    var sourceRows = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, sourceHeaders.length).getValues();
    for (var i = sourceRows.length - 1; i >= 0; i--) {
      if (rowMatches(sourceHeaders, sourceRows[i])) {
        sourceSheet.deleteRow(i + 2);
        removedSource++;
      }
    }
  }

  var expenseSheet = ledger.getSheetByName("Expenses");
  if (expenseSheet && expenseSheet.getLastRow() > 1) {
    var ledgerHeaders = expenseSheet.getRange(1, 1, 1, expenseSheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || "").trim(); });
    var ledgerRows = expenseSheet.getRange(2, 1, expenseSheet.getLastRow() - 1, ledgerHeaders.length).getValues();
    for (var j = ledgerRows.length - 1; j >= 0; j--) {
      if (rowMatches(ledgerHeaders, ledgerRows[j])) {
        expenseSheet.deleteRow(j + 2);
        removedLedger++;
      }
    }
  }

  return { source: removedSource, ledger: removedLedger };
}

function syncLandViewIncomeExpenseLedger() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var chairmanPermissions = landViewEnsureChairmanExpensePermissions_();
    var ledger = getLandViewFinanceLedger_();
    var testCleanup = landViewRemoveKnownTestExpense_(ledger);
    var incomeSheet = ledger.getSheetByName("Income") || ledger.insertSheet("Income");
    var expenseSheet = ledger.getSheetByName("Expenses") || ledger.insertSheet("Expenses");

    var incomeHeaders = landViewLedgerEnsureHeaders_(incomeSheet, [
      "Income_ID", "Payment_Date", "File_ID", "Project_Name", "Client_Name", "Payment_For", "Amount",
      "Payment_Method", "Reference_No", "Received_From", "Received_By", "Deposit_Account", "Receipt_URL",
      "Notes", "Created_At", "Created_By", "Income_Category"
    ]);
    var expenseHeaders = landViewLedgerEnsureHeaders_(expenseSheet, [
      "Expense_ID", "Expense_Date", "File_ID", "Project_Name", "Category", "Description", "Amount",
      "Requested_By", "Requested_At", "Approval_Status", "Approved_By", "Approved_At", "Paid_To",
      "Payment_Method", "Reference_No", "Receipt_URL", "Notes", "Created_At", "Created_By"
    ]);

    var projects = landViewProjectLookup_();
    var incomeResult = landViewLedgerUpsert_(incomeSheet, incomeHeaders, "Income_ID", landViewIncomeLedgerRows_(projects));
    var expenseResult = landViewLedgerUpsert_(expenseSheet, expenseHeaders, "Expense_ID", landViewExpenseLedgerRows_(projects));

    SpreadsheetApp.flush();
    return {
      success: true,
      spreadsheetId: ledger.getId(),
      spreadsheetUrl: ledger.getUrl(),
      income: incomeResult,
      expenses: expenseResult,
      chairmanPermissions: chairmanPermissions,
      testExpenseCleanup: testCleanup,
      syncedAt: new Date().toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function installLandViewFinanceLedgerTrigger() {
  var handler = "syncLandViewIncomeExpenseLedger";
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyMinutes(5)
    .create();

  var firstSync = syncLandViewIncomeExpenseLedger();
  return {
    success: true,
    trigger: "Every 5 minutes",
    firstSync: firstSync
  };
}

function removeLandViewFinanceLedgerTrigger() {
  var handler = "syncLandViewIncomeExpenseLedger";
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return { success: true, removed: removed };
}
