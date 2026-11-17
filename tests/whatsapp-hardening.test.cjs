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

test('WhatsApp V4.1 retry handling backs off competing connections without deleting pairing', () => {
  for (const name of ['whatsapp-service/server.mjs', 'whatsapp-service/gateway.mjs']) {
    const code = source(name);
    assert.match(code, /const conflict = code === 440/);
    assert.match(code, /state\.connection = conflict \? 'conflict_backoff' : 'disconnected'/);
    assert.match(code, /state\.backoffUntil > Date\.now\(\)/);
    assert.match(code, /state\.backoffUntil = Date\.now\(\) \+ delay/);
    assert.match(code, /state\.connection = 'error'/);
    assert.match(code, /scheduleReconnect\(10000\)/);
    assert.match(code, /protocolLogger\.level = 'warn'/);
  }
});

test('WhatsApp V4.1 exposes temporary hosting outages without suggesting a credential reset', () => {
  const api = source('app/api/admin/whatsapp/route.ts');
  const page = source('app/admin/whatsapp/page.tsx');
  const server = source('whatsapp-service/server.mjs');
  assert.match(api, /connection: "service_waking"/);
  assert.match(api, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(page, /const canReset = Boolean\(state\?\.paired \|\| state\?\.qrAvailable \|\| state\?\.connection === "logged_out"\)/);
  assert.match(page, /"Server waking \/ temporarily unreachable"/);
  assert.match(server, /state\.qrDataUrl = ''\s*if \(code === DisconnectReason\.loggedOut\)/);
});
