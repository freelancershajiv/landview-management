const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (name) => fs.readFileSync(name, "utf8");
const rule = (css, selector) => {
  const start = css.indexOf(selector + "{");
  assert.ok(start >= 0, `Missing selector: ${selector}`);
  const end = css.indexOf("}", start);
  return css.slice(start + selector.length + 1, end);
};

test("Accounts active red tabs always render white text", () => {
  const css = read("components/accounts-dashboard-polish.tsx");
  const active = rule(css, ".bank-accounts-page .bank-tabs button.active");
  assert.match(active, /background:var\(--lv-brand-primary\)!important/);
  assert.match(active, /color:#fff!important/);
  assert.match(active, /-webkit-text-fill-color:#fff!important/);
});

test("New Site filled actions have explicit white foregrounds", () => {
  for (const [path, selector] of [
    ["components/new-site-entry-center.tsx", ".nse-btn.primary"],
    ["components/new-site-entry-center-v2.tsx", ".nsp-btn.primary"],
  ]) {
    const css = rule(read(path), selector);
    assert.match(css, /color:#fff/);
    assert.match(css, /-webkit-text-fill-color:#fff/);
  }
});

test("Accounts and Site Entry status colors use theme-aware semantic foregrounds", () => {
  const examples = [
    ["components/accounts-bank-statement-page.tsx", ".expense-action", "--lv-danger"],
    ["components/accounts-bank-statement-page.tsx", ".type-pill.income", "--lv-success"],
    ["components/accounts-bank-statement-page.tsx", ".type-pill.expense", "--lv-danger"],
    ["components/accounts-entry-panel.tsx", ".aep-tab.active.income", "--lv-success"],
    ["components/accounts-entry-panel.tsx", ".aep-tab.active.expense", "--lv-danger"],
    ["components/new-site-entry-center.tsx", ".nse-btn.good", "--lv-success"],
    ["components/new-site-entry-center.tsx", ".nse-btn.danger", "--lv-danger"],
    ["components/new-site-entry-center.tsx", ".nse-badge.Approved", "--lv-success"],
    ["components/new-site-entry-center.tsx", ".nse-badge.Rejected", "--lv-danger"],
    ["components/chairman-expense-approval.tsx", ".lv-ack-btn", "--lv-success"],
    ["components/accounts-inline-entry-bridge.tsx", ".accounts-inline-save-message", "--lv-success"],
  ];
  for (const [path, selector, token] of examples) {
    assert.ok(rule(read(path), selector).includes("color:var(" + token), path + " " + selector);
  }
});

function luminance(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test("standard-size text passes contrast in both themes for affected surfaces", () => {
  const pairs = [
    ["#ffffff", "#d61f26"],  // primary actions
    ["#2d7350", "#f7f9fc"],  // light-mode finance income
    ["#a92c33", "#f7f9fc"],  // light-mode finance expense
    ["#2d7350", "#f0f4f2"],  // light-mode approved
    ["#a92c33", "#f4f1f1"],  // light-mode rejected
    ["#7bc79b", "#152a1e"],  // dark-mode finance income
    ["#ff9aa0", "#321b1d"],  // dark-mode finance expense
    ["#7bc79b", "#183124"],  // dark-mode acknowledgement
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5,
      `Contrast too low: ${foreground} / ${background} = ${contrast(foreground, background).toFixed(2)}`);
  }
});
