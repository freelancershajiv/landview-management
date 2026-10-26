import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";

const TEAM_SLUG = "land-view";
const PROJECT_NAME = "landview-management";
const AUDIENCE = "https://supabase.landview.internal";
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const GLOBAL_ISSUER = "https://oidc.vercel.com";
const ALLOWED_TABLES = new Set([
  "clients","employees","projects","project_employees","invoices","payments","site_visits","documents",
  "bills","billing_discount_log","billing_writeoff_log","accounts","transfers","transactions","expenses","tasks","attendance","leave_requests","approvals",
  "app_users","app_permissions","prospective_clients","proposals","proposal_items","proposal_activity",
  "drawing_submissions","quotations","certificates","certificate_requests","certificate_audit","app_audit_log",
  "client_document_register","design_book_register","project_management_ledger","project_management_summary",
  "project_contractor_contracts","project_contractor_bills","project_contractor_progress_updates","project_supplier_accounts",
  "project_billing","project_ledger","project_lifecycle_transitions","employee_location_checks",
  "project_service_workflows","payment_service_allocations","invoice_items","payment_invoice_allocations","payment_receipts",
  "project_contracts","project_contract_services","billing_milestones","billing_events","billing_adjustments","supervision_billing_rules","billing_gate_overrides",
  "website_analytics_visitors","website_analytics_sessions","website_analytics_page_views","website_analytics_location_events","website_analytics_interactions","website_leads"
]);

