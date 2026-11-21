const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const page = read("app/admin/projects/new/page.tsx");
const whatsapp = read("components/whatsapp-number-check.tsx");
const styles = page.match(/const css = `([\s\S]*?)`;/)?.[1];
const mainTheme = read("app/private-theme.css");
const tokens = read("app/landview-design-tokens.css");

test("New Project uses the shared light/dark colors instead of legacy dark-only fallbacks", () => {
  assert.ok(styles, "Missing New Project stylesheet");
  assert.doesNotMatch(styles, /--theme-|background:\s*#(?:111b24|18232d|0e1720|141e28)/i);
  for (const name of [
    "--lv-control-bg","--lv-control-border","--lv-control-bg-hover",
    "--lv-surface-panel","--lv-surface-muted","--lv-text-primary",
    "--lv-text-secondary","--lv-text-strong","--lv-brand-soft",
    "--lv-brand-border","--lv-success-soft","--lv-danger-soft"
  ]) assert.ok(styles.includes("var("+name+")"), "Not using semantic color "+name);
  assert.match(styles,/\.new-project-page \.new-project-card\s*\{[^}]*background:var\(--lv-surface-panel\)/);
  assert.match(styles,/\.new-project-page \.form-grid :is\(input,select,textarea\)\s*\{[^}]*background:var\(--lv-control-bg\)/);
  assert.match(mainTheme,/\.portal-admin \.new-project-page \.id-mode\.active/);
  assert.ok(tokens.includes("--lv-text-inverse:"));
});

test("New Project buttons distinguish neutral navigation and solid-red Create actions", () => {
  assert.match(page, /className="new-project-btn primary submit" data-lv-button="primary"/);
  assert.match(page, /className="new-project-btn primary" data-lv-button="primary"/);
  assert.equal((page.match(/className="new-project-btn" data-lv-button="secondary"/g)||[]).length,6);
  assert.match(styles,/\.new-project-page \.new-project-btn\s*\{[^}]*background:var\(--lv-control-bg\)[^}]*color:var\(--lv-text-primary\)/);
  assert.match(styles,/\.new-project-page \.new-project-btn\.primary\s*\{[^}]*background:var\(--lv-brand-primary\)[^}]*color:#fff;[^}]*-webkit-text-fill-color:#fff/);
  assert.match(styles,/\.new-project-page \.new-project-btn\.primary:hover:not\(:disabled\)\s*\{[^}]*var\(--lv-brand-primary-hover\)[^}]*color:#fff/);
});

test("Automatic and Manual ID remain soft selection cards with readable nested text", () => {
  assert.match(page,/className=\{`id-mode \$\{mode === "automatic" \? "active" : ""\}`\} aria-pressed=\{mode === "automatic"\}/);
  assert.match(page,/className=\{`id-mode \$\{mode === "manual" \? "active" : ""\}`\} aria-pressed=\{mode === "manual"\}/);
  assert.match(styles,/\.new-project-page \.id-mode\.active\s*\{[^}]*background:var\(--lv-brand-soft\)/);
  assert.match(styles,/\.new-project-page \.id-mode b\s*\{[^}]*color:var\(--lv-text-strong\)/);
  assert.match(styles,/\.new-project-page \.id-mode span\s*\{[^}]*color:var\(--lv-text-secondary\)/);
  assert.doesNotMatch(page,/<button\s+className=\{`id-mode[^>]*data-lv-button="primary"/);
  assert.match(page,/manualExists\?"var\(--lv-danger\)":"var\(--lv-text-secondary\)"/);
});

test("WhatsApp number check has theme-aware neutral button without altering its API", () => {
  assert.match(whatsapp,/data-lv-button="secondary"/);
  assert.match(whatsapp,/background: "var\(--lv-control-bg, #fff\)"/);
  assert.match(whatsapp,/color: "var\(--lv-text-primary, #26323e\)"/);
  assert.match(whatsapp,/state\.kind === "ok" \? "var\(--lv-success/);
  assert.match(whatsapp,/state\.kind === "bad" \|\| state\.kind === "error" \? "var\(--lv-danger/);
  assert.doesNotMatch(whatsapp, /background: "#14202a"|color: "#f3f6f8"/);
  assert.match(whatsapp,/action: "check-number"/);
  assert.match(whatsapp,/\/api\/admin\/whatsapp\/client/);
});

test("New Project data submission, permissions, navigation, and location action are intact", () => {
  for(const fragment of [
    'onSubmit={submit}', 'if (!canManage || saving) return',
    'method: "POST"', 'fetch("/api/projects/new"', 'setMode("automatic")',
    'setMode("manual")', 'onClick={useCurrentLocation}',
    'disabled={!canManage || saving || (mode === "manual" && manualExists)}'
  ]) assert.ok(page.includes(fragment), "Missing existing New Project behavior: "+fragment);
  assert.doesNotMatch(styles, /\bfetch\s*\(|@media print|localStorage|alter table|create table/i);
  assert.match(styles,/\.new-project-page \.new-project-btn/);
  assert.doesNotMatch(styles,/\n\.form-grid(?!.*new-project-page)/);
});
