const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('final theme stability layer is loaded after all other theme layers', () => {
  const layout = read('app/layout.tsx');
  const navigationIndex = layout.indexOf('import "./dual-mode-navigation.css";');
  const stabilityIndex = layout.indexOf('import "./theme-stability.css";');

  assert.notEqual(navigationIndex, -1);
  assert.notEqual(stabilityIndex, -1);
  assert.ok(stabilityIndex > navigationIndex);
});

test('legacy LAND VIEW surface variables resolve through semantic theme tokens', () => {
  const css = read('app/theme-stability.css');

  assert.match(css, /--lv-paper:\s*var\(--lv-surface-page\)/);
  assert.match(css, /--lv-surface:\s*var\(--lv-surface-panel\)/);
  assert.match(css, /--lv-white:\s*var\(--lv-surface-panel\)/);
  assert.match(css, /--lv-text:\s*var\(--lv-text-primary\)/);
  assert.match(css, /--lv-accent:\s*var\(--lv-action-primary\)/);
  assert.match(css, /@media screen/);
});

test('workflow controls no longer force dark native widgets', () => {
  const css = read('components/workflow-stage.module.css');

  assert.doesNotMatch(css, /color-scheme\s*:\s*dark/i);
  assert.match(css, /var\(--lv-control-bg\)/);
  assert.match(css, /var\(--lv-text-primary\)/);
});

test('project finance and analytics prompt use semantic theme surfaces', () => {
  const finance = read('components/project-finance-lite-styles.tsx');
  const analytics = read('components/visitor-analytics.module.css');

  assert.match(finance, /var\(--lv-surface-panel\)/);
  assert.match(finance, /var\(--lv-control-bg\)/);
  assert.doesNotMatch(finance, /background:#fff\b/i);
  assert.match(analytics, /var\(--lv-surface-elevated\)/);
  assert.match(analytics, /var\(--lv-action-primary\)/);
  assert.doesNotMatch(analytics, /#f1c75b/i);
});
