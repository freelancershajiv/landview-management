function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
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
  const raw = await response.text();
  if (!response.ok) throw new Error(`Database ${response.status}: ${raw.slice(0, 600)}`);
  return raw ? JSON.parse(raw) : null;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(req: Request) {
  const token = String(req.headers.get("x-land-view-bot-token") || "").trim();
  if (!token || token.length > 512) throw new Error("UNAUTHORIZED");
  const hash = await sha256(token);
  const rows = await db(`whatsapp_bot_tokens?select=token_hash&token_hash=eq.${encodeURIComponent(hash)}&enabled=eq.true&limit=1`, { method: "GET" }) as any[];
  if (!Array.isArray(rows) || !rows.length) throw new Error("UNAUTHORIZED");
}

function clean(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}
function keyPart(value: unknown, max = 200) {
  const result = clean(value, max);
  if (!result || /[\u0000-\u001f]/.test(result)) throw new Error("Invalid key value.");
  return result;
}
function safePriority(value: unknown) {
  const priority = clean(value, 20).toLowerCase();
  if (!["critical", "important", "routine"].includes(priority)) throw new Error("Invalid WhatsApp priority.");
  return priority;
}
function moduleFor(eventKey: string, queue: string) {
  if (eventKey.startsWith("billing.")) return "Billing";
  if (eventKey.startsWith("finance.")) return "Finance";
  if (eventKey.startsWith("site.")) return "Site Visit";
  if (eventKey.startsWith("client.")) return "Client";
  if (eventKey.startsWith("contractor.")) return "Project Management";
  if (queue === "finance") return "Finance";
  if (queue === "site") return "Site Visit";
  return "Client";
}
function dhakaDayStartIso() {
  const shifted = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const utcStartShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(utcStartShifted - 6 * 60 * 60 * 1000).toISOString();
}

const queueTables: Record<string, string> = {
  finance: "whatsapp_finance_outbox",
  site: "whatsapp_site_visit_outbox",
  client: "whatsapp_client_outbox",
};

async function queueRows(queue: string, limit = 100) {
  const table = queueTables[queue];
  const fields = queue === "client"
    ? "id,conversation_id,to_jid,message,status,attempt_count,next_attempt_at,last_error,provider_message_id,dedupe_key,source,created_at,updated_at,sent_at,event_key,priority,recipient_group,template_key"
    : "id,dedupe_key,message,group_invite_code,status,attempt_count,next_attempt_at,last_error,provider_message_id,created_at,updated_at,sent_at,event_key,priority,recipient_group,template_key";
  return await db(`${table}?select=${fields}&order=created_at.desc&limit=${limit}`, { method: "GET" }) as any[];
}

async function countStatus(table: string, status: string, extra = "") {
  const rows = await db(`${table}?select=id&status=eq.${encodeURIComponent(status)}${extra}&limit=5000`, { method: "GET" }) as any[];
  return Array.isArray(rows) ? rows.length : 0;
}

async function opsState() {
  const [finance, site, client, conversations, rules, templates, groups] = await Promise.all([
    queueRows("finance", 120),
    queueRows("site", 120),
    queueRows("client", 120),
    db("whatsapp_client_conversations?select=id,client_name,project_code,phone_number&limit=1000", { method: "GET" }) as Promise<any[]>,
    db("whatsapp_notification_rules?select=event_key,label,module,enabled,priority,recipient_group_slug,template_key,updated_at&order=module.asc,label.asc", { method: "GET" }) as Promise<any[]>,
    db("whatsapp_templates?select=template_key,label,module,description,body,enabled,updated_at&order=module.asc,label.asc", { method: "GET" }) as Promise<any[]>,
    db("whatsapp_recipient_groups?select=slug,name,destination_kind,target,sender_employee_id,enabled,updated_at&order=name.asc", { method: "GET" }) as Promise<any[]>,
  ]);

  const conversationMap = new Map((conversations || []).map((row: any) => [String(row.id), row]));
  const normalize = (queue: string, row: any) => {
    const eventKey = clean(row.event_key, 100) || (queue === "site" ? "site.visit" : queue === "client" ? "client.project_update" : "finance.update");
    const conversation = queue === "client" ? conversationMap.get(String(row.conversation_id || "")) : null;
    return {
      id: row.id,
      queue,
      module: moduleFor(eventKey, queue),
      eventKey,
      priority: clean(row.priority, 20) || "routine",
      status: clean(row.status, 20) || "pending",
      attempts: Number(row.attempt_count || 0),
      message: clean(row.message, 4000),
      dedupeKey: clean(row.dedupe_key, 240) || null,
      recipientGroup: clean(row.recipient_group, 100) || null,
      destination: queue === "client" ? clean(row.to_jid, 200) : clean(row.group_invite_code, 200),
      clientName: conversation?.client_name || null,
      projectCode: conversation?.project_code || null,
      phoneNumber: conversation?.phone_number || null,
      source: clean(row.source, 80) || null,
      templateKey: clean(row.template_key, 100) || null,
      error: clean(row.last_error, 1000) || null,
      providerMessageId: clean(row.provider_message_id, 500) || null,
      nextAttemptAt: row.next_attempt_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      sentAt: row.sent_at || null,
    };
  };

  const messages = [
    ...(finance || []).map((row: any) => normalize("finance", row)),
    ...(site || []).map((row: any) => normalize("site", row)),
    ...(client || []).map((row: any) => normalize("client", row)),
  ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 200);

  const start = dhakaDayStartIso();
  const tables = Object.values(queueTables);
  const [pendingCounts, sendingCounts, failedCounts, suppressedCounts, sentTodayCounts] = await Promise.all([
    Promise.all(tables.map((table) => countStatus(table, "pending"))),
    Promise.all(tables.map((table) => countStatus(table, "sending"))),
    Promise.all(tables.map((table) => countStatus(table, "failed"))),
    Promise.all(tables.map((table) => countStatus(table, "suppressed"))),
    Promise.all(tables.map((table) => countStatus(table, "sent", `&sent_at=gte.${encodeURIComponent(start)}`))),
  ]);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  return {
    stats: {
      pending: sum(pendingCounts),
      sending: sum(sendingCounts),
      queued: sum(pendingCounts) + sum(sendingCounts),
      failed: sum(failedCounts),
      suppressed: sum(suppressedCounts),
      sentToday: sum(sentTodayCounts),
      retrying: messages.filter((m) => m.status === "pending" && m.attempts > 0).length,
    },
    messages,
    rules: rules || [],
    templates: templates || [],
    groups: groups || [],
    generatedAt: new Date().toISOString(),
  };
}

