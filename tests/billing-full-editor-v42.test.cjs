const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = path => fs.readFileSync(path, "utf8");
const sql = read("supabase/migrations/20261121190000_billing_v42_atomic_full_bill_revision.sql");
const edge = read("supabase/functions/landview-data/index.ts");
const api = read("app/api/billing/full-revision-v42/route.ts");
const page = read("app/admin/finance/full-bill-editor/page.tsx");

test("Billing V4.2 sends every changed service in one protected request", () => {
  assert.match(page, /\/api\/billing\/full-revision-v42/);
  assert.match(page, /const operations: Row\[\] = \[\]/);
  assert.match(page, /kind: "draft_update"/);
  assert.match(page, /kind: "draft_void"/);
  assert.match(page, /kind: "issued_revision"/);
  assert.match(page, /kind: "issued_remove"/);
  assert.match(page, /kind: "create"/);
  assert.doesNotMatch(page, /fetch\("\/api\/billing\/write"/);
  assert.doesNotMatch(page, /fetch\("\/api\/billing\/service-discount"/);
  assert.doesNotMatch(page, /fetch\("\/api\/billing\/bills"/);
  assert.match(page, /request\(true\)/);
  assert.match(page, /request\(false\)/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /pendingRevision\.current/);
  assert.match(page, /sessionStorage\.setItem/);
  assert.match(page, /verifyPendingRevision/);
});

test("Billing V4.2 never rewrites issued gross or quantity", () => {
  assert.match(sql, /Issued bill gross, rate and quantity cannot be rewritten/);
  assert.match(sql, /v_kind='issued_revision'/);
  assert.match(sql, /v_bill\.amount/);
  assert.match(sql, /v_kind IN \('draft_update','draft_void','issued_remove'\) AND v_paid>/);
  assert.match(sql, /A paid service cannot be reassigned/);
  assert.match(sql, /Revised invoice value cannot be below already allocated money/);
  assert.match(sql, /Existing credits already affect the outstanding value/);
  assert.match(sql, /bill_id=v_bill\.id/);
});

test("one PostgreSQL transaction contains all operations and durable before-after audit", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.billing_v42_apply_full_revision/);
  assert.match(sql, /-- Pass 1: validate all rows before modifying any row/);
  assert.match(sql, /-- Pass 2: all changes and the final immutable revision audit/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /full_bill_revision_v42/);
  assert.match(sql, /'before',v_before,'after',v_after/);
  assert.match(sql, /'requestHash',p_request_hash/);
  assert.match(sql, /RETURN coalesce\(v_existing\.details->'result'/);
  assert.match(sql, /IF p_preview THEN RETURN jsonb_build_object\('preview',true/);
  assert.match(sql, /v_event_key text := 'full-bill-v42:'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.billing_v42_apply_full_revision/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.billing_v42_apply_full_revision.+ TO service_role/);
  assert.doesNotMatch(sql, /TRUNCATE|DROP TABLE|DELETE FROM public\.payments|UPDATE public\.payments/i);
});

test("issued service removal creates credit-note adjustments and keeps original bill", () => {
  assert.match(sql, /v_kind='issued_remove'/);
  assert.match(sql, /INSERT INTO public\.billing_adjustments/);
  assert.match(sql, /INSERT INTO public\.bills/);
  assert.match(sql, /'Credit Note'/);
  assert.match(sql, /mirror_bill_id,mirror_bill_code/);
  assert.doesNotMatch(sql, /DELETE FROM public\.bills/);
});

test("legacy bills retain missing unit-rate/date fields until edited", () => {
  assert.match(page, /originalStoredDate: storedDate/);
  assert.match(page, /originalUnitPrice: unitPrice/);
  assert.match(page, /originalStatus: billStatus\(row\)/);
  assert.match(page, /line\.originalQuantity/);
  assert.match(page, /line\.originalUnitPrice/);
  assert.match(sql, /nullif\(v_next->>'date',''\)::date/);
  assert.match(sql, /v_kind IN \('create','draft_update'\) AND \(v_qty<=0/);
});

test("authenticated API calls trusted gateway, not a SQL string from the browser", () => {
  assert.match(api, /await requireLocalSession\(request\)/);
  assert.match(api, /const ROLES = new Set\(\["admin", "manager", "accounts"\]\)/);
  assert.match(api, /sameOrigin\(request\)/);
  assert.match(api, /createHash\("sha256"\)/);
  assert.match(api, /applyFullBillRevisionV42/);
  assert.match(edge, /if \(action === "applyFullBillRevisionV42"\)/);
  assert.match(edge, /rpc\/billing_v42_apply_full_revision/);
  assert.doesNotMatch(api, /insertRows\(|updateRows\(|deleteRows\(/);
  assert.match(api, /selectRows\("billing_events"/);
});

test("revision history includes before/after details and accessible readability", () => {
  assert.match(page, /Full bill revision history/);
  assert.match(page, /reason for this full bill revision/i);
  assert.match(page, /change\.before/);
  assert.match(page, /change\.after/);
  assert.match(page, /font-size:16px/);
});
