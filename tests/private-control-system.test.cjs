const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = path => fs.readFileSync(path, "utf8");
const css = read("app/private-control-system.css");
const legacy = read("app/button-contrast-authority.css");
const roles = ["admin", "projectmanagement", "employee", "client"];

test("all four private portals load one centralized theme/control contract last", () => {
  for (const role of roles) {
    const layout = read("app/" + role + "/layout.tsx");
    const central = layout.indexOf('import "../private-theme.css";');
    assert.ok(central > -1, role + " does not import the central control system");
    const old = layout.indexOf('import "../button-contrast-authority.css";');
    assert.ok(central > old, role + " loads old overrides after the central control system");
    if (["admin", "projectmanagement"].includes(role)) {
      assert.ok(central > layout.indexOf("admin-mobile-v5.css"), role + " load order is incorrect");
    }
  }
  assert.match(read("app/private-theme.css"), /@import "\.\/private-control-system\.css";/);
  assert.match(css, /@media screen \{/);
  assert.doesNotMatch(css, /@media print/);
});

test("central button contract maps background AND foreground for every variant", () => {
  const variants = ["primary","secondary","outline","soft","success","success-solid","danger","danger-solid","warning","tab-active"];
  for (const variant of variants) {
    assert.ok(css.includes('[data-lv-button="' + variant + '"]'), "missing variant " + variant);
  }
  for (const property of [
    "background: var(--lv-ui-bg",
    "border-color: var(--lv-ui-border",
    "color: var(--lv-ui-fg",
    "-webkit-text-fill-color: var(--lv-ui-fg",
    "--lv-ui-hover-bg",
    "focus-visible",
    "aria-disabled"
  ]) assert.ok(css.includes(property), "missing button state " + property);
  assert.match(read("components/lv-controls.tsx"), /export function LVButton\(/);
  assert.match(read("components/lv-controls.tsx"), /export function LVButtonLink\(/);
});

test("the historical .primary-only white-text collision cannot return", () => {
  assert.doesNotMatch(legacy, /\.lv-command-btn\.primary,\.primary,/);
  assert.match(legacy, /do not match bare \.primary/);
  assert.match(css, /data-lv-button="tab-active"/);
  assert.match(css, /--lv-ui-btn-soft-text: #a81820/);
  assert.match(css, /--lv-ui-btn-soft-text: #ff858a/);
});

function rgb(hex) {
  const h = hex.slice(1);
  return [0,2,4].map(i => parseInt(h.slice(i,i+2),16));
}
function blend(fg, bg, alpha) {
  const a = rgb(fg), b = rgb(bg);
  return "#" + a.map((v,i) => Math.round(v*alpha + b[i]*(1-alpha)).toString(16).padStart(2,"0")).join("");
}
function luminance(hex) {
  return rgb(hex).map(n => n/255).map(n => n <= 0.04045 ? n/12.92 : ((n+0.055)/1.055)**2.4)
    .reduce((sum,v,i) => sum + v*[0.2126,0.7152,0.0722][i], 0);
}
function contrast(fg,bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

test("filled, soft, neutral and semantic buttons meet WCAG AA normal text in both themes", () => {
  const pairs = [
    ["light primary","#ffffff","#d61f26"],
    ["dark primary","#ffffff","#d61f26"],
    ["light primary hover","#ffffff","#ad171d"],
    ["light selected tab","#a81820",blend("#d61f26","#fbfcfd",.15)],
    ["dark selected tab","#ff858a",blend("#d61f26","#11171d",.18)],
    ["light secondary","#26323e","#ffffff"],
    ["dark secondary","#dfe5e9","#11171d"],
    ["light success","#2d7350","#edf7f1"],
    ["dark success","#7bc79b","#173827"],
    ["light danger","#a92c33","#fff0f1"],
    ["dark danger","#ff9aa0","#35171a"],
    ["light success solid","#ffffff","#2d7350"],
    ["dark success solid","#ffffff","#2f6f50"],
    ["light danger solid","#ffffff","#a92c33"],
    ["dark danger solid","#ffffff","#9c2930"],
    ["light warning","#7d5c1b","#fff7df"],
    ["dark warning","#e7c36e","#3c3015"]
  ];
  for (const [name,fg,bg] of pairs)
    assert.ok(contrast(fg,bg) >= 4.5, name + " contrast " + contrast(fg,bg).toFixed(2) + ":1 is below 4.5:1");
});

test("high-use project, payment, Site Visit and employee controls use the central contract", () => {
  const expected = [
    ["components/admin-site-visit-entry.tsx", ["primary"]],
    ["app/admin/finance/due-bills/page.tsx", ["primary","secondary","tab-active"]],
    ["app/admin/finance/workspace/page.tsx", ["primary","secondary","success","tab-active"]],
    ["app/admin/finance/bills/page.tsx", ["primary","secondary","soft","danger"]],
    ["components/new-site-entry-center.tsx", ["primary","secondary","success","danger"]],
    ["components/new-site-entry-center-v2.tsx", ["primary","secondary","success","danger"]],
    ["components/employee-whatsapp-connect.tsx", ["success-solid","secondary"]],
    ["components/admin-dashboard-clean.tsx", ["primary","secondary"]],
    ["components/accounts-entry-panel.tsx", ["success","danger","secondary"]],
    // Project stage filters use a filled red active state, not a soft red tab.
    ["app/admin/projects/page.tsx", ["secondary","primary"]]
  ];
  for (const [path,variants] of expected) {
    const source=read(path);
    assert.match(source, /data-lv-button=/, path + " is not using the central contract");
    for (const variant of variants)
      assert.ok(source.includes('data-lv-button="' + variant + '"') ||
        source.includes('?"' + variant + '"') || source.includes(':"' + variant + '"'),
        path + " missing " + variant);
  }
});

test("the private contract never changes network, database, printing or click handlers", () => {
  assert.doesNotMatch(css, /\bfetch\s*\(|localStorage|@media print|create table|alter table/i);
  const tsx=read("components/lv-controls.tsx");
  assert.doesNotMatch(tsx, /\bfetch\s*\(|useEffect|useState|localStorage/);
});
