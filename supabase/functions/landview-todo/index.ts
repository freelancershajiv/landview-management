import { createRemoteJWKSet, decodeJwt, jwtVerify } from "npm:jose@6.1.0";

const TEAM_SLUG = "land-view";
const PROJECT_NAME = "landview-management";
const AUDIENCE = "https://supabase.landview.internal";
const TEAM_ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const GLOBAL_ISSUER = "https://oidc.vercel.com";

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

function todoCode() {
  return `TODO-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function status(value: unknown) {
  const raw = text(value, 40);
  return ["To Do", "In Progress", "Done"].includes(raw) ? raw : "To Do";
}

function priority(value: unknown) {
  const raw = text(value, 40);
  return ["Low", "Normal", "High", "Urgent"].includes(raw) ? raw : "Normal";
}

function referenceType(value: unknown, projectCode = "", proposalCode = "") {
  const raw = text(value, 40);
  if (raw === "Project" || raw === "Proposal" || raw === "None") return raw;
  if (proposalCode) return "Proposal";
  if (projectCode) return "Project";
  return "None";
}

function normalizeProjectCode(value: unknown) {
  const raw = text(value, 80).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/^(?:LV[-\s]?)?(\d+)$/);
  return match ? `LV-${String(Number(match[1])).padStart(3, "0")}` : raw;
}

function normalizeProposalCode(value: unknown) {
  return text(value, 100).toUpperCase();
}

function isoDate(value: unknown) {
  const raw = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
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

function cleanItem(input: Row, createdBy = "", isUpdate = false) {
  const now = new Date().toISOString();
  const nextStatus = status(input.status ?? input.Status);
  const rawProjectCode = normalizeProjectCode(input.projectCode ?? input.project_code ?? input.Project_ID);
  const rawProposalCode = normalizeProposalCode(input.proposalCode ?? input.proposal_code ?? input.Proposal_ID);
  const nextReferenceType = referenceType(input.referenceType ?? input.reference_type ?? input.Reference_Type, rawProjectCode, rawProposalCode);
  const projectCode = nextReferenceType === "Project" ? rawProjectCode : "";
  const proposalCode = nextReferenceType === "Proposal" ? rawProposalCode : "";

  if (nextReferenceType === "Project" && !projectCode) throw new Error("Project ID is required when linking a To Do to a project.");
  if (nextReferenceType === "Proposal" && !proposalCode) throw new Error("Proposal ID is required when linking a To Do to a proposal.");

  const item: Row = {
    title: text(input.title ?? input.Title, 240),
    description: text(input.description ?? input.Description, 4000) || null,
    status: nextStatus,
    priority: priority(input.priority ?? input.Priority),
    due_date: isoDate(input.dueDate ?? input.due_date ?? input.Due_Date),
    reference_type: nextReferenceType,
    project_code: projectCode || null,
    proposal_code: proposalCode || null,
    assigned_to: text(input.assignedTo ?? input.assigned_to ?? input.Assigned_To, 200) || null,
    updated_at: now,
    completed_at: nextStatus === "Done" ? now : null,
  };
  if (!item.title) throw new Error("Title is required.");
  if (!isUpdate) {
    item.todo_code = todoCode();
    item.created_by = text(createdBy, 200) || null;
    item.created_at = now;
  }
  return item;
}

async function handleAction(input: Row) {
  const action = text(input.action, 40).toLowerCase();
  if (action === "health") return { ok: true, backend: "standalone-todo", version: 2, references: ["None", "Project", "Proposal"] };
  if (action === "list") {
    return await db("todo_items?select=*&order=updated_at.desc,created_at.desc&limit=2000");
  }
  if (action === "create") {
    const raw = input.item && typeof input.item === "object" ? input.item as Row : input;
    const row = cleanItem(raw, text(input.createdBy, 200), false);
    const result = await db("todo_items", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    return Array.isArray(result) ? result[0] : result;
  }
  if (action === "update") {
    const code = text(input.todoCode ?? input.todo_code, 80);
    if (!code) throw new Error("To Do code is required.");
    const raw = input.item && typeof input.item === "object" ? input.item as Row : input;
    const row = cleanItem(raw, "", true);
    const result = await db(`todo_items?todo_code=eq.${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!Array.isArray(result) || !result.length) throw new Error("To Do item not found.");
    return result[0];
  }
  if (action === "delete") {
    const code = text(input.todoCode ?? input.todo_code, 80);
    if (!code) throw new Error("To Do code is required.");
    const result = await db(`todo_items?todo_code=eq.${encodeURIComponent(code)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    if (!Array.isArray(result) || !result.length) throw new Error("To Do item not found.");
    return { deleted: true, todoCode: code };
  }
  throw new Error(`Unsupported To Do action: ${action || "(empty)"}`);
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
