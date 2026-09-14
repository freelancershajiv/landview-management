from pathlib import Path


path = Path("FinanceSheet.gs")
text = path.read_text(encoding="utf-8")

marker = "function getProjectBillingFinanceBundle_(params, session) {"
if marker not in text:
    helper = r'''
function projectBillingVerificationMaps_() {
  var maps = {
    "Design Deposit": {},
    "S Deposit": {},
    "Others Bill Deposit": {}
  };

  try {
    var ledger = getLandViewFinanceLedger_();
    var sheet = ledger.getSheetByName("Auto Invoice Reconciliation");
    if (!sheet || sheet.getLastRow() < 2) return maps;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function(value) {
      return String(value || "").trim();
    });
    var sourceSheetIndex = headers.indexOf("Source_Sheet");
    var sourceRowIndex = headers.indexOf("Source_Row");
    var incomeIdIndex = headers.indexOf("Matched_Income_ID");
    var matchStatusIndex = headers.indexOf("Match_Status");
    var manualIndex = headers.indexOf("Manual_Verification");
    if (sourceSheetIndex < 0 || sourceRowIndex < 0 || matchStatusIndex < 0) return maps;

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
    rows.forEach(function(row) {
      var sourceName = String(row[sourceSheetIndex] || "").trim();
      if (!Object.prototype.hasOwnProperty.call(maps, sourceName)) return;
      var sourceRow = Number(row[sourceRowIndex] || 0);
      if (!sourceRow) return;

      var incomeId = incomeIdIndex >= 0 ? String(row[incomeIdIndex] || "").trim() : "";
      var matchStatus = String(row[matchStatusIndex] || "").trim().toUpperCase();
      var manual = manualIndex >= 0 ? String(row[manualIndex] || "").trim().toLowerCase() : "";
      maps[sourceName][sourceRow] = {
        verified: manual === "verified" || (manual !== "unverified" && matchStatus === "MATCHED_EXACT" && !!incomeId),
        incomeId: incomeId
      };
    });
  } catch (error) {
    console.log("Project billing verification lookup unavailable: " + (error && error.message ? error.message : error));
  }

  return maps;
}

function projectBillingNumber_(value) {
  var text = String(value == null ? "" : value).trim();
  if (!text || text === "-" || text === "—") return 0;
  text = text.replace(/BDT|Tk\.?|৳|,/gi, "").replace(/\s/g, "");
  if (/^\(.*\)$/.test(text)) text = "-" + text.slice(1, -1);
  var number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function projectBillingTotals_(summaryRows) {
  var totals = { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 };
  if (!summaryRows || !summaryRows.length) return totals;
  var row = summaryRows[0];
  totals.projects = 1;
  totals.gross = projectBillingNumber_(row[3]) + projectBillingNumber_(row[7]) + projectBillingNumber_(row[11]);
  totals.discount = projectBillingNumber_(row[4]) + projectBillingNumber_(row[8]) + projectBillingNumber_(row[12]);
  totals.paid = projectBillingNumber_(row[5]) + projectBillingNumber_(row[9]) + projectBillingNumber_(row[13]);
  totals.due = projectBillingNumber_(row[15]);
  totals.billed = totals.gross - totals.discount;
  return totals;
}

function projectBillingReadTab_(ss, tab, width, projectId, verificationMaps, tabs, updatedAt) {
  var sheet = tab === "S Deposit"
    ? (ss.getSheetByName("Supervision Deposit") || ss.getSheetByName("S Deposit"))
    : ss.getSheetByName(tab);
  if (!sheet) {
    throw new Error(tab === "S Deposit"
      ? 'Supervision Deposit worksheet was not found. Name the tab either "Supervision Deposit" or "S Deposit".'
      : 'Finance worksheet "' + tab + '" was not found.');
  }
  if (sheet.getLastRow() > 10000) throw new Error("Finance worksheet exceeds the 10,000-row reading limit.");

  var height = Math.max(1, sheet.getLastRow());
  var readWidth = tab === "Summary" ? Math.max(18, Math.min(30, sheet.getLastColumn())) : width;
  var grid = sheet.getRange(1, 1, height, readWidth).getDisplayValues();
  var headers = grid[0] || [];
  var sourceRowNumbers = [];
  var rows = grid.slice(1).filter(function(row, index) {
    if (normalizeFinanceWorkflowProjectId_(row[0]) !== projectId) return false;
    if (tab !== "Summary" && tab !== "File List") {
      var hasBillingValue = row.slice(2).some(function(value) {
        return value !== "" && value !== null && value !== undefined;
      });
      if (!hasBillingValue) return false;
    }
    sourceRowNumbers.push(index + 2);
    return true;
  });

  if (tab !== "Summary" && tab !== "File List") {
    headers = headers.filter(function(_, index) { return index !== 1; });
    rows = rows.map(function(row) {
      return row.filter(function(_, index) { return index !== 1; });
    });
  }

  var verificationSource = financeDepositVerificationSource_(tab);
  if (verificationSource) {
    var verificationMap = verificationMaps[verificationSource] || {};
    headers = headers.concat(["Verification", "Linked Income ID"]);
    rows = rows.map(function(row, index) {
      var verification = verificationMap[sourceRowNumbers[index]] || null;
      return row.concat([
        verification && verification.verified ? "Verified" : "Unverified",
        verification && verification.incomeId ? verification.incomeId : ""
      ]);
    });
  }

  return {
    tab: tab,
    tabs: tabs,
    headers: headers,
    rows: rows,
    totals: { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 },
    url: ss.getUrl() + "#gid=" + sheet.getSheetId(),
    updatedAt: updatedAt
  };
}

function getProjectBillingFinanceBundle_(params, session) {
  if (!session || !isWorkspaceRole(session.role)) throw new Error("Access denied.");
  var projectId = normalizeFinanceWorkflowProjectId_(params && params.projectId);
  if (!/^LV-\d+$/.test(projectId)) throw new Error("Enter a valid File ID such as LV-209.");

  var widths = {
    "Summary": 18,
    "File List": 8,
    "Design Bill": 6,
    "Design Deposit": 5,
    "Supervision Bill": 7,
    "S Deposit": 5,
    "Others Bill": 6,
    "Others Bill Deposit": 5
  };
  var tabs = Object.keys(widths);
  var updatedAt = new Date().toISOString();
  var ss = getFinanceWorkbook_();
  var verificationMaps = projectBillingVerificationMaps_();
  var sheets = tabs.map(function(tab) {
    return projectBillingReadTab_(ss, tab, widths[tab], projectId, verificationMaps, tabs, updatedAt);
  });

  var summaryData = sheets.filter(function(item) { return item.tab === "Summary"; })[0];
  var totals = projectBillingTotals_(summaryData ? summaryData.rows : []);
  sheets.forEach(function(item) { item.totals = totals; });

  var paymentParams = Object.assign({}, params || {}, { projectId: projectId });
  var paymentResponse = getPayments(paymentParams);
  var payments = paymentResponse && paymentResponse.success && Array.isArray(paymentResponse.data)
    ? paymentResponse.data
    : [];

  return {
    success: true,
    data: {
      projectId: projectId,
      sheets: sheets,
      payments: payments,
      updatedAt: updatedAt
    }
  };
}

'''
    anchor = "function getFinanceSheet(params) {"
    if anchor not in text:
        raise SystemExit("Could not find getFinanceSheet anchor")
    text = text.replace(anchor, helper + anchor, 1)

branch_old = '''function getFinanceSheet(params) {
  const session = requireSession(params);
  if (!isWorkspaceRole(session.role)) throw new Error("Access denied.");

  const widths = {'''
branch_new = '''function getFinanceSheet(params) {
  const session = requireSession(params);
  if (!isWorkspaceRole(session.role)) throw new Error("Access denied.");

  if (String(params.bundle || "") === "projectBilling") {
    return getProjectBillingFinanceBundle_(params, session);
  }

  const widths = {'''
if branch_new not in text:
    if branch_old not in text:
        raise SystemExit("Could not find getFinanceSheet bundle branch anchor")
    text = text.replace(branch_old, branch_new, 1)

path.write_text(text, encoding="utf-8")
print("Project billing bundle patch applied")
