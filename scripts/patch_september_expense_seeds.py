from pathlib import Path
import runpy

path = Path("Code.gs")
s = path.read_text(encoding="utf-8")

seed_block = r'''
function september2026ApprovalSeedsCore_() {
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
    { ref: "RONY-SEP-2026-001", date: "2026-09-03", description: "Eng Rony Mobile Recharge", amount: 639, category: "Salary / Wages", personal: true },
    { ref: "RONY-SEP-2026-002", date: "2026-09-03", description: "Nisha Bhabi Piali Dress Buying", amount: 1300, category: "Salary / Wages", personal: true },
    { ref: "RONY-SEP-2026-003", date: "2026-09-05", description: "Send Money to 01408080400", amount: 10020, category: "Salary / Wages", personal: true },
    { ref: "RONY-SEP-2026-004", date: "2026-09-07", description: "Hazari Road Shop Rent", amount: 20000, category: "Salary / Wages", personal: true },
    { ref: "RONY-SEP-2026-005", date: "2026-09-07", description: "Fu Teacher Account", amount: 7000, category: "Salary / Wages", personal: true },
    { ref: "RONY-SEP-2026-006", date: "2026-09-09", description: "Nisha Bhabi Send Money", amount: 10704.25, category: "Salary / Wages", personal: true },
    { ref: "RONY-SEP-2026-007", date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Daudpool Bill to Eng Rony Bkash", amount: 20000, category: "Salary / Wages", personal: true }
  ];
}

function ensureSeptember2026PendingExpensesCore_() {
  const sheet = getSheet(CONFIG.SHEETS.EXPENSES);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error("Expenses sheet has no columns.");

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || "").trim();
  });
  if (headers.indexOf("Expense_ID") < 0) throw new Error("Expenses sheet is missing Expense_ID.");

  const referenceIndex = headers.indexOf("Reference");
  const idIndex = headers.indexOf("Expense_ID");
  const existing = {};

  if (sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
    values.forEach(function(row) {
      const id = String(row[idIndex] || "").trim();
      const ref = referenceIndex >= 0 ? String(row[referenceIndex] || "").trim() : "";
      if (id) existing[id] = true;
      if (ref) existing[ref] = true;
    });
  }

  let created = 0;
  september2026ApprovalSeedsCore_().forEach(function(seed) {
    if (existing[seed.ref]) return;

    const record = {
      Expense_ID: seed.ref,
      Project_ID: seed.projectId || "",
      Expense_Date: seed.date,
      Category: seed.category || "Office / Project Cost",
      Description: seed.description,
      Amount: seed.amount,
      Payment_Method: seed.personal ? "bKash" : "",
      Reference: seed.ref,
      Status: "Pending",
      Created_At: new Date().toISOString(),
      Created_By: "EMP-0001",
      Notes: seed.personal
        ? "Eng Rony personal cost / salary draw from LAND VIEW; not an office operating cost."
        : "September 2026 LAND VIEW office/project expense. Requires EMP-0001 approval.",
      Reviewed_By: "",
      Reviewed_At: "",
      Review_Notes: ""
    };

    sheet.appendRow(headers.map(function(header) {
      return record[header] === undefined ? "" : record[header];
    }));
    existing[seed.ref] = true;
    created++;
  });

  return created;
}

'''

if 'function september2026ApprovalSeedsCore_(' not in s:
    anchor = 'function getChairmanPendingApprovalsCore_(params) {'
    if anchor not in s:
        raise SystemExit('chairman approval core anchor not found')
    s = s.replace(anchor, seed_block + anchor, 1)

old_get = '''function getChairmanPendingApprovalsCore_(params) {
  chairmanApprovalSessionCore_(params);

  const rows = readSheet(CONFIG.SHEETS.EXPENSES)'''
new_get = '''function getChairmanPendingApprovalsCore_(params) {
  chairmanApprovalSessionCore_(params);
  ensureSeptember2026PendingExpensesCore_();

  const rows = readSheet(CONFIG.SHEETS.EXPENSES)'''
if old_get in s:
    s = s.replace(old_get, new_get, 1)

old_review = '''function reviewChairmanPendingApprovalCore_(params) {
  const session = chairmanApprovalSessionCore_(params);
  const id = String((params && (params.id || params.Expense_ID)) || "").trim();'''
new_review = '''function reviewChairmanPendingApprovalCore_(params) {
  const session = chairmanApprovalSessionCore_(params);
  ensureSeptember2026PendingExpensesCore_();
  const id = String((params && (params.id || params.Expense_ID)) || "").trim();'''
if old_review in s:
    s = s.replace(old_review, new_review, 1)

path.write_text(s, encoding="utf-8")
print("September 2026 office/project expense seeding restored with duplicate protection")

# The established workflow already executes this file. Chain the unified finance
# approval patch here so income + personal approval changes publish through the
# same tested GitHub Contents API path without changing workflow credentials.
runpy.run_path("scripts/patch_unified_finance_approvals.py", run_name="__main__")
