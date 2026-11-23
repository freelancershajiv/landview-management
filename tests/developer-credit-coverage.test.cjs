const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const source = (path) => readFileSync(join(__dirname, "..", path), "utf8");

test("developer attribution links to one public professional profile", () => {
  const shared = source("lib/developer-credit.ts");
  assert.match(shared, /DEVELOPER_NAME = "Arch Md Shajiv Ahammad"/);
  assert.match(shared, /DEVELOPER_PROFILE_PATH = "\/team\/md-shajiv-ahammad"/);
  assert.match(shared, /DEVELOPER_CREDIT_HTML/);
  assert.match(source("components/developer-credit-link.tsx"), /href=\{DEVELOPER_PROFILE_PATH\}/);
  assert.match(source("components/developer-credit-footer.tsx"), /<DeveloperCreditLink \/>/);
  assert.match(source("app/layout.tsx"), /<DeveloperCreditFooter \/>/);
  assert.match(source("components/management-shell-v5.tsx"), /<DeveloperCreditFooter \/>/);
  assert.match(source("app/sitemap.ts"), /DEVELOPER_PROFILE_PATH/);
});
test("public profile uses only the published team record for photo and credentials", () => {
  const page = source("app/team/md-shajiv-ahammad/page.tsx");
  assert.match(page, /getPublicTeamForSeo/);
  assert.match(page, /normalizePublicTeamImageUrl/);
  assert.match(page, /type: "profile"/);
  assert.match(page, /"@type": "Person"/);
  assert.match(page, /\/contact/);
  assert.doesNotMatch(page, /birthDate|personal mobile|home address/i);
});
test("primary A4 print templates have linked attribution and readable fallback URL", () => {
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
  for (const path of printable) assert.match(source(path), /DeveloperCreditLink|DEVELOPER_CREDIT_HTML/, path);
  assert.match(source("components/developer-credit-link.tsx"), /DEVELOPER_PROFILE_PRINT_URL/);
  assert.match(source("app/developer-credit.css"), /@media print/);
});
