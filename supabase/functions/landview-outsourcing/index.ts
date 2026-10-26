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

function text(value: unknown, max = 1800) {
  return String(value ?? "").trim().slice(0, max);
}

function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

function code(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function validDate(value: unknown, fallback = "") {
  const raw = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function dhakaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function activePayment(row: Row) {
  return text(row.status, 30).toUpperCase() !== "VOID";
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
    try {
      const keys = JSON.parse(modern);
      if (keys?.default) return String(keys.default);
    } catch {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server key is unavailable.");
}

async function db(path: string, init: RequestInit = {}) {
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = secretKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("content-type", "application/json");
  if (key.split(".").length === 3) headers.set("authorization", `Bearer ${key}`);
  const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
  const body = await response.text();
  if (!response.ok) throw new Error(`Database ${response.status}: ${body.slice(0, 700)}`);
  return body ? JSON.parse(body) : null;
}

function eq(value: unknown) {
  if (value === null) return "is.null";
  if (typeof value === "boolean") return `eq.${value ? "true" : "false"}`;
  return `eq.${encodeURIComponent(String(value))}`;
}

async function select(table: string, opts: { filters?: Row; order?: string; limit?: number } = {}) {
  const parts = ["select=*"];
  for (const [key, value] of Object.entries(opts.filters || {})) parts.push(`${key}=${eq(value)}`);
  if (opts.order) parts.push(`order=${opts.order}`);
  parts.push(`limit=${Math.min(5000, Math.max(1, opts.limit || 1000))}`);
  return (await db(`${table}?${parts.join("&")}`)) as Row[];
}

async function insert(table: string, row: Row) {
  return (await db(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  })) as Row[];
}

async function update(table: string, filters: Row, changes: Row) {
  const clauses = Object.entries(filters).map(([key, value]) => `${key}=${eq(value)}`);
  if (!clauses.length) throw new Error("Update requires a filter.");
  return (await db(`${table}?${clauses.join("&")}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(changes),
  })) as Row[];
}

async function snapshot() {
  const [parties, jobs, payments, projects] = await Promise.all([
    select("outsourcing_parties", { order: "active.desc,name.asc,created_at.desc", limit: 5000 }),
    select("outsourcing_jobs", { order: "assigned_date.desc,created_at.desc", limit: 5000 }),
    select("outsourcing_payments", { order: "payment_date.desc,created_at.desc", limit: 5000 }),
    select("projects", { order: "project_code.desc", limit: 5000 }),
  ]);

  const partyById = new Map(parties.map((row) => [String(row.id), row]));
  const projectById = new Map(projects.map((row) => [String(row.id), row]));
  const postedPayments = payments.filter(activePayment);
  const paidByJob = new Map<string, number>();
  for (const payment of postedPayments) {
    const key = String(payment.job_id || "");
    paidByJob.set(key, (paidByJob.get(key) || 0) + Number(payment.amount || 0));
  }

  const enrichedJobs = jobs.map((job) => {
    const paid = paidByJob.get(String(job.id)) || 0;
    const agreed = Number(job.agreed_amount || 0);
    const cancelled = text(job.status).toLowerCase() === "cancelled";
    const due = cancelled ? 0 : Math.max(0, agreed - paid);
    const project = projectById.get(String(job.project_id || "")) || {};
    const party = partyById.get(String(job.party_id || "")) || {};
    return {
      ...job,
      paid_amount: paid,
      due_amount: due,
      project_code: project.project_code || "",
      project_name: project.project_name || "",
      client_name: project.client_name_snapshot || "",
      party_name: party.name || "",
      party_type: party.party_type || "",
      preferred_payment_method: party.preferred_payment_method || "",
    };
  });

  const jobById = new Map(enrichedJobs.map((row) => [String(row.id), row]));
  const enrichedPayments = payments.map((payment) => {
    const job = jobById.get(String(payment.job_id || "")) || {};
    return {
      ...payment,
      job_code: job.job_code || "",
      service_type: job.service_type || "",
      project_code: job.project_code || "",
      party_name: job.party_name || "",
      finance_scope: job.finance_scope || "main",
    };
  });

  const partySummaries = parties.map((party) => {
    const partyJobs = enrichedJobs.filter((job) => String(job.party_id) === String(party.id));
    const effectiveJobs = partyJobs.filter((job) => text(job.status).toLowerCase() !== "cancelled");
    const agreed = effectiveJobs.reduce((sum, job) => sum + Number(job.agreed_amount || 0), 0);
    const paid = partyJobs.reduce((sum, job) => sum + Number(job.paid_amount || 0), 0);
    const due = effectiveJobs.reduce((sum, job) => sum + Number(job.due_amount || 0), 0);
    const activeJobs = effectiveJobs.filter((job) => text(job.status).toLowerCase() !== "completed").length;
    return { ...party, agreed_amount: agreed, paid_amount: paid, due_amount: due, active_jobs: activeJobs };
  });

  const effectiveJobs = enrichedJobs.filter((job) => text(job.status).toLowerCase() !== "cancelled");
  return {
    summary: {
      agreed: effectiveJobs.reduce((sum, job) => sum + Number(job.agreed_amount || 0), 0),
      paid: postedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      due: effectiveJobs.reduce((sum, job) => sum + Number(job.due_amount || 0), 0),
      activeJobs: effectiveJobs.filter((job) => text(job.status).toLowerCase() !== "completed").length,
      parties: parties.filter((party) => party.active !== false).length,
    },
    parties: partySummaries,
    jobs: enrichedJobs,
    payments: enrichedPayments,
    projects: projects.map((project) => ({
      id: project.id,
      project_code: project.project_code,
      project_name: project.project_name || "",
      client_name: project.client_name_snapshot || "",
    })),
  };
}

async function handle(input: Row) {
  const action = text(input.action, 80) || "snapshot";
  const actor = text(input.actor, 160) || "LAND VIEW";

  if (action === "snapshot") return await snapshot();

  if (action === "addParty") {
    const name = text(input.name, 250);
    if (!name) throw new Error("Enter the outsource person or firm name.");
    const rows = await insert("outsourcing_parties", {
      party_code: code("OUTP"),
      name,
      party_type: input.partyType === "Firm" ? "Firm" : "Individual",
      phone: text(input.phone, 80) || null,
      email: text(input.email, 180) || null,
      expertise: text(input.expertise, 500) || null,
      preferred_payment_method: text(input.preferredPaymentMethod, 120) || null,
      notes: text(input.notes, 1500) || null,
      active: true,
      created_by: actor,
    });
    return rows[0] || null;
  }

  if (action === "updateParty") {
    const id = text(input.id, 80);
    const found = await select("outsourcing_parties", { filters: { id }, limit: 1 });
    if (!found.length) throw new Error("Outsource person or firm was not found.");
    const changes: Row = {};
    if (input.name !== undefined) changes.name = text(input.name, 250) || found[0].name;
    if (input.partyType !== undefined) changes.party_type = input.partyType === "Firm" ? "Firm" : "Individual";
    if (input.phone !== undefined) changes.phone = text(input.phone, 80) || null;
    if (input.email !== undefined) changes.email = text(input.email, 180) || null;
    if (input.expertise !== undefined) changes.expertise = text(input.expertise, 500) || null;
    if (input.preferredPaymentMethod !== undefined) changes.preferred_payment_method = text(input.preferredPaymentMethod, 120) || null;
    if (input.notes !== undefined) changes.notes = text(input.notes, 1500) || null;
    if (input.active !== undefined) changes.active = Boolean(input.active);
    const rows = await update("outsourcing_parties", { id }, changes);
    return rows[0] || null;
  }

  if (action === "addJob") {
    const partyId = text(input.partyId, 80);
    const serviceType = text(input.serviceType, 250);
    const agreedAmount = num(input.agreedAmount);
    if (!partyId) throw new Error("Choose an outsource person or firm.");
    if (!serviceType) throw new Error("Enter the outsourced service.");
    if (!(agreedAmount >= 0)) throw new Error("Enter a valid agreed amount.");
    const party = await select("outsourcing_parties", { filters: { id: partyId }, limit: 1 });
    if (!party.length || party[0].active === false) throw new Error("Choose an active outsource person or firm.");

    let projectId: string | null = null;
    const projectCode = text(input.projectCode, 50).toUpperCase();
    if (projectCode) {
      const digits = projectCode.replace(/\D/g, "");
      const normalized = digits ? `LV-${String(Number(digits)).padStart(3, "0")}` : projectCode;
      const projects = await select("projects", { filters: { project_code: normalized }, limit: 1 });
      if (!projects.length) throw new Error(`Project ${normalized} was not found.`);
      projectId = projects[0].id;
    }

    const rows = await insert("outsourcing_jobs", {
      job_code: code("OUTJOB"),
      project_id: projectId,
      party_id: partyId,
      service_type: serviceType,
      scope_description: text(input.scopeDescription, 1800) || null,
      assigned_date: validDate(input.assignedDate, dhakaToday()),
      target_date: validDate(input.targetDate) || null,
      agreed_amount: agreedAmount,
      status: "Assigned",
      notes: text(input.notes, 1500) || null,
      created_by: actor,
    });
    return rows[0] || null;
  }

  if (action === "updateJob") {
    const id = text(input.id, 80);
    const found = await select("outsourcing_jobs", { filters: { id }, limit: 1 });
    if (!found.length) throw new Error("Outsourcing work was not found.");
    const changes: Row = {};
    if (input.status !== undefined) {
      const status = text(input.status, 40);
      if (!["Assigned", "In Progress", "Submitted", "Completed", "Cancelled"].includes(status)) throw new Error("Invalid work status.");
      changes.status = status;
      changes.completed_date = status === "Completed" ? validDate(input.completedDate, dhakaToday()) : null;
    }
    if (input.agreedAmount !== undefined) {
      const amount = num(input.agreedAmount);
      if (!(amount >= 0)) throw new Error("Enter a valid agreed amount.");
      const payments = await select("outsourcing_payments", { filters: { job_id: id }, limit: 5000 });
      const paid = payments.filter(activePayment).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      if (amount + 0.009 < paid) throw new Error(`Agreed amount cannot be below already paid amount (${paid.toFixed(2)}).`);
      changes.agreed_amount = amount;
    }
    if (input.targetDate !== undefined) changes.target_date = validDate(input.targetDate) || null;
    if (input.scopeDescription !== undefined) changes.scope_description = text(input.scopeDescription, 1800) || null;
    if (input.notes !== undefined) changes.notes = text(input.notes, 1500) || null;
    const rows = await update("outsourcing_jobs", { id }, changes);
    return rows[0] || null;
  }

  if (action === "addPayment") {
    const jobId = text(input.jobId, 80);
    const amount = num(input.amount);
    if (!jobId) throw new Error("Choose an outsourcing work item.");
    if (!(amount > 0)) throw new Error("Enter a payment amount greater than zero.");
    const jobs = await select("outsourcing_jobs", { filters: { id: jobId }, limit: 1 });
    if (!jobs.length) throw new Error("Outsourcing work was not found.");
    const job = jobs[0];
    if (text(job.status).toLowerCase() === "cancelled") throw new Error("Cancelled outsourcing work cannot receive a payment.");
    const existing = await select("outsourcing_payments", { filters: { job_id: jobId }, limit: 5000 });
    const alreadyPaid = existing.filter(activePayment).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const due = Math.max(0, Number(job.agreed_amount || 0) - alreadyPaid);
    if (amount > due + 0.009) throw new Error(`Payment exceeds the outstanding due of BDT ${due.toFixed(2)}.`);
    const rows = await insert("outsourcing_payments", {
      payment_code: code("OUTPAY"),
      job_id: jobId,
      payment_date: validDate(input.paymentDate, dhakaToday()),
      amount,
      payment_method: text(input.paymentMethod, 120) || "Cash",
      reference_no: text(input.referenceNo, 300) || null,
      notes: text(input.notes, 1500) || null,
      status: "POSTED",
      created_by: actor,
    });
    return rows[0] || null;
  }

  if (action === "voidPayment") {
    const id = text(input.id, 80);
    const found = await select("outsourcing_payments", { filters: { id }, limit: 1 });
    if (!found.length) throw new Error("Outsourcing payment was not found.");
    if (text(found[0].status).toUpperCase() === "VOID") return found[0];
    const rows = await update("outsourcing_payments", { id }, { status: "VOID" });
    return rows[0] || null;
  }

  throw new Error("Unsupported outsourcing action.");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    await verifyVercelOidc(req);
    const input = await req.json() as Row;
    const data = await handle(input);
    return json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLike = /OIDC|issuer|token|LAND VIEW project|Vercel environment/i.test(message);
    return json({ success: false, error: message }, authLike ? 401 : /not found/i.test(message) ? 404 : 400);
  }
});
