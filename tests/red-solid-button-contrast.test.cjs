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
