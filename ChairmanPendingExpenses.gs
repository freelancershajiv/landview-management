/* LAND VIEW — EMP-0001 chairman approval queue for all September 2026 expenses. */

const CHAIRMAN_EMPLOYEE_ID_ = "EMP-0001";

function chairmanIdentityText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chairmanSession_(params) {
  var session = requireSession(params || {});
  var employeeId = String(session.employeeId || "").trim().toUpperCase();
  var userId = String(session.userId || "").trim().toUpperCase();
  var username = String(session.username || "").trim().toLowerCase();
  var name = chairmanIdentityText_(session.name || "");
  var chairman = employeeId === CHAIRMAN_EMPLOYEE_ID_ ||
    userId === CHAIRMAN_EMPLOYEE_ID_ ||
    username === "emp-0001" ||
    name.indexOf("jamal rony") >= 0 ||
    name.indexOf("jamal ahmed bhuiyan") >= 0;

  if (!chairman && !isAdminRole(session.role)) {
    throw new Error("Chairman approval access is restricted to EMP-0001 / Engr. Jamal Ahmed Bhuiyan.");
  }

  if (chairman) session.employeeId = CHAIRMAN_EMPLOYEE_ID_;
  return session;
}

function september2026ExpenseSeeds_() {
  return [
    { ref: "SEP-2026-EXP-001", date: "2026-09-01", description: "Office Wifi Bill", amount: 550, category: "Internet / Phone" },
    { ref: "SEP-2026-EXP-002", date: "2026-09-01", description: "Office Nasta - Halim and Ruti", amount: 520, category: "Refreshment" },
    { ref: "SEP-2026-EXP-003", date: "2026-09-01", description: "Land View Trade License Renew 2026-2027", amount: 4375, category: "Government Fee" },
    { ref: "SEP-2026-EXP-004", date: "2026-09-02", description: "Office Nasta - Halim and Ruti", amount: 420, category: "Refreshment" },
    { ref: "SEP-2026-EXP-005", date: "2026-09-02", description: "Office Cold Drinks - 2 Case", amount: 1890, category: "Refreshment" },
    { ref: "SEP-2026-EXP-006", date: "2026-09-02", description: "3 Office Municipality Holding Tax", amount: 3366, category: "Government Fee" },
    { ref: "SEP-2026-EXP-007", date: "2026-09-02", description: "Eng Shajiv Launch - Municipality", amount: 200, category: "Refreshment" },
    { ref: "SEP-2026-EXP-008", date: "2026-09-02", projectId: "LV-134", description: "LV-134 - Khusipur - Eng Shajiv (15%)", amount: 1500, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-009", date: "2026-09-02", projectId: "LV-134", description: "LV-134 - Khusipur - Eng Borhan & Ahad (10%)", amount: 1000, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-010", date: "2026-09-03", description: "Office Nasta - Halim and Ruti", amount: 420, category: "Refreshment" },
    { ref: "SEP-2026-EXP-011", date: "2026-09-03", projectId: "LV-279", description: "LV-279 - Khodeza - Luddar Par - Soil Test", amount: 13000, category: "Soil Test / Survey Cost" },
    { ref: "SEP-2026-EXP-012", date: "2026-09-03", projectId: "LV-279", description: "LV-279 - Khodeza - Eng Shajiv", amount: 400, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-013", date: "2026-09-03", description: "Launch With Mahtab bhai", amount: 1350, category: "Refreshment" },
    { ref: "SEP-2026-EXP-014", date: "2026-09-03", description: "Sika Chemicle Sale", amount: 400, category: "Sales / Material Cost" },
    { ref: "SEP-2026-EXP-015", date: "2026-09-05", description: "Office Nasta", amount: 100, category: "Refreshment" },
    { ref: "SEP-2026-EXP-016", date: "2026-09-06", projectId: "LV-280", description: "LV-280 - Nurul Huda - Silonia - Soil Test", amount: 12000, category: "Soil Test / Survey Cost" },
    { ref: "SEP-2026-EXP-017", date: "2026-09-06", projectId: "LV-280", description: "LV-280 - Eng Shajiv Commission", amount: 500, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-018", date: "2026-09-06", description: "Office Water", amount: 60, category: "Refreshment" },
    { ref: "SEP-2026-EXP-019", date: "2026-09-06", description: "Office Nasta", amount: 100, category: "Refreshment" },
    { ref: "SEP-2026-EXP-020", date: "2026-09-06", description: "Office Nasta - 10 pc chotpoti and puchka", amount: 500, category: "Refreshment" },
    { ref: "SEP-2026-EXP-021", date: "2026-09-06", projectId: "LV-209", description: "LV-209 - Razu - Eng Shajiv Commission (15%)", amount: 6000, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-022", date: "2026-09-06", projectId: "LV-209", description: "LV-209 - Razu - Eng Ahad + Borhan (10%)", amount: 4000, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-023", date: "2026-09-09", projectId: "LV-219", description: "LV-219 - Hassan - Eng Shajiv Commission (15%)", amount: 2700, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-024", date: "2026-09-09", projectId: "LV-219", description: "LV-219 - Hassan - Eng Ahad & Borhan (10%)", amount: 1800, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-025", date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Bablu - Eng Shajiv Commission (15%)", amount: 3000, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-026", date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Bablu - Eng Ahad & Borhan (10%)", amount: 2000, category: "Staff Commission / Bonus" },
    { ref: "SEP-2026-EXP-027", date: "2026-09-12", projectId: "LV-276", description: "LV-276 - Ali - Eng Shajiv Visit Bonus", amount: 500, category: "Staff Commission / Bonus" },

    { ref: "RONY-SEP-2026-001", date: "2026-09-03", description: "Eng Rony Mobile Recharge", amount: 639, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
    { ref: "RONY-SEP-2026-002", date: "2026-09-03", description: "Nisha Bhabi Piali Dress Buying", amount: 1300, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
    { ref: "RONY-SEP-2026-003", date: "2026-09-05", description: "Send Money to 01408080400", amount: 10020, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
    { ref: "RONY-SEP-2026-004", date: "2026-09-07", description: "Hazari Road Shop Rent", amount: 20000, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary", note: "Eng Rony personal cost / salary draw from LAND VIEW. The BDT 13,000 personal-ledger income is not LAND VIEW income." },
    { ref: "RONY-SEP-2026-005", date: "2026-09-07", description: "Fu Teacher Account", amount: 7000, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
    { ref: "RONY-SEP-2026-006", date: "2026-09-09", description: "Nisha Bhabi Send Money", amount: 10704.25, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
    { ref: "RONY-SEP-2026-007", date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Daudpool Bill to Eng Rony Bkash", amount: 20000, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" }
  ];
}

function isSeptember2026Expense_(row) {
  var raw = firstValue(row || {}, ["Expense_Date", "Expense Date", "Date"]);
  var text = String(raw || "").trim();
  if (/^2026-09-/.test(text)) return true;
  var date = raw instanceof Date ? raw : new Date(text);
  return !isNaN(date.getTime()) && date.getFullYear() === 2026 && date.getMonth() === 8;
}

function ensureSeptember2026PendingExpenses_() {
  var module = erpModule_("expenses");
  ensureErpModule_(module);
  var sheet = getSheet(CONFIG.SHEETS.EXPENSES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || "").trim(); });
  var idIndex = headers.indexOf("Expense_ID");
  var referenceIndex = headers.indexOf("Reference");
  if (idIndex < 0) throw new Error("Expenses sheet is missing Expense_ID.");

  var existing = {};
  if (sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
    values.forEach(function(row) {
      var id = String(row[idIndex] || "").trim();
      var ref = referenceIndex >= 0 ? String(row[referenceIndex] || "").trim() : "";
      if (id) existing[id] = true;
      if (ref) existing[ref] = true;
    });
  }

  var created = 0;
  september2026ExpenseSeeds_().forEach(function(seed) {
    if (existing[seed.ref]) return;
    var personal = String(seed.ref || "").indexOf("RONY-SEP-2026-") === 0;
    var record = {
      Expense_ID: seed.ref,
      Project_ID: seed.projectId || "",
      Expense_Date: seed.date,
      Category: seed.category || "Office / Project Cost",
      Description: seed.description,
      Amount: seed.amount,
      Payment_Method: personal ? "bKash" : "",
      Reference: seed.ref,
      Status: "Pending",
      Approval_Status: "Pending",
      Approved_By: "",
      Approved_At: "",
      Classification: seed.classification || "Office / Project Cost",
      Notes: seed.note || (personal
        ? "Eng Rony personal cost / salary draw from LAND VIEW; not an office operating cost."
        : "September 2026 LAND VIEW expense. Requires EMP-0001 approval."),
      Reviewed_By: "",
      Reviewed_At: "",
      Review_Notes: "",
      Created_At: new Date().toISOString(),
      Created_By: CHAIRMAN_EMPLOYEE_ID_
    };
    sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
    existing[seed.ref] = true;
    created++;
  });
  return created;
}

function getChairmanPendingApprovals(params) {
  chairmanSession_(params);
  ensureSeptember2026PendingExpenses_();
  var rows = readSheet(CONFIG.SHEETS.EXPENSES)
    .filter(isSeptember2026Expense_)
    .sort(function(a, b) {
      var ad = new Date(String(firstValue(a, ["Expense_Date", "Expense Date", "Date"]) || 0)).getTime() || 0;
      var bd = new Date(String(firstValue(b, ["Expense_Date", "Expense Date", "Date"]) || 0)).getTime() || 0;
      return ad - bd;
    });
  return { success: true, data: rows };
}

function reviewChairmanPendingApproval(params) {
  var session = chairmanSession_(params);
  ensureSeptember2026PendingExpenses_();
  var id = String(params.id || params.Expense_ID || "").trim();
  var status = String(params.status || params.Status || "").trim();
  if (!id) throw new Error("Expense ID is required.");
  if (["Approved", "Rejected", "Returned"].indexOf(status) < 0) throw new Error("Invalid approval decision.");

  var module = erpModule_("expenses");
  ensureErpModule_(module);
  var sheet = getSheet(CONFIG.SHEETS.EXPENSES);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || "").trim(); });
  var idIndex = headers.indexOf("Expense_ID");
  if (idIndex < 0) throw new Error("Expenses sheet is missing Expense_ID.");

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Pending expense was not found.");
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rowIndex = -1;
  var rowRecord = null;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idIndex] || "").trim() === id) {
      rowIndex = i + 2;
      rowRecord = {};
      headers.forEach(function(header, index) { rowRecord[header] = values[i][index]; });
      break;
    }
  }
  if (rowIndex < 0 || !rowRecord) throw new Error("Pending expense was not found.");
  if (!isSeptember2026Expense_(rowRecord)) throw new Error("Only September 2026 expenses can be reviewed from this queue.");

  function setIfPresent_(header, value) {
    var index = headers.indexOf(header);
    if (index >= 0) sheet.getRange(rowIndex, index + 1).setValue(value);
  }

  var now = new Date().toISOString();
  var reviewer = session.employeeId || session.userId || CHAIRMAN_EMPLOYEE_ID_;
  setIfPresent_("Status", status);
  setIfPresent_("Approval_Status", status);
  setIfPresent_("Reviewed_By", reviewer);
  setIfPresent_("Reviewed_At", now);
  setIfPresent_("Review_Notes", String(params.note || params.Review_Notes || (status + " by EMP-0001 / Engr. Jamal Ahmed Bhuiyan")).trim());
  setIfPresent_("Approved_By", status === "Approved" ? CHAIRMAN_EMPLOYEE_ID_ : "");
  setIfPresent_("Approved_At", status === "Approved" ? now : "");

  try { syncLandViewIncomeExpenseLedger(); } catch (error) {}
  return { success: true, data: { Expense_ID: id, Status: status, Reviewed_By: reviewer } };
}
