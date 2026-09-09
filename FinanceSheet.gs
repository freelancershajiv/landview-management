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
  if (!Object.prototype.hasOwnProperty.call(widths, tab)) {
    throw new Error("Unknown finance worksheet.");
  }

  const ss = SpreadsheetApp.openById(id);

  // Support both the old tab name and the clearer renamed tab name.
  let sheet = null;
  if (tab === "S Deposit") {
    sheet = ss.getSheetByName("Supervision Deposit") || ss.getSheetByName("S Deposit");
  } else {
    sheet = ss.getSheetByName(tab);
  }

  const summary = ss.getSheetByName("Summary");

  if (!sheet) {
    throw new Error(
      tab === "S Deposit"
        ? 'Supervision Deposit worksheet was not found. Name the tab either "Supervision Deposit" or "S Deposit".'
        : 'Finance worksheet "' + tab + '" was not found.'
    );
  }

  if (!summary) {
    throw new Error('Finance worksheet "Summary" was not found.');
  }

  if (summary.getLastRow() > 10000 || sheet.getLastRow() > 10000) {
    throw new Error("Finance worksheet exceeds the 10,000-row reading limit.");
  }

  // The first 18 Summary columns remain the accounting source used for totals.
  // Column Q (17th column / index 16) is the project payment Status used by the web filters.
  const summaryRows = summary
    .getRange(1, 1, Math.max(1, summary.getLastRow()), 18)
    .getValues()
    .slice(1);

  const totals = {
    gross: 0,
    discount: 0,
    billed: 0,
    paid: 0,
    due: 0,
    projects: 0
  };

  const populatedIds = Object.create(null);

  const number = function(value) {
    if (value === "" || value === null || value === undefined) return 0;
    const result = Number(value);
    if (!Number.isFinite(result)) {
      throw new Error("A Summary amount is invalid. Check formulas in the Google Sheet.");
    }
    return result;
  };

  const hasValue = function(value) {
    return value !== "" && value !== null && value !== undefined && value !== 0;
  };

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

  if (Math.abs(totals.billed - totals.paid - totals.due) > 0.01) {
    throw new Error("Summary totals do not reconcile. Check the Google Sheet before using these balances.");
  }

  const height = tab === "Invoice"
    ? Math.min(40, Math.max(1, sheet.getLastRow()))
    : Math.max(1, sheet.getLastRow());

  const readWidth = tab === "Summary"
    ? Math.max(18, Math.min(30, sheet.getLastColumn()))
    : widths[tab];

  const grid = sheet.getRange(1, 1, height, readWidth).getDisplayValues();

  let headers = tab === "Invoice"
    ? Array.from({ length: readWidth }, function(_, i) {
        return String.fromCharCode(65 + i);
      })
    : grid[0];

  let rows = (tab === "Invoice" ? grid : grid.slice(1)).filter(function(row) {
    if (tab === "Invoice") return row.some(hasValue);
    if (tab === "Summary") return !!populatedIds[String(row[0])];
    if (tab === "File List") return row.slice(1).some(hasValue);
    return row.slice(2).some(hasValue);
  });

  // Keep every Summary column, especially Q / Status, so the web app can filter from the sheet's status value.
  if (tab !== "Summary" && !["Invoice", "File List"].includes(tab)) {
    const omit = 1;
    headers = headers.filter(function(_, i) {
      return i !== omit;
    });
    rows = rows.map(function(row) {
      return row.filter(function(_, i) {
        return i !== omit;
      });
    });
  }

  return {
    success: true,
    data: {
      tab: tab,
      tabs: Object.keys(widths),
      headers: headers,
      rows: rows,
      totals: totals,
      url: ss.getUrl() + "#gid=" + sheet.getSheetId(),
      updatedAt: new Date().toISOString()
    }
  };
}
