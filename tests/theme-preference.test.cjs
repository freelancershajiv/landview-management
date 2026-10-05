const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadSwitch(initial = 'light', blockedStorage = false) {
  const document = { documentElement: { dataset: { theme: initial } } };
  const listeners = new Map();
  let saved, subscribe;
  const window = {
    addEventListener: (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
    dispatchEvent: event => listeners.get(event.type)?.forEach(fn => fn(event)),
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('components/theme-switch.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, document, window, Event: class { constructor(type) { this.type = type; } },
    localStorage: { setItem: (key, value) => { if (blockedStorage) throw Error('Storage disabled'); saved = [key, value]; } },
    require: name => name === 'react' ? { useSyncExternalStore: (s, snapshot) => { subscribe = s; return snapshot(); } } : {
      jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment',
    },
  });
  return { render: exports.default, document, window, saved: () => saved, listen: callback => subscribe(callback), listeners };
}

test('white mode can switch to dark and back while saving the preference', () => {
  const env = loadSwitch();
  assert.equal(env.render().props['aria-label'], 'Switch to dark mode');
  env.render().props.onClick();
  assert.equal(env.document.documentElement.dataset.theme, 'dark');
  assert.equal(env.saved()[1], 'dark');
  assert.equal(env.render().props['aria-label'], 'Switch to light mode');
  env.render().props.onClick();
  assert.equal(env.document.documentElement.dataset.theme, 'light');
});

test('switch remains usable when browser storage is unavailable', () => {
  const env = loadSwitch('light', true);
  assert.doesNotThrow(() => env.render().props.onClick());
  assert.equal(env.document.documentElement.dataset.theme, 'dark');
});

test('theme follows changes from another tab and releases event listeners', () => {
  const env = loadSwitch(); env.render(); let updates = 0;
  const unsubscribe = env.listen(() => updates++);
  env.window.dispatchEvent({ type: 'storage', key: 'landview-theme', newValue: 'dark' });
  assert.equal(env.document.documentElement.dataset.theme, 'dark');
  assert.equal(updates, 1);
  env.window.dispatchEvent({ type: 'storage', key: 'unrelated', newValue: 'light' });
  assert.equal(updates, 1);
  env.window.dispatchEvent({ type: 'storage', key: null, newValue: null });
  assert.equal(env.document.documentElement.dataset.theme, 'light');
  unsubscribe();
  assert.equal([...env.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
});
