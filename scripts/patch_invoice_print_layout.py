from pathlib import Path

PAGE = Path("app/admin/finance/invoices/page.tsx")
CSS = Path("app/admin/finance/invoices/invoice.module.css")

page = PAGE.read_text(encoding="utf-8")

old_status = '''  const allPayments = result ? result.invoices.flatMap((category) => category.payments) : [];
  const verifiedPayments = allPayments.filter((payment) => payment.verification === "Verified").length;
  const invoiceVerification = allPayments.length > 0 && verifiedPayments === allPayments.length ? "Verified" : "Unverified";
'''
new_status = '''  const allPayments = result ? result.invoices.flatMap((category) => category.payments) : [];
  const verifiedPayments = allPayments.filter((payment) => payment.verification === "Verified").length;
  const unverifiedPayments = Math.max(0, allPayments.length - verifiedPayments);
  const invoiceVerification = allPayments.length === 0
    ? "Unverified"
    : verifiedPayments === allPayments.length
      ? "Verified"
      : verifiedPayments === 0
        ? "Unverified"
        : "Partially Verified";
'''
if old_status not in page:
    raise SystemExit("Could not find invoice verification status block")
page = page.replace(old_status, new_status, 1)

start = page.find('  const renderTable = (category: SheetInvoices["invoices"][number], type: "bill" | "deposit") => {')
end = page.find('\n\n  const PrintHeader', start)
if start < 0 or end < 0:
    raise SystemExit("Could not find renderTable block")
new_render = '''  const renderTable = (category: SheetInvoices["invoices"][number], type: "bill" | "deposit") => {
    if (type === "bill") {
      if (!category.items.length) return <p className={styles.empty}>No bill records.</p>;

      if (category.name === "Supervision") {
        return (
          <div className={styles.tableWrap}>
            <table className={styles.supervisionBillTable}>
              <thead><tr><th>SL.</th><th>Description</th><th>Amount</th></tr></thead>
              <tbody>{category.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.service||"—"}</td><td className={styles.moneyCell}>{money(item.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        );
      }

      return (
        <div className={styles.tableWrap}>
          <table className={styles.billTable}>
            <thead><tr><th>SL.</th><th>Description</th><th>Rate</th><th>Qty.</th><th>Amount</th></tr></thead>
            <tbody>{category.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.service||"—"}</td><td>{item.price||"—"}</td><td>{item.quantity||"—"}</td><td className={styles.moneyCell}>{money(item.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      );
    }

    if (!category.payments.length) return <p className={styles.empty}>No deposit records.</p>;
    return (
      <div className={styles.tableWrap}>
        <table className={styles.depositTable}>
          <thead><tr><th>SL.</th><th>Date</th><th>Details</th><th>Amount</th><th>Verification</th></tr></thead>
          <tbody>{category.payments.map((payment,index)=><tr key={index}>
            <td>{index+1}</td>
            <td className={styles.dateCell}>{payment.date||"—"}</td>
            <td className={styles.detailsCell}>{payment.details||"—"}</td>
            <td className={styles.moneyCell}>{money(payment.amount)}</td>
            <td className={styles.verificationCell}>
              <strong className={payment.verification === "Verified" ? styles.verificationVerified : styles.verificationUnverified}>{payment.verification||"Unverified"}</strong>
              {payment.incomeId&&<small className={styles.verificationRef}>Ref: {payment.incomeId}</small>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    );
  };'''
page = page[:start] + new_render + page[end:]

old_verification_row = '''        <div className={styles.sheetInfoRow}>
          <span>Verification</span><strong>{invoiceVerification}</strong>
          <span>Verified receipts</span><strong>{verifiedPayments}/{allPayments.length}</strong>
        </div>'''
new_verification_row = '''        <div className={styles.sheetInfoRow}>
          <span>Verification</span><strong className={invoiceVerification === "Verified" ? styles.statusVerified : invoiceVerification === "Partially Verified" ? styles.statusPartial : styles.statusUnverified}>{invoiceVerification}</strong>
          <span>Receipts verified</span><strong>{verifiedPayments}/{allPayments.length}{unverifiedPayments > 0 ? ` · ${unverifiedPayments} pending` : ""}</strong>
        </div>'''
