const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

const role = read("components/role-portal-shell.tsx");
const employee = read("components/employee-portal-shell.tsx");
const client = read("app/client/page.tsx");
const clientCss = read("app/client/client.module.css");

test("Employee header page search is controlled and opens actual workspace sections", () => {
  assert.match(role, /const \[employeeSearch, setEmployeeSearch\] = useState\(""\)/);
  assert.match(role, /employeeSearchResults = employeeSearch\.trim\(\)/);
  assert.match(role, /value=\{employeeSearch\}/);
  assert.match(role, /onChange=\{e=>setEmployeeSearch\(e\.target\.value\)\}/);
  assert.match(role, /e\.key==="Enter"&&employeeSearchResults\[0\]/);
  assert.match(role, /goEmployeeSection\(employeeSearchResults\[0\]\.href\.split\("#"\)\[1\]\)/);
  assert.match(role, /Matching workspace pages/);
  assert.match(role, /No matching workspace page/);
  assert.match(role, /href: "\/employee#records", label: "Field & Files"/);
  assert.doesNotMatch(role, /employee-search" role="search"><span aria-hidden="true">⌕<\/span><input aria-label="Search employee workspace" placeholder="Search\.\.\." \/><\/div>/);
});

test("Mobile client drawer is not keyboard-accessible while visually closed", () => {
  assert.match(role, /\.lv-client-side\{position:fixed;left:0;top:0;width:min\(300px,88vw\);transform:translateX\(-105%\);visibility:hidden;pointer-events:none/);
  assert.match(role, /\.lv-client-side\.open\{transform:translateX\(0\);visibility:visible;pointer-events:auto/);
  assert.match(role, /id="client-portal-navigation"/);
  assert.match(role, /aria-controls="client-portal-navigation" aria-expanded=\{mobileOpen\}/);
  assert.match(role, /aria-controls="employee-portal-navigation" aria-expanded=\{mobileOpen\}/);
  assert.match(role, /querySelector<HTMLButtonElement>\("\.lv-client-menu, \.portal-employee \.employee-menu"\)\?\.focus\(\)/);
});

test("Client navigation preserves external link rather than treating last character as a hash", () => {
  assert.match(role, /const hash=item\.href\.includes\("#"\)\?item\.href\.slice\(item\.href\.indexOf\("#"\)\):""/);
  assert.match(role, /if\(hash\)setActiveHash\(hash\)/);
  assert.doesNotMatch(role, /setActiveHash\(item\.href\.slice\(item\.href\.indexOf\("#"\)\)\)/);
  assert.match(role, /href: "\/projectmanagement", label: "Project Management"/);
});

test("Client project overview appears before optional finance and Site Visit calls complete", () => {
  const show = client.indexOf("setWorkspace(json.data as Workspace)");
  const ready = client.indexOf("setLoading(false);", show);
  const selected = client.indexOf("const selectedDetails = detail.projectId === projectId");
  assert.ok(show >= 0 && ready > show && selected > ready);
  assert.match(client, /read<Row\[\]>\(`\/api\/site-visits\?projectId=\$\{code\}`/);
  assert.match(client, /read<ConstructionFinance>\(`\/api\/project-management\?projectId=\$\{code\}`/);
  assert.match(client, /return \(\) => controller.abort\(\)/);
});

test("Client financial and visit tables remain available with keyboard scrolling", () => {
  assert.equal((client.match(/className=\{styles\.tableHint\}/g)||[]).length, 3);
  assert.equal((client.match(/role="region" aria-label="[^"]+" tabIndex=\{0\}><table>/g)||[]).length, 3);
  assert.match(clientCss, /\.tableWrap:focus-visible\{outline:3px solid/);
  assert.match(clientCss, /\.tableHint\{display:block/);
  assert.match(clientCss, /\.overviewGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(clientCss, /\.financeUpdateStats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("Employee forms remain readable and keyboard-focusable on small screens", () => {
  assert.match(employee, /\.employee-workspace-body input,\.employee-workspace-body select,\.employee-workspace-body textarea\{min-height:44px;font-size:16px!important/);
  assert.match(employee, /\.employee-workspace-body :is\(button,a\):focus-visible/);
  assert.match(role, /@media\(max-width:360px\)\{\.portal-employee \.employee-search\{display:flex/);
  assert.match(role, /@media\(max-width:900px\)\{\.portal-employee \.employee-search input\{font-size:16px!important/);
});

test("Client mobile avoids large decorative photography and honors reduced motion", () => {
  assert.match(clientCss, /V5\.5 client mobile readability \+ reduced data use/);
  assert.match(clientCss, /\.hero\{background-image:linear-gradient\(/);
  assert.match(clientCss, /\.projectVisual\{background-image:linear-gradient\(/);
  assert.match(clientCss, /@media \(prefers-reduced-motion:reduce\)\{\s*\.skeleton span\{animation:none\}/);
});

test("Previously failing Site Visit offline test restores the online state", () => {
  const siteVisitTests = read("tests/site-visit-mobile-v54.test.cjs");
  const reset = siteVisitTests.indexOf("helper.sandbox.navigator.onLine = true;");
  const check = siteVisitTests.indexOf('helper.siteVisitNetworkError(new Error("Project not found."), true)');
  assert.ok(reset > 0 && check > reset);
  const adminPhotos = read("components/site-visits-admin.tsx");
  const employeePhotos = read("components/employee-site-visit-center.tsx");
  assert.equal((adminPhotos.match(/loading="lazy" decoding="async"/g)||[]).length, 2);
  assert.equal((employeePhotos.match(/loading="lazy" decoding="async"/g)||[]).length, 2);
});
