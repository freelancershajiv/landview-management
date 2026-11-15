const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('app/button-contrast-authority.css', 'utf8');
const entry = fs.readFileSync('components/admin-site-visit-entry.tsx', 'utf8');

test('global text-fill normalization preserves custom component button foregrounds', () => {
  const rule = css.match(
    /:where\(\.public-site,\.portal-admin,\.portal-employee,\.portal-client,\.pf-redesign\)\s*:where\(button,\[role="button"\],a\[role="button"\]\)\s*\{([^}]*)\}/
  );
  assert.ok(rule, 'generic button selector should have zero specificity');
  assert.doesNotMatch(rule[1], /(?:^|;)\s*color\s*:/m, 'never force color: inherit on custom buttons');
  assert.match(rule[1], /-webkit-text-fill-color:\s*currentColor/);
});

test('Management Site Visit CTA is explicitly white on LAND VIEW red', () => {
  assert.match(entry, /\.ase-toggle\{[^}]*background:\s*#c9232b;\s*color:\s*#fff;/);
  const protectedRule = css.match(
    /\.portal-admin \.admin-site-entry button\.ase-toggle,\s*\.portal-admin \.admin-site-entry button\.ase-submit\s*\{([^}]*)\}/
  );
  assert.ok(protectedRule, 'site visit buttons need explicit light/dark foreground protection');
  assert.match(protectedRule[1], /color:\s*#fff\s*!important/);
  assert.match(protectedRule[1], /-webkit-text-fill-color:\s*#fff\s*!important/);
});
