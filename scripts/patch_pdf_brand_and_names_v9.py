from pathlib import Path
import re

invoice_page = Path('app/admin/finance/invoices/page.tsx')
invoice_css = Path('app/admin/finance/invoices/invoice.module.css')
accounts_page = Path('app/admin/accounts/page.tsx')

# -----------------------------------------------------------------------------
# Project invoice: dynamic Save-as-PDF filename
# -----------------------------------------------------------------------------
text = invoice_page.read_text()

helper = r'''
function safePdfTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "LAND-VIEW-Project-Billing-Statement";
}
'''
if 'function safePdfTitle(' not in text:
    anchor = 'async function loadFinanceTabs() {'
    text = text.replace(anchor, helper + '\n' + anchor, 1)

print_fn = r'''
  function printInvoice() {
    if (!result) return;
    const displayProjectName = result.client.name || result.id || "Project";
    const pdfTitle = safePdfTitle(`${result.id}-${displayProjectName}-Billing-Statement`);
    const previousTitle = document.title;
    let restored = false;
    const restoreTitle = () => {
      if (restored) return;
      restored = true;
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    document.title = pdfTitle;
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
    window.setTimeout(restoreTitle, 60000);
  }

'''
if 'function printInvoice()' not in text:
    text = text.replace('  const renderTable = (category:', print_fn + '  const renderTable = (category:', 1)

text = text.replace('onClick={() => window.print()}>Print / Save PDF</button>', 'onClick={printInvoice}>Print / Save PDF</button>')
invoice_page.write_text(text)

# -----------------------------------------------------------------------------
# Project invoice: hard red/black/white overrides after all legacy rules
# -----------------------------------------------------------------------------
css = invoice_css.read_text()
marker = '/* LAND VIEW invoice red/black hard override v9 */'
if marker not in css:
    css += r'''

/* LAND VIEW invoice red/black hard override v9 */
.workspace{--inv-red:#e12b31;--inv-red-dark:#b8171f;--inv-black:#0b0d0f;--inv-panel:#11161a;--inv-panel-2:#171d22;--inv-border:#343b40;--inv-text:#f3f5f6;--inv-muted:#9aa3a9;color:var(--inv-text)!important}
.header a,.verificationLabel,.verificationBlock a,.formula strong,.totalDueCard strong,.metrics>div:last-child strong{color:#ff5359!important}
.printButton,.lookup button{background:linear-gradient(180deg,#ef343b,#c91e26)!important;color:#fff!important;border:1px solid #f14a50!important;box-shadow:0 8px 22px rgba(225,43,49,.18)!important}
.printButton:hover,.lookup button:hover:not(:disabled){background:linear-gradient(180deg,#f54047,#d5222a)!important}
.lookup,.category,.verificationBlock{background:linear-gradient(145deg,#14191d,#0d1114)!important;border-color:#343b40!important}
.lookup input{background:#090c0e!important;border-color:#41484d!important;color:#fff!important}
.projectCard>div{background:linear-gradient(145deg,#171c20,#0d1013)!important;border-color:#343b40!important}
.totalDueCard{border-top-color:#e12b31!important}
.categoryHeader,.metrics,.formula{border-color:#30363b!important}
.tableWrap{border-color:#353c41!important}
.tableWrap th{background:#24292d!important;color:#fff!important;border-bottom:2px solid #e12b31!important}
.tableWrap td{border-top-color:#2d3338!important;color:#edf0f2!important}
.formula{background:#090c0e!important}
.grandSummary{background:#0b0e10!important;border-color:#343b40!important}
.grandSummary>div{border-color:#343b40!important}
.grandDue{background:linear-gradient(145deg,#e12b31,#b8171f)!important}
.grandDue span,.grandDue strong{color:#fff!important}
.qrCode{box-shadow:0 0 0 1px rgba(225,43,49,.55)!important}

@media print{
  .printPage{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .sheetHeader{border-bottom-color:#e12b31!important}
  .sheetBrandWords>strong{color:#15171a!important}
  .sheetBrandWords>strong span,.sheetTitle strong,.sheetMain h2 span,.sheetQr>div:last-child strong{color:#e12b31!important}
  .sheetTitle b{border-top-color:#e12b31!important}
  .sheetInfoBoard{border-color:#e12b31!important}
  .sheetMetaPair span,.sheetPanelTitles strong,.sheetInfoRow span{background:#232629!important;color:#fff!important}
  .sheetMetaPair span,.sheetMetaPair strong,.sheetPanelTitles strong,.sheetInfoRow span,.sheetInfoRow strong{border-color:#e12b31!important}
  .sheetPanelTitles strong:first-child{border-right-color:#e12b31!important}
  .sheetMain th{background:#25282b!important;color:#fff!important;border-bottom:.55mm solid #e12b31!important}
  .sheetMain td{background:#fff!important;color:#111!important;border-color:#cfd3d6!important}
  .sheetSummary{border-color:#e0b7b9!important}
  .sheetSummary h3{background:#fff2f2!important;color:#c91e26!important;border-bottom-color:#e9c5c7!important}
  .sheetDue,.sheetGrandDue{background:#e12b31!important;color:#fff!important}
  .sheetDue span,.sheetDue strong,.sheetGrandDue span,.sheetGrandDue strong{color:#fff!important}
  .sheetFooter{border-top-color:#e12b31!important}
  .sheetQr{border-color:#e12b31!important}
}
'''
invoice_css.write_text(css)

