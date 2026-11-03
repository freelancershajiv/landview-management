import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";

const TEAM_SLUG = "land-view";
const PROJECT_NAME = "landview-management";
const AUDIENCE = "https://supabase.landview.internal";
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const GLOBAL_ISSUER = "https://oidc.vercel.com";

type Row = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(value: unknown, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function number(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }

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
  if (modern) { try { const keys = JSON.parse(modern); if (keys?.default) return String(keys.default); } catch {} }
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

async function todoRow(todoCode: string) {
  const rows = await db(`todo_items?select=id,todo_code&todo_code=eq.${encodeURIComponent(todoCode)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error("To Do item was not found.");
  return row as Row;
}

async function list(todoCode: string) {
  await todoRow(todoCode);
  const rows = await db(`todo_subtasks?select=*&todo_code=eq.${encodeURIComponent(todoCode)}&order=sort_order.asc,created_at.asc&limit=500`);
  return Array.isArray(rows) ? rows : [];
}

async function create(input: Row) {
  const todoCode = text(input.todoCode ?? input.todo_code, 80);
  const title = text(input.title, 500);
  if (!todoCode) throw new Error("To Do code is required.");
  if (!title) throw new Error("Checklist item cannot be empty.");
  const todo = await todoRow(todoCode);
  const existing = await list(todoCode) as Row[];
  const maxOrder = existing.reduce((max, row) => Math.max(max, number(row.sort_order, 0)), -10);
  const now = new Date().toISOString();
  const row = {
    todo_id: todo.id,
    todo_code: todoCode,
    title,
    sort_order: maxOrder + 10,
    is_completed: false,
    created_by_user_key: text(input.actorUserKey, 200) || null,
    created_by_name: text(input.actorName, 250) || null,
    created_by_role: text(input.actorRole, 80) || null,
    created_at: now,
    updated_at: now,
  };
  const result = await db("todo_subtasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  return Array.isArray(result) ? result[0] : result;
}

async function getItem(id: string, todoCode = "") {
  if (!id) throw new Error("Checklist item ID is required.");
  const filter = todoCode ? `&todo_code=eq.${encodeURIComponent(todoCode)}` : "";
  const rows = await db(`todo_subtasks?select=*&id=eq.${encodeURIComponent(id)}${filter}&limit=1`);
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item) throw new Error("Checklist item was not found.");
  return item as Row;
}

async function rename(input: Row) {
  const id = text(input.id, 80);
  const todoCode = text(input.todoCode, 80);
  const title = text(input.title, 500);
  if (!title) throw new Error("Checklist item cannot be empty.");
  await getItem(id, todoCode);
  const result = await db(`todo_subtasks?id=eq.${encodeURIComponent(id)}&todo_code=eq.${encodeURIComponent(todoCode)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
  });
  return Array.isArray(result) ? result[0] : result;
}

async function toggle(input: Row) {
  const id = text(input.id, 80);
  const todoCode = text(input.todoCode, 80);
  const completed = input.completed === true;
  await getItem(id, todoCode);
  const now = new Date().toISOString();
  const changes = completed ? {
    is_completed: true,
    completed_at: now,
    completed_by_user_key: text(input.actorUserKey, 200) || null,
    completed_by_employee_id: text(input.actorEmployeeId, 80) || null,
    completed_by_name: text(input.actorName, 250) || null,
    completed_by_role: text(input.actorRole, 80) || null,
    updated_at: now,
  } : {
    is_completed: false,
    completed_at: null,
    completed_by_user_key: null,
    completed_by_employee_id: null,
    completed_by_name: null,
    completed_by_role: null,
    updated_at: now,
  };
  const result = await db(`todo_subtasks?id=eq.${encodeURIComponent(id)}&todo_code=eq.${encodeURIComponent(todoCode)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(changes),
  });
  return Array.isArray(result) ? result[0] : result;
}

async function remove(input: Row) {
  const id = text(input.id, 80);
  const todoCode = text(input.todoCode, 80);
  const item = await getItem(id, todoCode);
  const result = await db(`todo_subtasks?id=eq.${encodeURIComponent(id)}&todo_code=eq.${encodeURIComponent(todoCode)}`, {
    method: "DELETE", headers: { Prefer: "return=representation" },
  });
  if (!Array.isArray(result) || !result.length) throw new Error("Checklist item was not found.");
  return item;
}

async function reorder(input: Row) {
  const todoCode = text(input.todoCode, 80);
  if (!todoCode) throw new Error("To Do code is required.");
  await todoRow(todoCode);
  const ids = Array.isArray(input.ids) ? input.ids.map((value) => text(value, 80)).filter(Boolean) : [];
  const current = await list(todoCode) as Row[];
  const currentIds = current.map((row) => text(row.id, 80));
  if (ids.length !== currentIds.length || ids.some((id) => !currentIds.includes(id))) throw new Error("Checklist order is stale. Refresh and try again.");
  const now = new Date().toISOString();
  for (let index = 0; index < ids.length; index += 1) {
    await db(`todo_subtasks?id=eq.${encodeURIComponent(ids[index])}&todo_code=eq.${encodeURIComponent(todoCode)}`, {
      method: "PATCH", body: JSON.stringify({ sort_order: index * 10, updated_at: now }),
    });
  }
  return await list(todoCode);
}

async function handleAction(input: Row) {
  const action = text(input.action, 80).toLowerCase();
  if (action === "health") return { ok: true, backend: "todo-subtasks", version: 1 };
  if (action === "list") {
    const todoCode = text(input.todoCode ?? input.todo_code, 80);
    if (!todoCode) throw new Error("To Do code is required.");
    return await list(todoCode);
  }
  if (action === "create") return await create(input);
  if (action === "rename") return await rename(input);
  if (action === "toggle") return await toggle(input);
  if (action === "delete") return await remove(input);
  if (action === "reorder") return await reorder(input);
  throw new Error(`Unsupported To Do subtask action: ${action || "(empty)"}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    await verifyVercelOidc(req);
    const input = await req.json() as Row;
    return json({ success: true, data: await handleAction(input) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLike = /OIDC|issuer|token|LAND VIEW project|Vercel environment/i.test(message);
    return json({ success: false, error: message }, authLike ? 401 : 500);
  }
});
