const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(file, "utf8");
const exportCode = read("lib/billing-pdf-v4.ts");
const financePage = read("app/admin/finance/invoices/page.tsx");
const printDocument = read("components/project-billing-document.tsx");
const printCss = read("app/admin/finance/invoices/invoice-revamp-print-fix.css");
const receipt = read("components/receipt-print-actions.tsx");
const receiptPrint = read("app/api/billing/receipt-print/route.ts");

function pdfWriter() {
  const from = exportCode.indexOf("function jpegDimensions(");
  const to = exportCode.indexOf("export async function downloadBillingPdfV4(", from);
  assert.ok(from >= 0 && to > from);
  const snippet = exportCode.slice(from, to);
  const compiled = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, Uint8Array, TextEncoder, Blob, Error, String, Number,
  });
  return module.exports.createA4Pdf;
}

// Valid baseline 1x1 JPEG for exercising native PDF stream and cross-reference output.
const jpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==", "base64");

test("V4 writes a structurally paginated A4 PDF without a new dependency", async () => {
  const makePdf = pdfWriter();
  const pdf = makePdf([jpeg, jpeg]);
  assert.equal(pdf.type, "application/pdf");
  const data = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
  assert.match(data, /^%PDF-1\.4/);
  assert.match(data, /\/Count 2\b/);
  assert.match(data, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.equal((data.match(/\/Type \/Page\b/g) || []).length, 2);
  assert.match(data, /startxref\n\d+\n%%EOF/);
  const offset = Number(data.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(data.slice(offset, offset + 4), "xref");
});

test("V4 invoice export uses one measured print collection and preserves financial source", () => {
  assert.match(exportCode, /function paginate\(/);
  assert.match(exportCode, /function fits\(/);
  assert.match(exportCode, /cloneNode\(true\)/);
  assert.match(exportCode, /Page " \+ \(index \+ 1\) \+ " of "/);
  assert.match(exportCode, /getScopedPrintCss\(HOST\)/);
  assert.doesNotMatch(exportCode, /insertRows|updateRows|deleteRows|fetch\("\/api\/billing\/write/);
  assert.match(printDocument, /prepareBillingV4\(result\)/);
  assert.match(printCss, /body:has\(\[data-lv-v4-print\]\)/);
  assert.match(financePage, /A4 Preview/);
  assert.match(financePage, /Download PDF/);
});

test("V4 verified receipts reuse the issued read-only token validation", () => {
  assert.match(receipt, /downloadReceiptPdfV4\(receiptToken\)/);
  assert.match(receipt, /A4 Preview/);
  assert.match(receiptPrint, /verification_token: token/);
  assert.match(receiptPrint, /receipt\.voided_at/);
  assert.match(receiptPrint, /text\(payment\.receipt_url\) !== path/);
  assert.match(read("lib/receipt-pdf-v4.ts"), /receipt-print\?token=/);
  assert.doesNotMatch(read("lib/receipt-pdf-v4.ts"), /insertRows|updateRows|deleteRows/);
});
