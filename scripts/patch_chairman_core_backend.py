from pathlib import Path

path = Path("Code.gs")
s = path.read_text(encoding="utf-8")

s = s.replace(
    '    case "getChairmanPendingApprovals": return getChairmanPendingApprovals(params);',
    '    case "getChairmanPendingApprovals": return getChairmanPendingApprovalsCore_(params);',
)
s = s.replace(
    '    case "reviewChairmanPendingApproval": return reviewChairmanPendingApproval(params);',
    '    case "reviewChairmanPendingApproval": return reviewChairmanPendingApprovalCore_(params);',
)

core = r'''
/* =========================================================
   CHAIRMAN EXPENSE APPROVAL CORE
   Self-contained in Code.gs so the web app does not depend on
   ChairmanPendingExpenses.gs being present in the Apps Script project.
========================================================= */

function chairmanApprovalSessionCore_(params) {
  const session = requireSession(params || {});
  const chairman = chairmanIdentityMatches_(session);

  if (!chairman && !isAdminRole(session.role)) {
    throw new Error("Chairman approval access is restricted to EMP-0001 / Engr. Jamal Ahmed Bhuiyan.");
  }

  if (chairman) session.employeeId = "EMP-0001";
  return session;
}

function isSeptember2026ExpenseCore_(row) {
  const raw = firstValue(row || {}, ["Expense_Date", "Expense Date", "Date"]);
  const text = String(raw || "").trim();
  if (/^2026-09-/.test(text)) return true;
  const date = raw instanceof Date ? raw : new Date(text);
  return !isNaN(date.getTime()) && date.getFullYear() === 2026 && date.getMonth() === 8;
}

function getChairmanPendingApprovalsCore_(params) {
  chairmanApprovalSessionCore_(params);

  const rows = readSheet(CONFIG.SHEETS.EXPENSES)
    .filter(isSeptember2026ExpenseCore_)
    .sort(function(a, b) {
      const ad = new Date(String(firstValue(a, ["Expense_Date", "Expense Date", "Date"]) || 0)).getTime() || 0;
      const bd = new Date(String(firstValue(b, ["Expense_Date", "Expense Date", "Date"]) || 0)).getTime() || 0;
      return ad - bd;
    });

  return { success: true, data: rows };
}

function reviewChairmanPendingApprovalCore_(params) {
  const session = chairmanApprovalSessionCore_(params);
  const id = String((params && (params.id || params.Expense_ID)) || "").trim();
  const status = String((params && (params.status || params.Status)) || "").trim();

  if (!id) throw new Error("Expense ID is required.");
  if (["Approved", "Rejected", "Returned"].indexOf(status) < 0) {
    throw new Error("Invalid approval decision.");
  }

  const sheet = getSheet(CONFIG.SHEETS.EXPENSES);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error("Expenses sheet has no columns.");

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || "").trim();
  });
  const idIndex = headers.indexOf("Expense_ID");
  if (idIndex < 0) throw new Error("Expenses sheet is missing Expense_ID.");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Pending expense was not found.");

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  let rowIndex = -1;
  let rowRecord = null;

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idIndex] || "").trim() === id) {
      rowIndex = i + 2;
      rowRecord = {};
      headers.forEach(function(header, index) {
        rowRecord[header] = values[i][index];
      });
      break;
    }
  }

  if (rowIndex < 0 || !rowRecord) throw new Error("Pending expense was not found.");
  if (!isSeptember2026ExpenseCore_(rowRecord)) {
    throw new Error("Only September 2026 expenses can be reviewed from this queue.");
  }

  function setIfPresentCore_(header, value) {
    const index = headers.indexOf(header);
    if (index >= 0) sheet.getRange(rowIndex, index + 1).setValue(value);
  }

  const now = new Date().toISOString();
  const reviewer = session.employeeId || session.userId || "EMP-0001";
  const note = String(
    (params && (params.note || params.Review_Notes)) ||
    (status + " by EMP-0001 / Engr. Jamal Ahmed Bhuiyan")
  ).trim();

  setIfPresentCore_("Status", status);
  setIfPresentCore_("Approval_Status", status);
  setIfPresentCore_("Reviewed_By", reviewer);
  setIfPresentCore_("Reviewed_At", now);
  setIfPresentCore_("Review_Notes", note);
  setIfPresentCore_("Approved_By", status === "Approved" ? "EMP-0001" : "");
  setIfPresentCore_("Approved_At", status === "Approved" ? now : "");

  try {
    if (typeof syncLandViewIncomeExpenseLedger === "function") {
      syncLandViewIncomeExpenseLedger();
    }
  } catch (error) {}

  return {
    success: true,
    data: {
      Expense_ID: id,
      Status: status,
      Reviewed_By: reviewer,
      Reviewed_At: now
    }
  };
}

'''

if 'function getChairmanPendingApprovalsCore_(' not in s:
    anchor = 'function splitIds(value) {'
    if anchor not in s:
        raise SystemExit("splitIds anchor not found")
    s = s.replace(anchor, core + anchor, 1)

path.write_text(s, encoding="utf-8")
print("Self-contained chairman approval backend patched into Code.gs")
