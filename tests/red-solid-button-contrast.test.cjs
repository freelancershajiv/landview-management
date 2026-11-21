const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

const theme = read("app/private-theme.css");
const central = read("app/private-control-system.css");
const guardStart = theme.indexOf("/* Final filled-red contrast guard.");
const guard = theme.slice(guardStart);

test("solid-red contrast protection is final in the shared screen-only theme", () => {
  assert.ok(guardStart > theme.indexOf("/* Admin dashboard */"), "Must follow legacy dashboard overrides");
  assert.ok(guardStart > theme.indexOf("/* WhatsApp Admin"), "Must follow legacy WhatsApp overrides");
  assert.match(guard, /@media screen \{/);
  assert.doesNotMatch(guard, /@media print|@page|fetch\(|localStorage|create table|alter table/i);
  for (const portal of [".portal-admin", ".portal-employee", ".portal-client", ".lv-client-shell", ".pf-redesign"]) {
    assert.ok(guard.includes(portal), "Missing portal: " + portal);
  }
});

test("all semantic solid-red buttons and older filled classes receive forced white labels", () => {
  for (const selector of [
    '[data-lv-button="primary"]','[data-lv-button="danger-solid"]',
    '[data-variant="primary"]','[data-variant="danger-solid"]',
    ".ase-submit",".nse-btn.primary",".nsp-btn.primary",
    ".b2-btn.primary",".bm-btn.primary",".due-link.primary",
    ".lv-clean-btn.primary",".pm-btn-primary",".bank-btn.primary",
    ".lv-command-btn.primary",".nsdc-button",".aep-submit.expense"
  ]) assert.ok(guard.includes(selector), "Missing solid red selector " + selector);
  assert.equal((guard.match(/color: #fff !important;/g) || []).length, 4,
    "Force both color and text-fill on actions and descendants");
  assert.match(guard, /:is\(span,strong,b,small,i,em,svg,label,p,div\)/);
  assert.ok(guard.includes('-webkit-text-fill-color: #fff !important;'));
});

test("soft red controls keep contrasting ink instead of white-on-pale labels", () => {
  for (const exclusion of [
    ':not([data-lv-button="soft"])',':not([data-lv-button="danger"])',
    ':not([data-lv-button="tab-active"])'
  ]) assert.ok(guard.includes(exclusion), "Missing exclusion " + exclusion);
  assert.doesNotMatch(guard, /(?:^|,)\s*\.primary\s*(?:,|\))/m,
    "Do not infer solid fill from a naked primary class");
  assert.doesNotMatch(guard, /(?:^|,)\s*\.danger\s*(?:,|\))/m,
    "Do not infer solid fill from a naked danger class");
  assert.match(central, /\[data-lv-button="soft"\]/);
  assert.match(central, /--lv-ui-fg: var\(--lv-ui-btn-soft-text\)/);
  assert.match(central, /\[data-lv-button="danger"\]/);
  assert.match(central, /--lv-ui-fg: var\(--lv-danger\)/);
});

function luminance(hex) {
  const parts = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
    .map(x => x <= 0.04045 ? x/12.92 : ((x+.055)/1.055)**2.4);
  return parts.reduce((sum,v,i) => sum + v*[.2126,.7152,.0722][i],0);
}
function contrast(foreground,background) {
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
test("forced white labels remain WCAG AA on LAND VIEW solid-red palette", () => {
  for (const bg of ["#d61f26","#ad171d","#a92c33","#9c2930","#c9232b"]) {
    const ratio=contrast("#ffffff",bg);
    assert.ok(ratio>=4.5, bg + " has insufficient white-on-red contrast "+ratio.toFixed(2)+":1");
  }
});

test("inverse text is owned by the global design tokens, not redeclared in private themes", () => {
  const tokens=read("app/landview-design-tokens.css");
  assert.equal((tokens.match(/--lv-text-inverse:\s*#ffffff/g)||[]).length,2,
    "Global light and dark tokens must both define the white inverse foreground");
  assert.doesNotMatch(theme,/--lv-text-inverse:\s*#[a-f0-9]+/,
    "Avoid a second token authority in the private stylesheet");
});

test("inspected red-filled actions are protected explicitly instead of a generic .primary override", () => {
  const audited = [
    ["components/admin-todo-workspace.tsx",".tws-primary"],
    ["components/admin-todo-automation-center.tsx",".ta-btn.primary"],
    ["components/admin-todo-workflow-center.tsx",".twf-actions button.primary"],
    ["components/admin-todo-template-center.tsx",".tt-btn.primary"],
    ["components/admin-todo-reports.tsx",".tr-btn.primary"],
    ["components/admin-todo-workload-center.tsx",".wl-btn.primary"],
    ["components/admin-todo-calendar.tsx",".tc-btn.primary"],
    ["components/admin-todo-management-alerts.tsx",".ma-btn.primary"],
    ["components/project-lifecycle-workspace.tsx",".lwx-btn.primary"],
    ["app/admin/finance/workspace/billing-workspace.css",".b2-small.primary"],
    ["components/admin-todo-bulk-actions.tsx",".tb-button.primary"],
    ["components/admin-todo-reminder-center.tsx",".trc-save"],
    ["app/admin/finance/writeoffs/writeoffs.css",".wo-toggle button.active"],
  ];
  const block=theme.slice(theme.indexOf("/* Audited Admin solid-red control matrix."));
  assert.ok(block.startsWith("/* Audited Admin solid-red"),"Final audited guard missing");
  assert.doesNotMatch(block,/\.b2-tab\.active|\.due-filter\.active|\.twf-tabs button\.active|\.lwx-tabs button\.active/,
    "Potential pale selected tabs must not get a white foreground without red fill");
  for (const [file,selector] of audited) {
    const source=read(file);
    assert.ok(source.includes(selector), file + " no longer contains " + selector);
    assert.ok(block.includes(selector), "The filled red action is not protected: " + file);
  }
  assert.match(block, /color:\s*#fff\s*!important/);
  assert.match(block, /-webkit-text-fill-color:\s*#fff\s*!important/);
});

test("audited Admin red-filled routes consistently inherit white text in both themes", () => {
  const audited = [
  [
    "app/admin/proposals/page.tsx",
    ".pr-btn.primary"
  ],
  [
    "app/admin/projects/new/page.tsx",
    ".new-project-btn.primary"
  ],
  [
    "app/admin/estimate/page.tsx",
    ".estimate-open"
  ],
  [
    "app/admin/finance/billing-control/page.tsx",
    ".bc-btn.primary"
  ],
  [
    "app/admin/finance/invoice-center/page.tsx",
    ".ic-head-actions .ic-primary"
  ],
  [
    "app/admin/finance/adjustments/page.tsx",
    ".adj-btn.primary"
  ],
  [
    "app/admin/finance/payment-lifecycle/page.tsx",
    ".pl-head button"
  ],
  [
    "app/admin/finance/service-payments/page.tsx",
    ".rp-tab.active"
  ],
  [
    "app/admin/finance/service-payments/page.tsx",
    ".rp-btn"
  ],
  [
    "app/admin/finance/reconciliation/page.tsx",
    ".r41 button.primary"
  ],
  [
    "app/admin/finance/integrity/page.tsx",
    ".integrity-head button"
  ],
  [
    "app/admin/finance/full-bill-editor/page.tsx",
    ".fbe-btn.primary"
  ],
  [
    "app/admin/project-operations/overview/page.tsx",
    ".wov-btn.primary"
  ],
  [
    "app/admin/project-operations/overview/page.tsx",
    ".wov-button.primary"
  ],
  [
    "app/admin/project-operations/overview/page.tsx",
    ".wov-filter.active"
  ],
  [
    "app/admin/project-operations/document-register/page.tsx",
    ".wdr-btn.primary"
  ],
  [
    "app/admin/project-operations/by-project/page.tsx",
    ".byp-btn.primary"
  ],
  [
    "app/admin/project-operations/by-project/page.tsx",
    ".byp-small.primary"
  ],
  [
    "app/admin/project-operations/by-service/page.tsx",
    ".bys-btn.primary"
  ],
  [
    "app/admin/project-operations/by-service/page.tsx",
    ".bys-tab.active"
  ],
  [
    "app/admin/projects/reclassify/page.tsx",
    ".reclass-btn.primary"
  ],
  [
    "app/admin/projects/reclassify/page.tsx",
    ".filter-btn.active"
  ],
  [
    "app/admin/registers/registers.css",
    ".register-btn.primary"
  ],
  [
    "app/admin/registers/registers.css",
    ".register-tabs button.active"
  ],
  [
    "app/admin/registers/registers.css",
    ".register-filter.active"
  ],
  [
    "app/admin/finance/allocation-corrections/page.tsx",
    ".lv-correction button"
  ],
  [
    "app/admin/finance/add-bill/page.tsx",
    ".ab-btn.primary"
  ],
  [
    "app/admin/finance/outsourcing/new/page.tsx",
    ".po-btn.primary"
  ],
  [
    "app/admin/finance/direct-bill/direct-full-bill-workspace.tsx",
    ".db-btn.primary"
  ],
  [
    "app/admin/website-leads/page.tsx",
    ".wl-save"
  ],
  [
    "app/admin/website-leads/page.tsx",
    ".wl-links .proposal"
  ],
  [
    "app/admin/website-leads/page.tsx",
    ".wl-btn.primary"
  ],
  [
    "app/admin/projects/[projectId]/project-dashboard-red.css",
    ".project-workspace-switcher a.active"
  ]
];
  const block = theme.slice(theme.indexOf("/* Audited Admin solid-red control matrix."));
  assert.ok(block.includes("color: #fff !important;"));
  assert.ok(block.includes("-webkit-text-fill-color: #fff !important;"));
  assert.equal((block.match(/\.portal-admin :is\(button,a,\[role="button"\]\):is\(/g)||[]).length,2);
  for (const [file,selector] of audited) {
    const source = read(file);
    const index = source.indexOf(selector);
    assert.ok(index>=0, file + " no longer declares " + selector);
    const brace = source.indexOf("{",index);
    assert.ok(brace>index && brace-index<90, file + ": unexpected selector body");
    const ending=source.indexOf("}",brace);
    const rule=source.slice(brace+1,ending);
    assert.match(rule, /background(?:-color)?\s*:\s*(?:var\(--lv-brand-primary\)|#[a-f0-9]{6})/i,
      file + " " + selector + " is no longer solid red");
    assert.ok(block.includes(selector), "Missing contrast rule for " + file + " " + selector);
  }
  for (const pale of [".b2-tab.active",".due-filter.active",".bank-tabs button.active",".twf-tabs button.active",".lwx-tabs button.active"]) {
    assert.ok(!block.includes(pale), "Pale selected tab cannot use white-on-red override: "+pale);
  }
  assert.match(block, /:not\(\[data-lv-button="soft"\]\)/);
  assert.match(block, /:not\(\[data-lv-button="tab-active"\]\)/);
});

test("Direct Bill uses a readable LAND VIEW red background behind white button text", () => {
  const source=read("app/admin/finance/direct-bill/direct-full-bill-workspace.tsx");
  assert.match(source,/\.db-btn\.primary\{background:var\(--lv-brand-primary\);border-color:var\(--lv-brand-primary\);color:#fff;-webkit-text-fill-color:#fff\}/);
  assert.doesNotMatch(source,/\.db-btn\.primary\{background:#d94b45/);
});