const DEFAULT_TABLE_ORDER: Record<string, string> = {
  projects: "project_code:desc,created_at:desc",
  clients: "status:asc,name:asc,created_at:desc",
  employees: "status:asc,employee_code:asc,created_at:asc",
  project_employees: "employee_id:asc",
  invoices: "issue_date:desc,created_at:desc,invoice_code:desc",
  payments: "payment_date:desc,created_at:desc,payment_code:desc",
  site_visits: "visit_date:desc,created_at:desc,project_id:desc,employee_id:asc",
  documents: "document_date:desc,created_at:desc,title:asc",
  bills: "bill_date:desc,created_at:desc,bill_code:desc,project_id:desc",
  billing_discount_log: "created_at:desc",
  billing_writeoff_log: "created_at:desc",
  accounts: "created_at:asc",
  transfers: "created_at:desc",
  transactions: "transaction_date:desc,ledger_order:desc,created_at:desc,transaction_code:desc",
  expenses: "expense_date:desc,created_at:desc,project_id:desc",
  tasks: "created_at:desc,project_id:desc",
  attendance: "created_at:desc,employee_id:asc",
  leave_requests: "start_date:desc,created_at:desc,employee_id:asc",
  approvals: "transaction_date:desc,created_at:desc",
  app_users: "employee_code:asc,user_key:asc",
  app_permissions: "status:asc,created_at:desc",
  prospective_clients: "status:asc,client_name:asc,created_at:desc",
  proposals: "created_at:desc,proposal_code:desc",
  proposal_items: "sort_order:asc,created_at:asc,proposal_code:asc",
  proposal_activity: "performed_at:desc,proposal_code:desc",
  drawing_submissions: "created_at:desc,project_code:desc,assigned_employee_code:asc",
  quotations: "quotation_date:desc,created_at:desc,project_code:desc,quotation_code:desc",
  certificates: "issued_at:desc,created_at:desc,certificate_code:desc",
  certificate_requests: "requested_at:desc,project_code:desc",
  certificate_audit: "created_at:desc,certificate_code:desc",
  app_audit_log: "created_at:desc",
  client_document_register: "received_date:desc,created_at:desc,register_code:desc",
  design_book_register: "created_at:desc,project_id:desc",
  project_management_ledger: "created_at:desc,updated_at:desc",
  project_management_summary: "updated_at:desc,created_at:desc",
  project_contractor_contracts: "created_at:desc",
  project_contractor_bills: "created_at:desc,bill_code:desc",
  project_contractor_progress_updates: "created_at:desc",
  project_supplier_accounts: "updated_at:desc,created_at:desc",
  project_billing: "project_code:desc,updated_at:desc",
  project_ledger: "entry_date:desc,created_at:desc,project_id:desc",
  project_lifecycle_transitions: "created_at:desc,project_code:desc",
  employee_location_checks: "created_at:desc,employee_code:asc",
  project_service_workflows: "project_code:desc,created_at:asc",
  payment_service_allocations: "created_at:asc,payment_code:asc,bill_code:asc",
  invoice_items: "sort_order:asc,created_at:asc,bill_code:asc",
  payment_invoice_allocations: "created_at:asc,payment_code:asc,invoice_code:asc",
  payment_receipts: "issued_at:desc,created_at:desc,payment_code:desc",
  project_contracts: "project_code:desc,created_at:desc",
  project_contract_services: "project_code:desc,created_at:asc",
  billing_milestones: "project_code:desc,sequence_no:asc,created_at:asc",
  billing_events: "created_at:desc,project_code:desc",
  billing_adjustments: "posted_at:desc,created_at:desc,project_code:desc",
  supervision_billing_rules: "project_code:desc,status:asc,created_at:desc",
  billing_gate_overrides: "created_at:desc,project_code:desc",
  website_analytics_visitors: "last_seen:desc,first_seen:desc",
  website_analytics_sessions: "last_activity:desc,started_at:desc",
  website_analytics_page_views: "visited_at:desc",
  website_analytics_location_events: "recorded_at:desc",
  website_analytics_interactions: "occurred_at:desc",
  website_leads: "created_at:desc,name:asc"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function verifyVercelOidc(req: Request) {
  const raw = req.headers.get("authorization") || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (!token) throw new Error("Missing Vercel OIDC token.");
  const decoded = decodeJwt(token);
  const issuer = String(decoded.iss || "");
  if (issuer !== TEAM_ISSUER && issuer !== GLOBAL_ISSUER) throw new Error("Untrusted OIDC issuer.");
  let payload: Record<string, unknown> | null = null;
  let lastError: unknown = null;
  for (const jwksUrl of [new URL("/.well-known/jwks", issuer), new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks`)]) {
    try {
      const result = await jwtVerify(token, createRemoteJWKSet(jwksUrl), { issuer, audience: AUDIENCE });
      payload = result.payload as Record<string, unknown>;
      break;
    } catch (error) { lastError = error; }
  }
  if (!payload) throw lastError instanceof Error ? lastError : new Error("OIDC verification failed.");
  const subject = String(payload.sub || "");
  const prefix = `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:`;
  if (!subject.startsWith(prefix)) throw new Error("OIDC token is not from the LAND VIEW project.");
  const environment = subject.slice(prefix.length);
  if (environment !== "production" && environment !== "preview") throw new Error("Unsupported Vercel environment.");
}

function secretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try { const keys = JSON.parse(modern); if (keys?.default) return String(keys.default); } catch {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server key is unavailable.");
}

async function db(path: string, init: RequestInit = {}, withMeta = false) {
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = secretKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("content-type", "application/json");
  if (key.split(".").length === 3) headers.set("authorization", `Bearer ${key}`);
  const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`Database ${response.status}: ${text.slice(0, 700)}`);
  const data = text ? JSON.parse(text) : null;
  return withMeta ? { data, contentRange: response.headers.get("content-range") || "" } : data;
}

function num(value: unknown, fallback = 0) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
function tableName(value: unknown) {
  const table = String(value || "").trim();
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Table "${table || "(empty)"}" is not available through the LAND VIEW data gateway.`);
  return table;
}
function safeColumn(value: unknown) {
  const column = String(value || "").trim();
  if (!/^[a-z][a-z0-9_]*$/i.test(column)) throw new Error("Invalid column name.");
  return column;
}
function safeSelect(value: unknown) {
  const select = String(value || "*").trim();
  if (!/^[a-zA-Z0-9_.*,()!:-]+$/.test(select)) throw new Error("Invalid select expression.");
  return select || "*";
}
function encodeEq(value: unknown) {
  if (value === null) return "is.null";
  if (typeof value === "boolean") return `eq.${value ? "true" : "false"}`;
  return `eq.${encodeURIComponent(String(value))}`;
}
function sanitizeTableRow(table: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = { ...(value as Record<string, unknown>) };
  if (table === "bills") delete row.net_amount;
  return row;
}
function sanitizeTableRows(table: string, rows: unknown[]) { return rows.map((row) => sanitizeTableRow(table, row)); }
function makeQuery(input: Record<string, unknown>) {
  const params: string[] = [`select=${encodeURIComponent(safeSelect(input.select))}`];
  const filters = input.filters && typeof input.filters === "object" ? input.filters as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(filters)) params.push(`${safeColumn(key)}=${encodeEq(value)}`);
  const inFilters = input.inFilters && typeof input.inFilters === "object" ? input.inFilters as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(inFilters)) {
    const values = Array.isArray(value) ? value : [];
    if (!values.length) continue;
    const joined = values.map((item) => `"${String(item).replace(/"/g, "")}"`).join(",");
    params.push(`${safeColumn(key)}=in.(${encodeURIComponent(joined)})`);
  }
  const requestedOrder = String(input.order || "").trim();
  const table = String(input.table || "").trim();
  const effectiveOrder = requestedOrder || DEFAULT_TABLE_ORDER[table] || "";
  if (effectiveOrder) {
    const orderParts = effectiveOrder.split(",").map((part) => part.trim()).filter(Boolean);
    const orders = orderParts.map((part) => {
      const [column, direction = "asc"] = part.split(":");
      return `${safeColumn(column)}.${direction.toLowerCase() === "desc" ? "desc" : "asc"}`;
    });
    if (orders.length) params.push(`order=${orders.join(",")}`);
  }
  const limit = Math.min(5000, Math.max(1, Math.trunc(num(input.limit, 1000))));
  const offset = Math.max(0, Math.trunc(num(input.offset, 0)));
  params.push(`limit=${limit}`);
  if (offset) params.push(`offset=${offset}`);
  return params.join("&");
}

