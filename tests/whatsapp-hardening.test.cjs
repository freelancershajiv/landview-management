const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const source = (name) => readFileSync(resolve(__dirname, '..', name), 'utf8');

test('public WhatsApp service endpoints never expose pairing information', () => {
  const server = source('whatsapp-service/server.mjs');
  const gateway = source('whatsapp-service/gateway.mjs');
  assert.doesNotMatch(server, /app\.get\('\/', \(_req, res\) => res\.json\(\{[^\n]*session\.status\(/);
  for (const file of [server, gateway]) {
    assert.match(file, /app\.get\('\/', \(_req, res\) => \{/);
    assert.match(file, /service: 'land-view-whatsapp'/);
  }
  assert.match(server, /app\.get\('\/health', \(req, res\) => \{\s*if \(!authorized\(req\)\)/);
});

test('late events cannot revive a reset WhatsApp linked device', () => {
  for (const name of ['whatsapp-service/server.mjs', 'whatsapp-service/gateway.mjs']) {
    const code = source(name);
    assert.match(code, /wa\.ev\.on\('connection\.update',[\s\S]{0,220}if \(state\.sock !== wa\) return/);
    assert.match(code, /const previousSocket = state\.sock\s+state\.sock = null/);
    assert.match(code, /try \{ await previousSocket\?\.logout\(\) \} catch \{\}/);
  }
});

test('admin UI polls only the shared Admin session', () => {
  const page = source('app/admin/whatsapp/page.tsx');
  assert.doesNotMatch(page, /requestStatus\("\/api\/admin\/whatsapp\/client\?mode=status"/);
  assert.match(page, /setInterval\(loadStatus, 15000\)/);
});
