import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";

const TEAM_SLUG = "land-view";
const PROJECT_NAME = "landview-management";
const AUDIENCE = "https://supabase.landview.internal";
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const GLOBAL_ISSUER = "https://oidc.vercel.com";
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

type Row = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
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
  for (const jwksUrl of [
    new URL("/.well-known/jwks", issuer),
    new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks`),
  ]) {
    try {
      const result = await jwtVerify(token, createRemoteJWKSet(jwksUrl), { issuer, audience: AUDIENCE });
      payload = result.payload as Record<string, unknown>;
      break;
    } catch (error) {
      lastError = error;
    }
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

async function todoRow(todoCode: string) {
  const rows = await db(`todo_items?select=id,todo_code&todo_code=eq.${encodeURIComponent(todoCode)}&limit=1`);
  const todo = Array.isArray(rows) ? rows[0] : null;
  if (!todo) throw new Error("To Do item was not found.");
  return todo as Row;
}

async function listForTodo(todoCode: string) {
  await todoRow(todoCode);
  const [comments, attachments] = await Promise.all([
    db(`todo_comments?select=*&todo_code=eq.${encodeURIComponent(todoCode)}&order=created_at.asc&limit=500`),
    db(`todo_attachments?select=*&todo_code=eq.${encodeURIComponent(todoCode)}&order=created_at.desc&limit=500`),
  ]);
  return {
    comments: Array.isArray(comments) ? comments : [],
    attachments: Array.isArray(attachments) ? attachments : [],
  };
}

async function addComment(input: Row) {
  const todoCode = text(input.todoCode ?? input.todo_code, 80);
  const body = text(input.body, 4000);
  if (!todoCode) throw new Error("To Do code is required.");
  if (!body) throw new Error("Comment cannot be empty.");
  const todo = await todoRow(todoCode);
  const row = {
    todo_id: todo.id,
    todo_code: todoCode,
    body,
    author_user_key: text(input.authorUserKey ?? input.author_user_key, 200) || null,
    author_employee_id: text(input.authorEmployeeId ?? input.author_employee_id, 80) || null,
    author_name: text(input.authorName ?? input.author_name, 250) || null,
    author_role: text(input.authorRole ?? input.author_role, 80) || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const result = await db("todo_comments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result[0] : result;
}

async function addAttachment(input: Row) {
  const todoCode = text(input.todoCode ?? input.todo_code, 80);
  const fileName = text(input.fileName ?? input.file_name, 260);
  const fileId = text(input.fileId ?? input.file_id, 1200);
  const contentType = text(input.contentType ?? input.content_type, 180);
  const size = Number(input.sizeBytes ?? input.size_bytes ?? 0);
  if (!todoCode) throw new Error("To Do code is required.");
  if (!fileName || !fileId) throw new Error("Attachment file metadata is incomplete.");
  if (!fileId.startsWith("r2:todo-attachments/")) throw new Error("Attachment storage reference is invalid.");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) throw new Error("Attachment size is invalid.");
  const todo = await todoRow(todoCode);
  const row = {
    todo_id: todo.id,
    todo_code: todoCode,
    file_name: fileName,
    file_id: fileId,
    content_type: contentType || "application/octet-stream",
    size_bytes: Math.trunc(size),
    uploaded_by_user_key: text(input.uploadedByUserKey ?? input.uploaded_by_user_key, 200) || null,
    uploaded_by_employee_id: text(input.uploadedByEmployeeId ?? input.uploaded_by_employee_id, 80) || null,
    uploaded_by_name: text(input.uploadedByName ?? input.uploaded_by_name, 250) || null,
    uploaded_by_role: text(input.uploadedByRole ?? input.uploaded_by_role, 80) || null,
    created_at: new Date().toISOString(),
  };
  const result = await db("todo_attachments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result[0] : result;
}

async function getAttachment(input: Row) {
  const id = text(input.id, 80);
  if (!id) throw new Error("Attachment ID is required.");
  const rows = await db(`todo_attachments?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item) throw new Error("Attachment was not found.");
  return item;
}

async function deleteAttachment(input: Row) {
  const id = text(input.id, 80);
  const todoCode = text(input.todoCode ?? input.todo_code, 80);
  if (!id || !todoCode) throw new Error("Attachment ID and To Do code are required.");
  const result = await db(`todo_attachments?id=eq.${encodeURIComponent(id)}&todo_code=eq.${encodeURIComponent(todoCode)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!Array.isArray(result) || !result.length) throw new Error("Attachment was not found.");
  return result[0];
}

async function handleAction(input: Row) {
  const action = text(input.action, 80).toLowerCase();
  if (action === "health") return { ok: true, backend: "todo-collaboration", version: 1 };
  if (action === "list") {
    const todoCode = text(input.todoCode ?? input.todo_code, 80);
    if (!todoCode) throw new Error("To Do code is required.");
    return await listForTodo(todoCode);
  }
  if (action === "addcomment") return await addComment(input);
  if (action === "addattachment") return await addAttachment(input);
  if (action === "getattachment") return await getAttachment(input);
  if (action === "deleteattachment") return await deleteAttachment(input);
  throw new Error(`Unsupported To Do collaboration action: ${action || "(empty)"}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    await verifyVercelOidc(req);
    const input = await req.json() as Row;
    const data = await handleAction(input);
    return json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLike = /OIDC|issuer|token|LAND VIEW project|Vercel environment/i.test(message);
    return json({ success: false, error: message }, authLike ? 401 : 500);
  }
});
