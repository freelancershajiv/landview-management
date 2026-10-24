const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('app/api/analytics/visit/route.ts', 'utf8');

test('visitor analytics storage failures are best effort and never return a 5xx', () => {
  assert.match(source, /ANALYTICS_WRITE_ATTEMPTS\s*=\s*2/);
  assert.match(source, /ANALYTICS_WRITE_TIMEOUT_MS\s*=\s*8_000/);
  assert.equal(source.includes('console.error("Visitor analytics Supabase write failed"'), false);
  assert.equal(source.includes('status: 502'), false);
  assert.match(source, /\{ success: true, stored: false \}/);
  assert.match(source, /status:\s*202/);
  assert.match(source, /"X-Landview-Analytics": "dropped"/);
});

test('successful visitor analytics writes still report stored telemetry', () => {
  assert.match(source, /\{ success: true, stored: true \}/);
  assert.match(source, /"X-Landview-Analytics": "stored"/);
});

test('invalid analytics input remains rejected instead of being silently accepted', () => {
  assert.match(source, /Invalid analytics event/);
  assert.match(source, /Invalid visitor identifiers/);
  assert.match(source, /Invalid location coordinates/);
  assert.match(source, /Origin not allowed/);
});
