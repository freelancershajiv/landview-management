from pathlib import Path

path = Path("Code.gs")
text = path.read_text(encoding="utf-8")

case_line = '    case "getFinanceSheet": return getFinanceSheet(params);\n'
case_new = case_line + '    case "getPublicBillingVerification": return getPublicBillingVerification(params);\n'
if 'case "getPublicBillingVerification"' not in text:
    if case_line not in text:
        raise SystemExit("Could not find getFinanceSheet router case")
    text = text.replace(case_line, case_new, 1)

public_old = '  "getPublicProjects"\n];'
public_new = '  "getPublicProjects",\n  "getPublicBillingVerification"\n];'
if '"getPublicBillingVerification"\n];' not in text:
    if public_old not in text:
        raise SystemExit("Could not find public action list")
    text = text.replace(public_old, public_new, 1)

marker = "/* LAND VIEW — UNIVERSAL LIVE PROJECT QR BACKEND V1 */"
if marker not in text:
    block = r'''

/* LAND VIEW — UNIVERSAL LIVE PROJECT QR BACKEND V1
 * Public to QR scanners only through the Vercel server. authorizeProxyRequest_()
 * still requires PROXY_SHARED_SECRET before this action can execute.
 * No phone/address/internal transaction IDs are returned.
 */
function publicBillingNumber_(value) {
  var text = String(value == null ? "" : value).trim();
  if (!text || text === "-" || text === "—") return 0;
  text = text.replace(/BDT|Tk\.?|৳|,/gi, "").replace(/\s/g, "");
  if (/^\(.*\)$/.test(text)) text = "-" + text.slice(1, -1);
  var number = Number(text);
  return isFinite(number) ? number : 0;
}

function publicBillingProjectId_(value) {
  var raw = String(value || "").trim().toUpperCase();
  var digits = raw.replace(/\D/g, "");
  return digits ? "LV-" + Number(digits) : "";
}

function publicBillingRows_(ss, sheetName, width) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var columns = Math.min(Math.max(width || 1, 1), Math.max(sheet.getLastColumn(), 1));
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).getDisplayValues();
}

function publicBillingRowsForProject_(ss, sheetName, width, projectId) {
  var id = publicBillingProjectId_(projectId);
  return publicBillingRows_(ss, sheetName, width).filter(function(row) {
    return publicBillingProjectId_(row[0]) === id;
  });
}

function publicBillingDateValue_(value) {
  var text = String(value || "").trim();
  if (!text) return 0;
  var match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) {
    var year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return new Date(year, Number(match[2]) - 1, Number(match[1])).getTime();
  }
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function publicBillingLatestPaymentDate_(paymentRows) {
  var latest = 0;
  (paymentRows || []).forEach(function(row) {
    latest = Math.max(latest, publicBillingDateValue_(row[1]));
  });
  if (!latest) return "";
  return Utilities.formatDate(new Date(latest), Session.getScriptTimeZone() || "Asia/Dhaka", "yyyy-MM-dd");
}

function publicBillingCategory_(name, billRows, paymentRows, discount) {
  var gross = (billRows || []).reduce(function(sum, row) { return sum + publicBillingNumber_(row[4]); }, 0);
  var paid = (paymentRows || []).reduce(function(sum, row) { return sum + publicBillingNumber_(row[3]); }, 0);
  var safeDiscount = publicBillingNumber_(discount);
  var due = gross - safeDiscount - paid;
  return {
    name: name,
    gross: gross,
    discount: safeDiscount,
    paid: paid,
    due: due,
    hasData: (billRows || []).length > 0 || (paymentRows || []).length > 0 ||
      Math.abs(gross) > 0.009 || Math.abs(safeDiscount) > 0.009 || Math.abs(paid) > 0.009 || Math.abs(due) > 0.009
  };
}

function getPublicBillingVerification(params) {
  var projectId = publicBillingProjectId_(params && (params.fileId || params.projectId));
  if (!projectId) throw new Error("A valid project ID is required.");

  var ss = getFinanceWorkbook_();
  var fileRows = publicBillingRowsForProject_(ss, "File List", 8, projectId);
  var summaryRows = publicBillingRowsForProject_(ss, "Summary", 18, projectId);
  if (!fileRows.length && !summaryRows.length) throw new Error("Project billing record was not found.");

  var file = fileRows[0] || [];
  var summary = summaryRows[0] || [];
  var clientName = String(file[1] || summary[1] || projectId).trim();

  var designBills = publicBillingRowsForProject_(ss, "Design Bill", 6, projectId);
  var designPayments = publicBillingRowsForProject_(ss, "Design Deposit", 5, projectId);
  var supervisionBills = publicBillingRowsForProject_(ss, "Supervision Bill", 7, projectId);
  var supervisionPayments = publicBillingRowsForProject_(ss, "S Deposit", 5, projectId);
  var othersBills = publicBillingRowsForProject_(ss, "Others Bill", 6, projectId);
  var othersPayments = publicBillingRowsForProject_(ss, "Others Bill Deposit", 5, projectId);

  var engineering = publicBillingCategory_("Engineering", designBills, designPayments, summary[4]);
  var supervision = publicBillingCategory_("Supervision", supervisionBills, supervisionPayments, summary[8]);
  var others = publicBillingCategory_("Others", othersBills, othersPayments, summary[12]);

  var categories = [engineering, supervision, others].filter(function(category) {
    return category.hasData;
  }).map(function(category) {
    return { name: category.name, gross: category.gross, discount: category.discount, paid: category.paid, due: category.due };
  });

  var totals = categories.reduce(function(result, category) {
    result.gross += category.gross;
    result.discount += category.discount;
    result.paid += category.paid;
    result.due += category.due;
    return result;
  }, { gross: 0, discount: 0, paid: 0, due: 0 });

  var allPayments = designPayments.concat(supervisionPayments, othersPayments);
  var lastPaymentDate = publicBillingLatestPaymentDate_(allPayments);
  var status = totals.due > 0.009 ? "DUE" : totals.due < -0.009 ? "CREDIT" : "FULL PAID";

  return {
    success: true,
    data: {
      fileId: projectId,
      clientName: clientName,
      status: status,
      categories: categories,
      totals: totals,
      lastPaymentDate: lastPaymentDate,
      updatedAt: new Date().toISOString()
    }
  };
}
/* END LAND VIEW — UNIVERSAL LIVE PROJECT QR BACKEND V1 */
'''
    text = text.rstrip() + block + "\n"

path.write_text(text, encoding="utf-8")
