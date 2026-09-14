from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Could not find patch target: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Apps Script finance source: attach accounting reconciliation to deposit rows.
# ---------------------------------------------------------------------------
finance_path = Path("FinanceSheet.gs")
finance = finance_path.read_text(encoding="utf-8")

anchor = '''function getFinanceWorkbook_() {
  return SpreadsheetApp.openById(FINANCE_WORKBOOK_ID_);
}
'''
helpers = '''function getFinanceWorkbook_() {
  return SpreadsheetApp.openById(FINANCE_WORKBOOK_ID_);
}

function financeDepositVerificationSource_(tab) {
  if (tab === "Design Deposit") return "Design Deposit";
  if (tab === "S Deposit") return "S Deposit";
  if (tab === "Others Bill Deposit") return "Others Bill Deposit";
  return "";
}

function financeDepositVerificationMap_(tab) {
  var sourceName = financeDepositVerificationSource_(tab);
  var result = {};
  if (!sourceName) return result;

  try {
    var ledger = getLandViewFinanceLedger_();
    var sheet = ledger.getSheetByName("Auto Invoice Reconciliation");
    if (!sheet || sheet.getLastRow() < 2) return result;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function(value) {
      return String(value || "").trim();
    });
    var sourceSheetIndex = headers.indexOf("Source_Sheet");
    var sourceRowIndex = headers.indexOf("Source_Row");
    var incomeIdIndex = headers.indexOf("Matched_Income_ID");
    var matchStatusIndex = headers.indexOf("Match_Status");
    var manualIndex = headers.indexOf("Manual_Verification");
    if (sourceSheetIndex < 0 || sourceRowIndex < 0 || matchStatusIndex < 0) return result;

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
    rows.forEach(function(row) {
      if (String(row[sourceSheetIndex] || "").trim() !== sourceName) return;
      var sourceRow = Number(row[sourceRowIndex] || 0);
      if (!sourceRow) return;

      var incomeId = incomeIdIndex >= 0 ? String(row[incomeIdIndex] || "").trim() : "";
      var matchStatus = String(row[matchStatusIndex] || "").trim().toUpperCase();
      var manual = manualIndex >= 0 ? String(row[manualIndex] || "").trim().toLowerCase() : "";
      var verified = manual === "verified" || (manual !== "unverified" && matchStatus === "MATCHED_EXACT" && !!incomeId);

      result[sourceRow] = {
        verified: verified,
        incomeId: incomeId,
        matchStatus: matchStatus,
        manual: manual
      };
    });
  } catch (error) {
    console.log("Invoice verification lookup unavailable: " + (error && error.message ? error.message : error));
  }

  return result;
}
'''
finance = replace_once(finance, anchor, helpers, "Finance verification helpers")

old_rows = '''  let headers = tab === "Invoice" ? Array.from({ length: readWidth }, function(_, i) { return String.fromCharCode(65 + i); }) : grid[0];
  let rows = (tab === "Invoice" ? grid : grid.slice(1)).filter(function(row) {
    if (tab === "Invoice") return row.some(hasValue);
    if (tab === "Summary") return !!populatedIds[String(row[0])];
    if (tab === "File List") return hasValue(row[0]);
    if (tab === "Workflow") return hasValue(row[0]) || hasValue(row[1]);
    return row.slice(2).some(hasValue);
  });
'''
new_rows = '''  let headers = tab === "Invoice" ? Array.from({ length: readWidth }, function(_, i) { return String.fromCharCode(65 + i); }) : grid[0];
  const sourceRowNumbers = [];
  const sourceRows = tab === "Invoice" ? grid : grid.slice(1);
  let rows = sourceRows.filter(function(row, index) {
    var keep = false;
    if (tab === "Invoice") keep = row.some(hasValue);
    else if (tab === "Summary") keep = !!populatedIds[String(row[0])];
    else if (tab === "File List") keep = hasValue(row[0]);
    else if (tab === "Workflow") keep = hasValue(row[0]) || hasValue(row[1]);
    else keep = row.slice(2).some(hasValue);
    if (keep) sourceRowNumbers.push(tab === "Invoice" ? index + 1 : index + 2);
    return keep;
  });
'''
finance = replace_once(finance, old_rows, new_rows, "Finance source-row tracking")

