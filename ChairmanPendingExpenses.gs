/* LAND VIEW — EMP-0001 Chairman pending expense workflow. */

const CHAIRMAN_EMPLOYEE_ID_ = "EMP-0001";
const RONY_SEPTEMBER_EXPENSE_PREFIX_ = "RONY-SEP-2026-";

function chairmanSession_(params) {
  var session = requireSession(params || {});
  var employeeId = String(session.employeeId || "").trim().toUpperCase();
  var userId = String(session.userId || "").trim().toUpperCase();
  var name = String(session.name || "").trim().toLowerCase();
  var chairman = employeeId === CHAIRMAN_EMPLOYEE_ID_ || userId === CHAIRMAN_EMPLOYEE_ID_ || name.indexOf("jamal rony") >= 0;
  if (!chairman && !isAdminRole(session.role)) throw new Error("Chairman approval access is restricted to EMP-0001.");
  return session;
}

function ronySeptemberExpenseSeeds_() {
  return [
    { Expense_ID: "RONY-SEP-2026-001", Expense_Date: "2026-09-03", Description: "Eng Rony Mobile Recharge", Amount: 639 },
    { Expense_ID: "RONY-SEP-2026-002", Expense_Date: "2026-09-03", Description: "Nisha Bhabi Piali Dress Buying", Amount: 1300 },
    { Expense_ID: "RONY-SEP-2026-003", Expense_Date: "2026-09-05", Description: "Send Money to 01408080400", Amount: 10020 },
    { Expense_ID: "RONY-SEP-2026-004", Expense_Date: "2026-09-07", Description: "Hazari Road Shop Rent", Amount: 20000, Notes: "Eng Rony personal/salary draw from LAND VIEW. The source personal ledger also showed BDT 13,000 income; that amount is not LAND VIEW income." },
    { Expense_ID: "RONY-SEP-2026-005", Expense_Date: "2026-09-07", Description: "Fu Teacher Account", Amount: 7000 },
    { Expense_ID: "RONY-SEP-2026-006", Expense_Date: "2026-09-09", Description: "Nisha Bhabi Send Money", Amount: 10704.25 },
    { Expense_ID: "RONY-SEP-2026-007", Expense_Date: "2026-09-09", Project_ID: "LV-048", Description: "LV-048 - Daudpool Bill to Eng Rony Bkash", Amount: 20000 }
  ];
}

function ensureRonySeptemberPendingExpenses_() {
  var module = erpModule_("expenses");
  ensureErpModule_(module);
  var sheet = getSheet(CONFIG.SHEETS.EXPENSES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || "").trim(); });
  var idIndex = headers.indexOf("Expense_ID");
  if (idIndex < 0) throw new Error("Expenses sheet is missing Expense_ID.");

  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, idIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function(row) {
      var id = String(row[0] || "").trim();
      if (id) existing[id] = true;
    });
  }

  var created = 0;
  ronySeptemberExpenseSeeds_().forEach(function(seed) {
    if (existing[seed.Expense_ID]) return;
    var record = {
      Expense_ID: seed.Expense_ID,
      Project_ID: seed.Project_ID || "",
      Expense_Date: seed.Expense_Date,
      Category: "Salary / Wages",
      Description: seed.Description,
      Amount: seed.Amount,
      Payment_Method: "bKash",
      Reference: seed.Expense_ID,
      Status: "Pending",
      Notes: seed.Notes || "Eng Rony personal cost / salary draw from LAND VIEW; not an office operating cost.",
      Reviewed_By: "",
      Reviewed_At: "",
      Review_Notes: "",
      Created_At: new Date().toISOString(),
      Created_By: CHAIRMAN_EMPLOYEE_ID_
    };
    sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
    existing[seed.Expense_ID] = true;
    created++;
  });
  return created;
}

function getChairmanPendingApprovals(params) {
  chairmanSession_(params);
  ensureRonySeptemberPendingExpenses_();
  var rows = readSheet(CONFIG.SHEETS.EXPENSES).filter(function(row) {
    var id = String(row.Expense_ID || "").trim();
    return id.indexOf(RONY_SEPTEMBER_EXPENSE_PREFIX_) === 0;
  });
  return { success: true, data: rows };
}

function reviewChairmanPendingApproval(params) {
  var session = chairmanSession_(params);
  ensureRonySeptemberPendingExpenses_();
  var id = String(params.id || params.Expense_ID || "").trim();
  var status = String(params.status || params.Status || "").trim();
  if (id.indexOf(RONY_SEPTEMBER_EXPENSE_PREFIX_) !== 0) throw new Error("Invalid chairman approval ID.");
  if (["Approved", "Rejected", "Returned"].indexOf(status) < 0) throw new Error("Invalid approval decision.");

  var module = erpModule_("expenses");
  ensureErpModule_(module);
  var sheet = getSheet(CONFIG.SHEETS.EXPENSES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || "").trim(); });
  var idIndex = headers.indexOf("Expense_ID");
  var statusIndex = headers.indexOf("Status");
  var reviewedByIndex = headers.indexOf("Reviewed_By");
  var reviewedAtIndex = headers.indexOf("Reviewed_At");
  var reviewNotesIndex = headers.indexOf("Review_Notes");
  if (idIndex < 0 || statusIndex < 0) throw new Error("Expenses approval columns are not initialized.");

  var values = sheet.getRange(2, 1, Math.max(0, sheet.getLastRow() - 1), headers.length).getValues();
  var rowIndex = -1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idIndex] || "").trim() === id) { rowIndex = i + 2; break; }
  }
  if (rowIndex < 0) throw new Error("Pending expense was not found.");

  sheet.getRange(rowIndex, statusIndex + 1).setValue(status);
  if (reviewedByIndex >= 0) sheet.getRange(rowIndex, reviewedByIndex + 1).setValue(session.employeeId || session.userId || CHAIRMAN_EMPLOYEE_ID_);
  if (reviewedAtIndex >= 0) sheet.getRange(rowIndex, reviewedAtIndex + 1).setValue(new Date().toISOString());
  if (reviewNotesIndex >= 0) sheet.getRange(rowIndex, reviewNotesIndex + 1).setValue(String(params.note || params.Review_Notes || (status + " by Eng Jamal Rony")).trim());

  try { syncLandViewIncomeExpenseLedger(); } catch (error) {}
  return { success: true, data: { Expense_ID: id, Status: status } };
}
