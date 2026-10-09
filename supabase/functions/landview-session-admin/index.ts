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
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function bool(value: unknown) {
  return value === true || ["true", "1", "yes", "on"].includes(text(value, 20).toLowerCase());
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
  const raw = await response.text();
  if (!response.ok) throw new Error(`Database ${response.status}: ${raw.slice(0, 700)}`);
  return raw ? JSON.parse(raw) : null;
}

function sessionKey(value: unknown) {
  const key = text(value, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new Error("A valid session ID is required.");
  }
  return key;
}

async function listSessions() {
  const select = [
    "session_key", "user_id", "username", "full_name", "role", "employee_code", "project_ids",
    "remembered", "active", "created_at", "last_seen_at", "expires_at", "auth_not_after",
    "revoked_at", "device_id", "ip_address", "user_agent",
  ].join(",");
  return await db(`app_sessions?select=${encodeURIComponent(select)}&order=last_seen_at.desc&limit=500`, { method: "GET" });
}

async function annotateSession(input: Row) {
  const key = sessionKey(input.sessionKey || input.sessionId);
  const changes = {
    device_id: text(input.deviceId, 180) || null,
    ip_address: text(input.ipAddress, 180) || null,
    user_agent: text(input.userAgent, 1200) || null,
    remembered: bool(input.remembered),
    last_seen_at: new Date().toISOString(),
  };
  return await db(`app_sessions?session_key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(changes),
  });
}

async function terminateSession(input: Row) {
  const key = sessionKey(input.sessionKey || input.sessionId);
  const result = await db("rpc/terminate_app_auth_session", {
    method: "POST",
    body: JSON.stringify({ p_session_key: key }),
  });
  return { terminated: result === true, sessionId: key };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    await verifyVercelOidc(req);
    const input = await req.json() as Row;
    const action = text(input.action, 60);

    let data: unknown;
    if (action === "list") data = await listSessions();
    else if (action === "annotate") data = await annotateSession(input);
    else if (action === "terminate") data = await terminateSession(input);
    else throw new Error("Unsupported session administration action.");

    return json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLike = /OIDC|issuer|token|LAND VIEW project|Vercel environment/i.test(message);
    const invalid = /valid session ID|required/i.test(message);
    return json({ success: false, error: message }, authLike ? 401 : invalid ? 400 : 500);
  }
});