const SITE_VISIT_BUCKET = "site-visit-media";
function safeStoragePath(value: unknown) {
  const path = String(value || "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || !/^[A-Za-z0-9._\-/]+$/.test(path) || !path.startsWith("site-visits/")) throw new Error("Invalid site visit media path.");
  return path;
}
function decodeBase64(value: unknown) {
  const raw = String(value || "");
  const cleaned = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  const bytes = Uint8Array.from(atob(cleaned), (char) => char.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Site visit photo exceeds the 8 MB limit.");
  return bytes;
}
async function uploadSiteVisitMedia(input: Record<string, unknown>) {
  const path = safeStoragePath(input.path);
  const mime = String(input.contentType || "").trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("Only JPG, PNG and WebP site visit photos are allowed.");
  const bytes = decodeBase64(input.base64);
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = secretKey();
  const response = await fetch(`${base}/storage/v1/object/${SITE_VISIT_BUCKET}/${encodeURI(path)}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": mime, "x-upsert": "true" }, body: bytes });
  const body = await response.text();
  if (!response.ok) throw new Error(`Storage upload ${response.status}: ${body.slice(0, 600)}`);
  return { path };
}
async function signedSiteVisitMediaUrl(input: Record<string, unknown>) {
  const path = safeStoragePath(input.path);
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = secretKey();
  const expires = Math.min(3600, Math.max(60, Math.trunc(num(input.expiresIn, 900))));
  const response = await fetch(`${base}/storage/v1/object/sign/${SITE_VISIT_BUCKET}/${encodeURI(path)}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: expires }) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.signedURL) throw new Error(`Storage signing ${response.status}`);
  const signed = String(body.signedURL);
  return { path, url: signed.startsWith("http") ? signed : `${base}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}` };
}
async function selectRowsPaged(input: Record<string, unknown>) {
  const table = tableName(input.table);
  const desired = Math.min(5000, Math.max(1, Math.trunc(num(input.limit, 1000))));
  let offset = Math.max(0, Math.trunc(num(input.offset, 0)));
  const rows: unknown[] = [];
  while (rows.length < desired) {
    const chunkLimit = Math.min(1000, desired - rows.length);
    const batch = await db(`${table}?${makeQuery({ ...input, table, limit: chunkLimit, offset })}`) as unknown[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < chunkLimit) break;
    offset += batch.length;
  }
  return rows;
}

