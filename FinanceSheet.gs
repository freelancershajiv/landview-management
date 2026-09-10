/* Live, read-only connection to the authorized Google Sheets copy. */
function getFinanceSheet(params) {
  const session = requireSession(params);
  if (!isWorkspaceRole(session.role)) throw new Error("Access denied.");

  const id = "1-JoPQqqntxP7NMVNHSYN-RYkHLWMQf4K";

  const widths = {
    "Summary": 18,
    "Invoice": 20,
    "File List": 8,
    "Design Bill": 6,
    "Design Deposit": 5,
    "Supervision Bill": 7,
    "S Deposit": 5,
    "Others Bill": 6,
    "Others Bill Deposit": 5
  };

  const tab = String(params.tab || "Summary");
  if (!Object.prototype.hasOwnProperty.call(widths, tab)) throw new Error("Unknown finance worksheet.");

  const ss = SpreadsheetApp.openById(id);
  let sheet = null;
  if (tab === "S Deposit") sheet = ss.getSheetByName("Supervision Deposit") || ss.getSheetByName("S Deposit");
  else sheet = ss.getSheetByName(tab);

  const summary = ss.getSheetByName("Summary");
  if (!sheet) throw new Error(tab === "S Deposit" ? 'Supervision Deposit worksheet was not found. Name the tab either "Supervision Deposit" or "S Deposit".' : 'Finance worksheet "' + tab + '" was not found.');
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
    if (tab === "File List") return row.slice(1).some(hasValue);
    return row.slice(2).some(hasValue);
  });

  if (tab !== "Summary" && !["Invoice", "File List"].includes(tab)) {
    const omit = 1;
    headers = headers.filter(function(_, i) { return i !== omit; });
    rows = rows.map(function(row) { return row.filter(function(_, i) { return i !== omit; }); });
  }

  return { success: true, data: { tab: tab, tabs: Object.keys(widths), headers: headers, rows: rows, totals: totals, url: ss.getUrl() + "#gid=" + sheet.getSheetId(), updatedAt: new Date().toISOString() } };
}

/* Public through the protected Next.js gateway only. Returns the CURRENT Summary row
 * for one project so a permanent QR always shows the latest balances. */
function getPublicBillingVerification(params) {
  const raw = String((params && params.fileId) || "").trim().toUpperCase();
  const fileId = raw.indexOf("LV-") === 0 ? raw : "LV-" + raw.replace(/\D/g, "");
  if (!/^LV-\d+$/.test(fileId)) throw new Error("Invalid File ID.");

  const ss = SpreadsheetApp.openById("1-JoPQqqntxP7NMVNHSYN-RYkHLWMQf4K");
  const summary = ss.getSheetByName("Summary");
  if (!summary) throw new Error('Finance worksheet "Summary" was not found.');
  if (summary.getLastRow() > 10000) throw new Error("Finance worksheet exceeds the 10,000-row reading limit.");

  const values = summary.getRange(2, 1, Math.max(1, summary.getLastRow() - 1), 18).getValues();
  const number = function(value) {
    if (value === "" || value === null || value === undefined) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const normalizeId = function(value) {
    const text = String(value || "").trim().toUpperCase();
    return text.indexOf("LV-") === 0 ? text : "LV-" + text.replace(/\D/g, "");
  };

  let row = null;
  for (let i = 0; i < values.length; i++) {
    if (normalizeId(values[i][0]) === fileId) { row = values[i]; break; }
  }
  if (!row) throw new Error("Project billing record was not found.");

  const categories = [
    { name: "Engineering", gross: number(row[3]), discount: number(row[4]), paid: number(row[5]), due: number(row[6]) },
    { name: "Supervision", gross: number(row[7]), discount: number(row[8]), paid: number(row[9]), due: number(row[10]) },
    { name: "Others", gross: number(row[11]), discount: number(row[12]), paid: number(row[13]), due: number(row[14]) }
  ];
  const totals = categories.reduce(function(acc, item) {
    acc.gross += item.gross; acc.discount += item.discount; acc.paid += item.paid; acc.due += item.due; return acc;
  }, { gross: 0, discount: 0, paid: 0, due: 0 });

  return {
    success: true,
    data: {
      fileId: fileId,
      clientName: String(row[1] || ""),
      contact: String(row[2] || ""),
      status: String(row[16] || (totals.due > 0 ? "Due" : "Full Paid")),
      categories: categories,
      totals: totals,
      updatedAt: new Date().toISOString()
    }
  };
}