async function retryOne(input: Record<string, unknown>) {
  const queue = keyPart(input.queue, 20).toLowerCase();
  const table = queueTables[queue];
  if (!table) throw new Error("Unknown WhatsApp queue.");
  const id = keyPart(input.id, 100);
  const rows = await db(`${table}?select=id,status&id=eq.${encodeURIComponent(id)}&limit=1`, { method: "GET" }) as any[];
  const row = rows?.[0];
  if (!row) throw new Error("WhatsApp message was not found.");
  if (row.status === "sent") throw new Error("A sent WhatsApp message cannot be retried.");
  if (row.status === "suppressed") throw new Error("Enable its notification rule before retrying a suppressed message.");
  const now = new Date().toISOString();
  await db(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "pending", attempt_count: 0, next_attempt_at: now, last_error: null, updated_at: now }),
  });
  return { ok: true, queue, id };
}

async function retryAllFailed() {
  const now = new Date().toISOString();
  const results: Record<string, number> = {};
  for (const [queue, table] of Object.entries(queueTables)) {
    const rows = await db(`${table}?select=id&status=eq.failed&limit=5000`, { method: "GET" }) as any[];
    results[queue] = Array.isArray(rows) ? rows.length : 0;
    if (results[queue] > 0) {
      await db(`${table}?status=eq.failed`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "pending", attempt_count: 0, next_attempt_at: now, last_error: null, updated_at: now }),
      });
    }
  }
  return { ok: true, retried: results, total: Object.values(results).reduce((a, b) => a + b, 0) };
}

async function updateRule(input: Record<string, unknown>) {
  const eventKey = keyPart(input.eventKey, 100);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (input.priority !== undefined) patch.priority = safePriority(input.priority);
  if (input.recipientGroupSlug !== undefined) patch.recipient_group_slug = clean(input.recipientGroupSlug, 80) || null;
  if (input.templateKey !== undefined) patch.template_key = clean(input.templateKey, 80) || null;
  const rows = await db(`whatsapp_notification_rules?event_key=eq.${encodeURIComponent(eventKey)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  }) as any[];
  if (!rows?.length) throw new Error("Notification rule was not found.");
  return rows[0];
}

async function updateTemplate(input: Record<string, unknown>) {
  const templateKey = keyPart(input.templateKey, 80);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.body !== undefined) {
    const body = clean(input.body, 4000);
    if (!body || !body.includes("{{message}}")) throw new Error("Template must contain {{message}}.");
    patch.body = body;
  }
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  const rows = await db(`whatsapp_templates?template_key=eq.${encodeURIComponent(templateKey)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  }) as any[];
  if (!rows?.length) throw new Error("WhatsApp template was not found.");
  return rows[0];
}

async function updateGroup(input: Record<string, unknown>) {
  const slug = keyPart(input.slug, 80);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.target !== undefined) patch.target = clean(input.target, 300) || null;
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (input.senderEmployeeId !== undefined) patch.sender_employee_id = clean(input.senderEmployeeId, 80) || null;
  const rows = await db(`whatsapp_recipient_groups?slug=eq.${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  }) as any[];
  if (!rows?.length) throw new Error("Recipient group was not found.");
  return rows[0];
}

async function handle(action: string, input: Record<string, unknown>) {
  if (action === "health") return { ok: true, service: "landview-whatsapp-ops" };
  if (action === "state") return await opsState();
  if (action === "retry") return await retryOne(input);
  if (action === "retryAll") return await retryAllFailed();
  if (action === "updateRule") return await updateRule(input);
  if (action === "updateTemplate") return await updateTemplate(input);
  if (action === "updateGroup") return await updateGroup(input);
  throw new Error("Unsupported action.");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    await authenticate(req);
    const input = await req.json().catch(() => ({})) as Record<string, unknown>;
    const data = await handle(clean(input.action, 80), input);
    return json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ success: false, error: "Unauthorized." }, 401);
    return json({ success: false, error: message }, 500);
  }
});