async function handleAction(action: string, input: Record<string, unknown>) {
  if (action === "health") return { backend: "supabase", ok: true, version: 18, globalOrder: true, schemaValidated: true };
  if (action === "trackVisitorAnalytics") return await db("rpc/track_website_analytics_event", { method: "POST", body: JSON.stringify({ p: input }) });
  if (action === "applyBillingDiscount") return await db("rpc/apply_billing_discount", { method: "POST", body: JSON.stringify({ p_project_code: String(input.projectCode || input.projectId || "").trim(), p_category: String(input.category || "").trim(), p_amount: num(input.amount), p_discount_date: String(input.discountDate || "").trim() || null, p_notes: String(input.notes || "").trim() || null, p_created_by: String(input.createdBy || "").trim() || null, p_idempotency_key: String(input.idempotencyKey || "").trim() }) });
  if (action === "applyBillingWriteOff") return await db("rpc/apply_billing_writeoff", { method: "POST", body: JSON.stringify({ p_project_code: String(input.projectCode || input.projectId || "").trim(), p_category: String(input.category || "").trim(), p_amount: num(input.amount), p_writeoff_date: String(input.writeoffDate || input.date || "").trim() || null, p_reason: String(input.reason || "").trim(), p_notes: String(input.notes || "").trim(), p_created_by: String(input.createdBy || "").trim() || null, p_idempotency_key: String(input.idempotencyKey || "").trim() }) });
  if (action === "recoverBillingWriteOff") return await db("rpc/recover_billing_writeoff", { method: "POST", body: JSON.stringify({ p_project_code: String(input.projectCode || input.projectId || "").trim(), p_category: String(input.category || "").trim(), p_amount: num(input.amount), p_payment_date: String(input.paymentDate || input.date || "").trim() || null, p_payment_method: String(input.paymentMethod || "").trim() || null, p_deposit_account: String(input.depositAccount || "").trim() || null, p_reference_no: String(input.reference || input.referenceNo || "").trim() || null, p_notes: String(input.notes || "").trim() || null, p_created_by: String(input.createdBy || "").trim() || null, p_idempotency_key: String(input.idempotencyKey || "").trim() }) });
  if (action === "moveProjectToProposal") return await db("rpc/move_project_to_proposal", { method: "POST", body: JSON.stringify({ p_project_code: String(input.projectCode || input.projectId || "").trim(), p_created_by: String(input.createdBy || "").trim() || null }) });
  if (action === "uploadSiteVisitMedia") return await uploadSiteVisitMedia(input);
  if (action === "getSiteVisitMediaUrl") return await signedSiteVisitMediaUrl(input);
  if (action === "selectRows") return await selectRowsPaged(input);
  if (action === "countRows") {
    const table = tableName(input.table);
    const result = await db(`${table}?${makeQuery({ ...input, table, select: "*", limit: 1, offset: 0 })}`, { method: "GET", headers: { Prefer: "count=exact" } }, true) as any;
    const total = Number(String(result.contentRange || "").split("/")[1] || 0);
    return { count: Number.isFinite(total) ? total : 0 };
  }
  if (action === "upsertRows") {
    const table = tableName(input.table);
    const rows = Array.isArray(input.rows) ? input.rows : [input.row].filter(Boolean);
    if (!rows.length) return [];
    const conflict = input.onConflict ? `?on_conflict=${encodeURIComponent(String(input.onConflict))}` : "";
    return await db(`${table}${conflict}`, { method: "POST", headers: { Prefer: `resolution=merge-duplicates,return=${input.returnMinimal ? "minimal" : "representation"}` }, body: JSON.stringify(sanitizeTableRows(table, rows)) });
  }
  if (action === "insertRows") {
    const table = tableName(input.table);
    const rows = Array.isArray(input.rows) ? input.rows : [input.row].filter(Boolean);
    if (!rows.length) return [];
    return await db(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(sanitizeTableRows(table, rows)) });
  }
  if (action === "updateRows") {
    const table = tableName(input.table);
    const filters = input.filters && typeof input.filters === "object" ? input.filters as Record<string, unknown> : {};
    const clauses = Object.entries(filters).map(([key,value]) => `${safeColumn(key)}=${encodeEq(value)}`);
    if (!clauses.length) throw new Error("Update requires at least one filter.");
    return await db(`${table}?${clauses.join("&")}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(sanitizeTableRow(table, input.changes || {})) });
  }
  if (action === "deleteRows") {
    const table = tableName(input.table);
    const filters = input.filters && typeof input.filters === "object" ? input.filters as Record<string, unknown> : {};
    const clauses = Object.entries(filters).map(([key,value]) => `${safeColumn(key)}=${encodeEq(value)}`);
    if (!clauses.length) throw new Error("Delete requires at least one filter.");
    return await db(`${table}?${clauses.join("&")}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
  }
  throw new Error(`Unsupported Supabase data action: ${action}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    await verifyVercelOidc(req);
    const input = await req.json() as Record<string, unknown>;
    const data = await handleAction(String(input.action || "").trim(), input);
    return json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLike = /OIDC|issuer|token|LAND VIEW project|Vercel environment/i.test(message);
    return json({ success: false, error: message }, authLike ? 401 : 500);
  }
});