# -----------------------------------------------------------------------------
# Accounts PDF: replace plain-text renderer with a branded red/black table PDF.
# -----------------------------------------------------------------------------
accounts = accounts_page.read_text()
new_builder = r'''function buildPdf(title: string, rows: LedgerRow[], summary: MoneySummary, filterText: string) {
  const RED = "0.882 0.169 0.192";
  const RED_DARK = "0.710 0.090 0.122";
  const BLACK = "0.090 0.098 0.106";
  const DARK = "0.145 0.157 0.169";
  const MID = "0.360 0.390 0.410";
  const LIGHT = "0.965 0.968 0.970";
  const BORDER = "0.820 0.830 0.840";
  const WHITE = "1 1 1";

  const pdfText = (value: unknown, max = 120) => pdfEscape(clip(ascii(value), max));
  const textCmd = (x: number, y: number, font: "F1" | "F2", size: number, color: string, value: unknown, max = 120) =>
    `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${pdfText(value, max)}) Tj ET\n`;
  const fillRect = (x: number, y: number, w: number, h: number, color: string) => `${color} rg ${x} ${y} ${w} ${h} re f\n`;
  const strokeRect = (x: number, y: number, w: number, h: number, color: string, width = 0.6) => `${color} RG ${width} w ${x} ${y} ${w} ${h} re S\n`;
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, width = 0.8) => `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
  const moneyText = (value: number) => `BDT ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const firstPageCount = 17;
  const laterPageCount = 21;
  const pages: LedgerRow[][] = [];
  pages.push(rows.slice(0, firstPageCount));
  for (let i = firstPageCount; i < rows.length; i += laterPageCount) pages.push(rows.slice(i, i + laterPageCount));
  if (!rows.length) pages[0] = [];

  const objects: string[] = [""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const pageIds: number[] = [];

  pages.forEach((pageRows, pageIndex) => {
    const pageId = 5 + pageIndex * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    let stream = "";

    // Header / brand
    stream += textCmd(42, 804, "F2", 19, BLACK, "LAND", 20);
    stream += textCmd(101, 804, "F2", 19, RED, "VIEW", 20);
    stream += textCmd(42, 788, "F2", 7.5, DARK, "ENGINEERS & ARCHITECTS", 40);
    stream += textCmd(553, 806, "F1", 7, MID, `Page ${pageIndex + 1} of ${pages.length}`, 30);
    stream += line(42, 777, 553, 777, RED, 2.2);
    stream += textCmd(42, 754, "F2", 14, BLACK, title, 78);
    if (pageIndex === 0) {
      stream += textCmd(42, 738, "F1", 7.3, MID, `Generated: ${new Date().toLocaleString("en-GB")}`, 70);
      if (filterText) stream += textCmd(300, 738, "F1", 7.3, MID, `Filters: ${filterText}`, 68);

      const cards = [
        ["INCOME", moneyText(summary.income)],
        ["APPROVED EXPENSE", moneyText(summary.expense)],
        ["PENDING", moneyText(summary.pending)],
        ["NET", moneyText(summary.net)],
      ];
      cards.forEach(([label, value], index) => {
        const x = 42 + index * 128;
        const bg = index === 3 ? RED : LIGHT;
        const labelColor = index === 3 ? WHITE : MID;
        const valueColor = index === 3 ? WHITE : BLACK;
        stream += fillRect(x, 684, 119, 43, bg);
        stream += strokeRect(x, 684, 119, 43, index === 3 ? RED_DARK : BORDER, 0.7);
        stream += textCmd(x + 8, 712, "F2", 6.3, labelColor, label, 24);
        stream += textCmd(x + 8, 694, "F2", 9.2, valueColor, value, 24);
      });
      stream += textCmd(42, 671, "F1", 7.2, MID, `Transactions: ${rows.length}`, 35);
    }

    const headerY = pageIndex === 0 ? 644 : 724;
    stream += fillRect(42, headerY, 511, 22, DARK);
    stream += line(42, headerY, 553, headerY, RED, 1.4);
    const cols = [
      [48, "DATE"], [120, "TYPE"], [172, "FILE"], [223, "CATEGORY"], [420, "AMOUNT"], [505, "STATUS"],
    ] as const;
    cols.forEach(([x, label]) => { stream += textCmd(x, headerY + 8, "F2", 6.5, WHITE, label, 28); });

    let y = headerY - 23;
    if (!pageRows.length) {
      stream += textCmd(48, y, "F1", 9, MID, "No matching transactions.", 80);
    }

    pageRows.forEach((row, index) => {
      if (index % 2 === 1) stream += fillRect(42, y - 12, 511, 27, LIGHT);
      stream += line(42, y - 13, 553, y - 13, BORDER, 0.35);
      const typeColor = row.type === "Income" ? "0.125 0.435 0.250" : RED_DARK;
      stream += textCmd(48, y, "F1", 7.1, BLACK, displayDate(row.date), 15);
      stream += textCmd(120, y, "F2", 6.8, typeColor, row.type.toUpperCase(), 10);
      stream += textCmd(172, y, "F1", 7.0, BLACK, row.fileId || "-", 12);
      stream += textCmd(223, y, "F1", 7.0, BLACK, row.category, 31);
      stream += textCmd(420, y, "F2", 7.0, BLACK, moneyText(row.amount), 18);
      stream += textCmd(505, y, "F1", 6.7, BLACK, row.status, 12);
      const detail = `${row.description}${row.type === "Expense" && row.paidTo ? ` | Paid to: ${row.paidTo}` : ""}${row.type === "Income" && row.receivedFrom ? ` | From: ${row.receivedFrom}` : ""}`;
      stream += textCmd(48, y - 11, "F1", 6.5, MID, detail, 104);
      y -= 28;
    });

    stream += line(42, 34, 553, 34, RED, 1.1);
    stream += textCmd(42, 20, "F2", 6.8, BLACK, "LAND VIEW", 25);
    stream += textCmd(101, 20, "F1", 6.5, MID, "Building a safer tomorrow", 45);
    stream += textCmd(475, 20, "F1", 6.5, MID, `Page ${pageIndex + 1} / ${pages.length}`, 25);

    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });

  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = new TextEncoder().encode(pdf).length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}'''

pattern = re.compile(r'function buildPdf\(title: string, rows: LedgerRow\[\], summary: MoneySummary, filterText: string\) \{.*?\n\}\n\nexport default function AccountsLedgerPage', re.S)
if not pattern.search(accounts):
    raise SystemExit('Could not locate buildPdf in accounts page')
accounts = pattern.sub(new_builder + '\n\nexport default function AccountsLedgerPage', accounts, count=1)
accounts_page.write_text(accounts)

print('Patched invoice filename, invoice red theme, and branded accounts PDF export.')
