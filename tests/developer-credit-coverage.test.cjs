const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const source = (path) => readFileSync(join(__dirname, "..", path), "utf8");

test("sitewide layout and management workspace show the developer credit", () => {
  assert.match(source("lib/developer-credit.ts"), /Developed by Arch Md Shajiv Ahammad/);
  assert.match(source("components/developer-credit-footer.tsx"), /DEVELOPER_CREDIT/);
  assert.match(source("app/layout.tsx"), /<DeveloperCreditFooter \/>/);
  assert.match(source("components/management-shell-v5.tsx"), /<DeveloperCreditFooter \/>/);
});
test("primary A4 print templates use the shared credit", () => {
  const printable = [
    "components/project-billing-document-revamp.tsx",
    "components/project-billing-document.tsx",
    "lib/project-statement-document-v43.ts",
    "app/api/billing/receipt-print/route.ts",
    "app/api/billing/reports-v44/print/route.ts",
    "components/certificate-document.tsx",
    "app/projectmanagement/report/page.tsx",
    "app/admin/accounts/export/page.tsx",
    "components/summary-estimate-workspace.tsx",
  ];
  for (const path of printable) assert.match(source(path), /DEVELOPER_CREDIT/, path);
  assert.match(source("app/developer-credit.css"), /@media print/);
});
