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

/*
 * Permanent QR verification source.
 *
 * Every project QR contains only its File ID. When that QR is scanned, the
 * public verification route calls this function and receives the CURRENT
 * Summary values. Therefore the QR never changes when bills, deposits,
 * discounts or status change.
 *
 * Summary layout used here:
 * A  File ID
 * B  Client Name
 * C  Contact No.
 * D  Design / Engineering Bill
 * E  DB Discount
 * F  DB Deposit
 * G  DB Due
 * H  Supervision Bill
 * I  SB Discount
 * J  SB Deposit
 * K  SB Due
 * L  Others Bill
 * M  OB Discount
 * N  OB Deposit
 * O  OB Due
 * P  Total Due
 * Q  Status
 */
function getPublicBillingVerification(params) {
  const raw = String((params && params.fileId) || "").trim().toUpperCase();
  const digits = raw.replace(/\D/g, "");
  const fileId = raw.indexOf("LV-") === 0 ? raw : (digits ? "LV-" + digits : "");

  if (!/^LV-\d+$/.test(fileId)) throw new Error("Invalid File ID.");

  const ss = SpreadsheetApp.openById("1-JoPQqqntxP7NMVNHSYN-RYkHLWMQf4K");
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
  for (let i = 0; i < values.length; i++) {
    if (normalizeId(values[i][0]) === fileId) {
      row = values[i];
      break;
    }
  }

  if (!row) throw new Error("Project billing record was not found.");

  const categories = [
    {
      name: "Engineering",
      gross: amount(row[3], "Engineering Bill"),
      discount: amount(row[4], "Engineering Discount"),
      paid: amount(row[5], "Engineering Deposit"),
      due: amount(row[6], "Engineering Due")
    },
    {
      name: "Supervision",
      gross: amount(row[7], "Supervision Bill"),
      discount: amount(row[8], "Supervision Discount"),
      paid: amount(row[9], "Supervision Deposit"),
      due: amount(row[10], "Supervision Due")
    },
    {
      name: "Others",
      gross: amount(row[11], "Others Bill"),
      discount: amount(row[12], "Others Discount"),
      paid: amount(row[13], "Others Deposit"),
      due: amount(row[14], "Others Due")
    }
  ];

  const totals = categories.reduce(function(acc, item) {
    acc.gross += item.gross;
    acc.discount += item.discount;
    acc.paid += item.paid;
    acc.due += item.due;
    return acc;
  }, { gross: 0, discount: 0, paid: 0, due: 0 });

  totals.gross = Math.round(totals.gross * 100) / 100;
  totals.discount = Math.round(totals.discount * 100) / 100;
  totals.paid = Math.round(totals.paid * 100) / 100;
  totals.due = Math.round(totals.due * 100) / 100;

  const summaryTotalDue = amount(row[15], "Total Due");
  if (Math.abs(summaryTotalDue - totals.due) > 0.01) {
    throw new Error("Project due amounts do not reconcile with Total Due in the Summary sheet.");
  }

  categories.forEach(function(item) {
    const calculatedDue = Math.round((item.gross - item.discount - item.paid) * 100) / 100;
    if (Math.abs(calculatedDue - item.due) > 0.01) {
      throw new Error(item.name + " billing does not reconcile in the Summary sheet.");
    }
  });

  const status = String(row[16] || "").trim() || (totals.due > 0 ? "Due" : totals.due < 0 ? "Credit" : "Full Paid");

  return {
    success: true,
    data: {
      fileId: fileId,
      clientName: String(row[1] || "").trim(),
      contact: String(row[2] || "").trim(),
      status: status,
      categories: categories,
      totals: {
        gross: totals.gross,
        discount: totals.discount,
        paid: totals.paid,
        due: summaryTotalDue
      },
      updatedAt: new Date().toISOString()
    }
  };
}