old_omit = '''  if (tab !== "Summary" && !["Invoice", "File List", "Workflow"].includes(tab)) {
    const omit = 1;
    headers = headers.filter(function(_, i) { return i !== omit; });
    rows = rows.map(function(row) { return row.filter(function(_, i) { return i !== omit; }); });
  }

  return {
'''
new_omit = '''  if (tab !== "Summary" && !["Invoice", "File List", "Workflow"].includes(tab)) {
    const omit = 1;
    headers = headers.filter(function(_, i) { return i !== omit; });
    rows = rows.map(function(row) { return row.filter(function(_, i) { return i !== omit; }); });
  }

  if (financeDepositVerificationSource_(tab)) {
    const verificationMap = financeDepositVerificationMap_(tab);
    headers = headers.concat(["Verification", "Linked Income ID"]);
    rows = rows.map(function(row, index) {
      const verification = verificationMap[sourceRowNumbers[index]] || null;
      return row.concat([
        verification && verification.verified ? "Verified" : "Unverified",
        verification && verification.incomeId ? verification.incomeId : ""
      ]);
    });
  }

  return {
'''
finance = replace_once(finance, old_omit, new_omit, "Finance verification columns")
finance_path.write_text(finance, encoding="utf-8")


# ---------------------------------------------------------------------------
# Typed invoice builder: retain verification fields returned by Apps Script.
# ---------------------------------------------------------------------------
sheet_path = Path("lib/sheet-invoices.ts")
sheet = sheet_path.read_text(encoding="utf-8")
old_payment = '''    const payments = matching(category.deposit).map((row) => ({
      date: row[1],
      details: row[2],
      amount: sheetAmount(row[3]),
    }));
'''
new_payment = '''    const payments = matching(category.deposit).map((row) => ({
      date: row[1],
      details: row[2],
      amount: sheetAmount(row[3]),
      verification: row[4] === "Verified" ? "Verified" : "Unverified",
      incomeId: String(row[5] || "").trim(),
    }));
'''
sheet = replace_once(sheet, old_payment, new_payment, "Invoice payment verification fields")
sheet_path.write_text(sheet, encoding="utf-8")


# ---------------------------------------------------------------------------
# Invoice UI/print: show a safe fallback of Unverified for every unlinked row.
# ---------------------------------------------------------------------------
page_path = Path("app/admin/finance/invoices/page.tsx")
page = page_path.read_text(encoding="utf-8")

old_status = '''  const statementRef = result ? `INV-${result.id.replace(/^LV-/, "")}-01` : "";
  const projectStatus = result ? (result.totals.due > 0 ? "Partial / Due" : "Full Paid") : "—";
'''
new_status = '''  const statementRef = result ? `INV-${result.id.replace(/^LV-/, "")}-01` : "";
  const projectStatus = result ? (result.totals.due > 0 ? "Partial / Due" : "Full Paid") : "—";
  const allPayments = result ? result.invoices.flatMap((category) => category.payments) : [];
  const verifiedPayments = allPayments.filter((payment) => payment.verification === "Verified").length;
  const invoiceVerification = allPayments.length > 0 && verifiedPayments === allPayments.length ? "Verified" : "Unverified";
'''
page = replace_once(page, old_status, new_status, "Invoice verification summary")

old_render = '''    if (!category.payments.length) return <p className={styles.empty}>No deposit records.</p>;
    return <div className={styles.tableWrap}><table><thead><tr><th>SL.</th><th>Date</th><th>Details</th><th>Amount</th></tr></thead><tbody>{category.payments.map((payment,index)=><tr key={index}><td>{index+1}</td><td>{payment.date||"—"}</td><td>{payment.details||"—"}</td><td>{money(payment.amount)}</td></tr>)}</tbody></table></div>;
'''
new_render = '''    if (!category.payments.length) return <p className={styles.empty}>No deposit records.</p>;
    return <div className={styles.tableWrap}><table><thead><tr><th>SL.</th><th>Date</th><th>Details</th><th>Amount</th><th>Verification</th></tr></thead><tbody>{category.payments.map((payment,index)=><tr key={index}><td>{index+1}</td><td>{payment.date||"—"}</td><td>{payment.details||"—"}</td><td>{money(payment.amount)}</td><td><strong style={{color:payment.verification==="Verified"?"#9be0b1":"#ff9b91"}}>{payment.verification||"Unverified"}</strong>{payment.incomeId&&<small style={{display:"block",opacity:.7,marginTop:3}}>{payment.incomeId}</small>}</td></tr>)}</tbody></table></div>;
'''
page = replace_once(page, old_render, new_render, "Deposit verification table")

old_info = '''        <div className={styles.sheetInfoRow}>
          <span>Contact</span><strong>{result?.client.phone || "—"}</strong>
          <span>Status</span><strong>{projectStatus}</strong>
        </div>
      </section>
'''
new_info = '''        <div className={styles.sheetInfoRow}>
          <span>Contact</span><strong>{result?.client.phone || "—"}</strong>
          <span>Status</span><strong>{projectStatus}</strong>
        </div>
        <div className={styles.sheetInfoRow}>
          <span>Verification</span><strong>{invoiceVerification}</strong>
          <span>Verified receipts</span><strong>{verifiedPayments}/{allPayments.length}</strong>
        </div>
      </section>
'''
page = replace_once(page, old_info, new_info, "Printed invoice verification summary")
page_path.write_text(page, encoding="utf-8")

print("Invoice verification patch applied")