if old_verification_row not in page:
    raise SystemExit("Could not find print verification row")
page = page.replace(old_verification_row, new_verification_row, 1)

PAGE.write_text(page, encoding="utf-8")

css = CSS.read_text(encoding="utf-8")
marker = "/* Invoice print-layout repair v2 */"
if marker not in css:
    css += r'''

/* Invoice print-layout repair v2 */
.billTable,.depositTable,.supervisionBillTable{table-layout:fixed}.moneyCell{white-space:nowrap!important;font-variant-numeric:tabular-nums;text-align:right!important}.dateCell{white-space:nowrap}.detailsCell{overflow-wrap:break-word}.verificationCell{text-align:center!important;vertical-align:middle}.verificationVerified,.verificationUnverified{display:block;font-weight:800;white-space:nowrap}.verificationVerified{color:#65c982}.verificationUnverified{color:#ff9188}.verificationRef{display:block;margin-top:3px;font-size:9px;line-height:1.2;color:#91a0aa;white-space:nowrap}.statusVerified{color:#17763d!important}.statusPartial{color:#a76700!important}.statusUnverified{color:#b42318!important}

@media print{
  :global(html),:global(body),.printSheets,.printPage,.printPage *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .sheetMain table{table-layout:fixed!important}
  .sheetMain .billTable th:first-child,.sheetMain .billTable td:first-child{width:8%!important}
  .sheetMain .billTable th:nth-child(2),.sheetMain .billTable td:nth-child(2){width:48%!important;text-align:left!important}
  .sheetMain .billTable th:nth-child(3),.sheetMain .billTable td:nth-child(3){width:17%!important;text-align:right!important;white-space:nowrap!important}
  .sheetMain .billTable th:nth-child(4),.sheetMain .billTable td:nth-child(4){width:10%!important;text-align:center!important;white-space:nowrap!important}
  .sheetMain .billTable th:nth-child(5),.sheetMain .billTable td:nth-child(5){width:17%!important;text-align:right!important;white-space:nowrap!important}

  .sheetMain .supervisionBillTable th:first-child,.sheetMain .supervisionBillTable td:first-child{width:8%!important;text-align:center!important}
  .sheetMain .supervisionBillTable th:nth-child(2),.sheetMain .supervisionBillTable td:nth-child(2){width:70%!important;text-align:left!important}
  .sheetMain .supervisionBillTable th:nth-child(3),.sheetMain .supervisionBillTable td:nth-child(3){width:22%!important;text-align:right!important;white-space:nowrap!important}

  .sheetMain .depositTable th:first-child,.sheetMain .depositTable td:first-child{width:8%!important;text-align:center!important}
  .sheetMain .depositTable th:nth-child(2),.sheetMain .depositTable td:nth-child(2){width:15%!important;text-align:left!important;white-space:nowrap!important}
  .sheetMain .depositTable th:nth-child(3),.sheetMain .depositTable td:nth-child(3){width:39%!important;text-align:left!important;overflow-wrap:break-word!important}
  .sheetMain .depositTable th:nth-child(4),.sheetMain .depositTable td:nth-child(4){width:18%!important;text-align:right!important;white-space:nowrap!important}
  .sheetMain .depositTable th:nth-child(5),.sheetMain .depositTable td:nth-child(5){width:20%!important;text-align:center!important;white-space:normal!important}
  .sheetMain .depositTable td{padding-top:1.45mm!important;padding-bottom:1.45mm!important}
  .verificationCell{padding-left:1mm!important;padding-right:1mm!important;text-align:center!important}
  .verificationVerified{color:#18743b!important;font-size:7.2pt!important}
  .verificationUnverified{color:#b42318!important;font-size:7.2pt!important}
  .verificationRef{color:#666!important;font-size:6.1pt!important;margin-top:.7mm!important;white-space:nowrap!important}
  .moneyCell{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important}
  .dateCell{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important}
  .statusVerified{color:#17763d!important}
  .statusPartial{color:#a76700!important}
  .statusUnverified{color:#b42318!important}
  .sheetInfoRow strong{overflow-wrap:break-word!important;word-break:normal!important}
}
'''
CSS.write_text(css, encoding="utf-8")

print("Invoice print/PDF layout and verification UI patched")
