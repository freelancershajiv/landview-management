const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");
const theme = read("app/private-theme.css");
const dashboard = read("components/admin-dashboard-clean.tsx");
const acknowledgements = read("components/chairman-expense-approval.tsx");
const route = read("app/admin/admin-route-theme.css");
const style = (source) => source.match(/<style>\{`([\s\S]*?)`\}<\/style>/)[1];

test("dashboard and finance acknowledgement styles consume central colors without fixed palettes", () => {
  for (const source of [dashboard, acknowledgements]) {
    const css = style(source);
    assert.doesNotMatch(css, /--theme-(?:bg|ink|line|shadow)|--red:|--ink:|--panel:|--bg:/);
    for (const hex of css.match(/#[a-f0-9]{3,8}\b/gi) || []) {
      assert.equal(hex.toLowerCase(), "#fff", "Only a white solid-action foreground may be literal");
    }
    assert.doesNotMatch(css, /background:\s*#fff\b/);
    assert.match(css, /var\(--lv-surface-panel\)/);
    assert.match(css, /var\(--lv-text-primary\)/);
  }
  assert.doesNotMatch(style(dashboard), /\.lv-module-nav|:has\(\.lv-clean-dashboard\)/);
});

test("one dashboard palette authority covers nested cards and finance roles", () => {
  assert.doesNotMatch(route, /\.portal-admin \.lv-clean-dashboard\s*\{/);
  const block = theme.slice(theme.indexOf("/* Admin dashboard */"), theme.indexOf("/* Projects register"));
  for (const selector of [
    ".lv-clean-kpi-icon", ".lv-workflow-icon", ".lv-chart-label", ".lv-chart-legend",
    ".lv-calendar-day.today", ".lv-project-status.progress", ".lv-activity-icon.green",
    ".lv-quick a", ".lv-clean-mobile-quick a", ".lv-dashboard-loading span",
    ".lv-dashboard-error", ".lv-ack-head", ".lv-ack-count", ".lv-ack-error"
  ]) assert.ok(block.includes(selector), "Missing semantic theme coverage for " + selector);
  assert.ok(block.includes("--lv-dashboard-income: var(--lv-success)"));
  assert.ok(block.includes("--lv-dashboard-expense: var(--lv-danger)"));
  assert.match(block, /\.lv-quick a \{[\s\S]*?color: var\(--lv-text-strong\)/);
  assert.match(block, /\.lv-clean-mobile-quick a \{[\s\S]*?color: var\(--lv-text-strong\)/);
  assert.match(acknowledgements, /className="lv-ack-btn" data-lv-button="success"/);
  assert.match(acknowledgements, /className="lv-ack-refresh" data-lv-button="secondary"/);
});

const rgb = (hex) => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const luminance = (c) => c.map(v => v/255).map(x => x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((s,x,i) => s+x*[.2126,.7152,.0722][i],0);
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const blend = (fg,bg,a) => rgb(fg).map((v,i)=>Math.round(v*a+rgb(bg)[i]*(1-a)));

test("dashboard semantic text and tinted action pairs meet AA in both supplied palettes", () => {
  const palettes = [...theme.matchAll(/html(?:\:not\(\[data-theme="dark"\]\)|\[data-theme="dark"\]) :is\(\.portal-admin[^\n]*\) \{([\s\S]*?)\n  \}/g)].slice(0,2);
  assert.equal(palettes.length,2);
  for (const [,body] of palettes) {
    const value = (name) => {
      const match = body.match(new RegExp("--lv-"+name+":\\s*(#[a-f0-9]{6})","i"));
      assert.ok(match, "Missing palette color: "+name);
      return match[1];
    };
    for (const [fg,bg,min] of [
      ["text-strong","surface-panel",4.5],["text-muted","surface-panel",4.5],
      ["text-secondary","surface-muted",4.5],["success","success-soft",4.5],
      ["warning","warning-soft",4.5],["danger","danger-soft",4.5],["info","info-soft",4.5],
      ["success","surface-panel",3],["danger","surface-panel",3]
    ]) assert.ok(contrast(rgb(value(fg)),rgb(value(bg)))>=min, fg+" / "+bg);
    for (const name of ["brand-soft","brand-soft-strong"]) {
      const alpha = body.match(new RegExp("--lv-"+name+":\\s*rgba\\(214,31,38,([.0-9]+)\\)"));
      assert.ok(alpha,"Missing tint "+name);
      assert.ok(contrast(rgb(value("text-strong")),blend(value("brand-primary"),value("surface-panel"),Number(alpha[1])))>=4.5,name);
    }
  }
});
