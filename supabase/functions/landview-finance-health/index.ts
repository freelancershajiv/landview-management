import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";

const TEAM_SLUG = "land-view";
const PROJECT_NAME = "landview-management";
const AUDIENCE = "https://supabase.landview.internal";
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const GLOBAL_ISSUER = "https://oidc.vercel.com";

type Row = Record<string, any>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
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

async function dbRows(table: string, select: string, order = "") {
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = secretKey();
  const rows: Row[] = [];
  let offset = 0;
  while (rows.length < 5000) {
    const params = new URLSearchParams({ select, limit: "1000", offset: String(offset) });
    if (order) params.set("order", order);
    const response = await fetch(`${base}/rest/v1/${table}?${params.toString()}`, {
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      cache: "no-store",
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Database ${response.status}: ${raw.slice(0, 700)}`);
    const batch = raw ? JSON.parse(raw) as Row[] : [];
    if (!Array.isArray(batch) || !batch.length) break;
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += batch.length;
  }
  return rows;
}

function effectivePayment(row: Row) {
  if (row.affects_business_balance === false) return false;
  if (normalized(row.transaction_type) === "personal income") return false;
  const status = normalized(row.approval_status || row.status);
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}

function transactionAmount(row: Row) {
  const direct = Math.abs(num(row.amount));
  if (direct > 0) return direct;
  return Math.max(Math.abs(num(row.debit)), Math.abs(num(row.credit)));
}

function duplicateFingerprint(row: Row) {
  return [
    text(row.transaction_date).slice(0, 10),
    normalized(row.project_code_snapshot),
    normalized(row.account_code_snapshot || row.account_snapshot),
    normalized(row.direction || row.transaction_type),
    transactionAmount(row).toFixed(2),
    normalized(row.reference_no),
    normalized(row.description),
  ].join("|");
}

function parseWhatsappBalance(message: unknown) {
  const match = text(message).match(/\*Current Balance:\*\s*BDT\s*(-?[\d,]+(?:\.\d+)?)/i);
  return match ? num(match[1]) : null;
}
function parseWhatsappTransaction(message: unknown) {
  const match = text(message).match(/\*Transaction:\*\s*([^\n]+)/i);
  return match ? text(match[1]) : "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    await verifyVercelOidc(req);

    const [payments, transactions, bills, projectSummaries, outbox, accountBalances] = await Promise.all([
      dbRows("payments", "id,payment_code,project_id,invoice_id,payment_date,amount,transaction_type,affects_business_balance,approval_status,status"),
      dbRows("transactions", "id,transaction_code,transaction_date,transaction_type,source_type,source_id,project_code_snapshot,account_code_snapshot,account_snapshot,category,description,debit,credit,direction,amount,reference_no,status", "transaction_date.desc"),
      dbRows("bills", "id,bill_code,bill_date,amount,discount,net_amount,status,description"),
      dbRows("project_management_summary", "id,project_id,supplier_advance,cheque_on_hold,updated_at"),
      dbRows("whatsapp_finance_outbox", "id,message,status,attempt_count,last_error,created_at,updated_at,sent_at", "created_at.desc"),
      dbRows("account_balances", "account_id,account_code,account_name,calculated_balance,current_balance_snapshot"),
    ]);

    const transactionSources = new Set<string>();
    for (const row of transactions) if (text(row.source_id)) transactionSources.add(text(row.source_id));

    const unreconciledPayments = payments.filter((row) => {
      if (!effectivePayment(row)) return false;
      const id = text(row.id), code = text(row.payment_code);
      return !(id && transactionSources.has(id)) && !(code && transactionSources.has(code));
    });

    const duplicateMap = new Map<string, Row[]>();
    for (const row of transactions) {
      if (/void|cancel|reject/.test(normalized(row.status))) continue;
      if (transactionAmount(row) <= 0) continue;
      const key = duplicateFingerprint(row);
      const bucket = duplicateMap.get(key) || [];
      bucket.push(row);
      duplicateMap.set(key, bucket);
    }
    const duplicateGroups = [...duplicateMap.values()]
      .filter((group) => group.length > 1)
      .sort((a, b) => b.length - a.length)
      .map((group) => ({
        count: group.length,
        amount: transactionAmount(group[0]),
        date: text(group[0].transaction_date).slice(0, 10),
        projectCode: text(group[0].project_code_snapshot),
        description: text(group[0].description || group[0].category),
        transactionCodes: group.map((item) => text(item.transaction_code)).filter(Boolean).slice(0, 8),
      }));

    const billMismatches = bills.map((row) => {
      const expected = num(row.amount) - num(row.discount);
      const stored = num(row.net_amount);
      return {
        billCode: text(row.bill_code),
        date: text(row.bill_date).slice(0, 10),
        description: text(row.description),
        gross: num(row.amount),
        discount: num(row.discount),
        expected,
        stored,
        difference: stored - expected,
      };
    }).filter((row) => Math.abs(row.difference) > 0.01);

    const accountMismatches = accountBalances
      .filter((row) => row.current_balance_snapshot !== null && row.current_balance_snapshot !== undefined)
      .map((row) => ({
        accountCode: text(row.account_code),
        accountName: text(row.account_name),
        calculated: num(row.calculated_balance),
        snapshot: num(row.current_balance_snapshot),
        difference: num(row.current_balance_snapshot) - num(row.calculated_balance),
      }))
      .filter((row) => Math.abs(row.difference) > 0.01);

    const sentLedgerMessages = outbox.filter((row) => normalized(row.status) === "sent" && /LAND VIEW\s+—\s+FINANCE LEDGER UPDATE/i.test(text(row.message)));
    const latestLedgerMessage = sentLedgerMessages.sort((a, b) => Date.parse(text(b.sent_at || b.updated_at || b.created_at)) - Date.parse(text(a.sent_at || a.updated_at || a.created_at)))[0] || null;
    const pendingOutbox = outbox.filter((row) => ["pending", "queued", "retrying", "processing"].includes(normalized(row.status)));
    const failedOutbox = outbox.filter((row) => normalized(row.status) === "failed");

    const supplierAdvance = projectSummaries.reduce((sum, row) => sum + num(row.supplier_advance), 0);
    const chequeOnHold = projectSummaries.reduce((sum, row) => sum + num(row.cheque_on_hold), 0);

    return json({ success: true, data: {
      generatedAt: new Date().toISOString(),
      projectManagement: { supplierAdvance, chequeOnHold, projects: projectSummaries.length },
      payments: {
        total: payments.length,
        unreconciledCount: unreconciledPayments.length,
        unreconciledAmount: unreconciledPayments.reduce((sum, row) => sum + Math.abs(num(row.amount)), 0),
        sample: unreconciledPayments.slice(0, 12).map((row) => ({ paymentCode: text(row.payment_code), date: text(row.payment_date).slice(0, 10), amount: num(row.amount) })),
      },
      transactions: {
        total: transactions.length,
        duplicateGroups: duplicateGroups.length,
        duplicateExtraRows: duplicateGroups.reduce((sum, group) => sum + Math.max(0, group.count - 1), 0),
        duplicates: duplicateGroups.slice(0, 10),
      },
      billingIntegrity: {
        totalBills: bills.length,
        mismatchCount: billMismatches.length,
        mismatchAmount: billMismatches.reduce((sum, row) => sum + Math.abs(row.difference), 0),
        mismatches: billMismatches.slice(0, 12),
      },
      accountBalances: {
        rows: accountBalances.length,
        mismatchCount: accountMismatches.length,
        mismatchAmount: accountMismatches.reduce((sum, row) => sum + Math.abs(row.difference), 0),
        mismatches: accountMismatches.slice(0, 12),
      },
      whatsapp: {
        pending: pendingOutbox.length,
        failed: failedOutbox.length,
        lastSentAt: latestLedgerMessage ? text(latestLedgerMessage.sent_at || latestLedgerMessage.updated_at || latestLedgerMessage.created_at) : "",
        latestLedgerBalance: latestLedgerMessage ? parseWhatsappBalance(latestLedgerMessage.message) : null,
        latestLedgerTransaction: latestLedgerMessage ? parseWhatsappTransaction(latestLedgerMessage.message) : "",
        latestLedgerMessageId: latestLedgerMessage ? text(latestLedgerMessage.id) : "",
        failedSample: failedOutbox.slice(0, 8).map((row) => ({ id: text(row.id), error: text(row.last_error), attempts: num(row.attempt_count) })),
      },
    }});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLike = /OIDC|issuer|token|LAND VIEW project|Vercel environment/i.test(message);
    return json({ success: false, error: message }, authLike ? 401 : 500);
  }
});
