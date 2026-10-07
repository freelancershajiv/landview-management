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
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function lower(value: unknown) {
  return clean(value, 500).toLowerCase();
}

async function verifyVercelOidc(req: Request) {
  const raw = req.headers.get("authorization") || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (!token) throw Object.assign(new Error("Missing Vercel OIDC token."), { status: 401 });

  const decoded = decodeJwt(token);
  const issuer = String(decoded.iss || "");
  if (issuer !== TEAM_ISSUER && issuer !== GLOBAL_ISSUER) {
    throw Object.assign(new Error("Untrusted OIDC issuer."), { status: 401 });
  }

  let payload: Record<string, unknown> | null = null;
  let lastError: unknown = null;
  for (const jwksUrl of [
    new URL("/.well-known/jwks", issuer),
    new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks`),
  ]) {
    try {
      payload = (await jwtVerify(token, createRemoteJWKSet(jwksUrl), {
        issuer,
        audience: AUDIENCE,
      })).payload as Record<string, unknown>;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!payload) {
    throw Object.assign(
      lastError instanceof Error ? lastError : new Error("OIDC verification failed."),
      { status: 401 },
    );
  }

  const subject = String(payload.sub || "");
  const prefix = `owner:${TEAM_SLUG}:project:${PROJECT_NAME}:environment:`;
  if (!subject.startsWith(prefix)) {
    throw Object.assign(new Error("OIDC token is not from the LAND VIEW project."), { status: 403 });
  }
  const environment = subject.slice(prefix.length);
  if (environment !== "production" && environment !== "preview") {
    throw Object.assign(new Error("Unsupported Vercel environment."), { status: 403 });
  }
}

function serverKey() {
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

function baseUrl() {
  return Deno.env.get("SUPABASE_URL") || "";
}

async function api(path: string, init: RequestInit = {}, bearer?: string) {
  const key = serverKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${bearer || key}`);

  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  const body = await response.text();
  let data: any = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = { message: body.slice(0, 500) };
  }

  if (!response.ok) {
    const error: any = new Error(
      String(data?.msg || data?.message || data?.error_description || data?.error || `Supabase Auth HTTP ${response.status}`),
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

async function rest(path: string, init: RequestInit = {}) {
  const key = serverKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("content-type", "application/json");
  headers.set("authorization", `Bearer ${key}`);

  const response = await fetch(`${baseUrl()}/rest/v1/${path}`, { ...init, headers });
  const body = await response.text();
  if (!response.ok) {
    const error: any = new Error(`Database ${response.status}: ${body.slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }
  return body ? JSON.parse(body) : null;
}

function legacyUser(row: Row) {
  return {
    userId: row.user_key,
    User_ID: row.user_key,
    username: row.username,
    Username: row.username,
    name: row.full_name,
    Name: row.full_name,
    role: row.role,
    Role: row.role,
    employeeId: row.employee_code || "",
    Employee_ID: row.employee_code || "",
    projectIds: row.project_ids || "",
    Project_IDs: row.project_ids || "",
    mustChangePassword: Boolean(row.must_change_password),
    Must_Change_Password: Boolean(row.must_change_password),
    Active: row.active ? "TRUE" : "FALSE",
  };
}

async function requireAdmin(accessToken: string) {
  if (!accessToken) {
    throw Object.assign(new Error("Authentication required."), { status: 401 });
  }

  const authUser = await api("/auth/v1/user", { method: "GET" }, accessToken);
  const authUserId = clean(authUser?.id, 100);
  if (!authUserId) throw Object.assign(new Error("Authentication required."), { status: 401 });

  const rows = await rest(
    `app_users?select=*&active=eq.true&auth_user_id=eq.${encodeURIComponent(authUserId)}&limit=1`,
  );
  const actor = rows?.[0];
  if (!actor) throw Object.assign(new Error("LAND VIEW account is not active."), { status: 401 });
  if (lower(actor.role) !== "admin") {
    throw Object.assign(new Error("Admin permission required."), { status: 403 });
  }
  return actor as Row;
}

async function findTarget(userId: string) {
  const rows = await rest(
    `app_users?select=*&user_key=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return (rows?.[0] || null) as Row | null;
}

async function patchAppUser(userKey: string, changes: Record<string, unknown>) {
  const rows = await rest(`app_users?user_key=eq.${encodeURIComponent(userKey)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() }),
  });
  if (!rows?.length) throw new Error("Could not update the LAND VIEW account profile.");
  return rows[0] as Row;
}

async function writeAudit(
  actor: Row,
  target: Row,
  fromRole: string,
  toRole: string,
  outcome = "success",
  extra: Record<string, unknown> = {},
) {
  try {
    await rest("app_audit_log", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        actor_user_key: clean(actor.user_key, 200) || null,
        action: "user.role_changed",
        target: clean(target.user_key, 200) || null,
        outcome,
        details: {
          from_role: fromRole,
          to_role: toRole,
          employee_code: clean(target.employee_code, 100) || null,
          username: clean(target.username, 160) || null,
          ...extra,
        },
        created_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Role changes must not fail only because the audit writer is temporarily unavailable.
  }
}

async function updateEmployeeRole(input: Record<string, unknown>) {
  const actor = await requireAdmin(String(input.accessToken || ""));
  const userId = clean(input.userId, 200);
  const nextRole = lower(input.role);

  if (!userId) throw Object.assign(new Error("User ID is required."), { status: 400 });
  if (nextRole !== "employee" && nextRole !== "manager") {
    throw Object.assign(new Error("Employees can only be assigned the Employee or Manager role."), { status: 400 });
  }

  const target = await findTarget(userId);
  if (!target) throw Object.assign(new Error("Target account was not found."), { status: 404 });
  if (!target.active) throw Object.assign(new Error("Inactive accounts cannot be promoted or demoted."), { status: 400 });
  if (!clean(target.employee_code, 100)) {
    throw Object.assign(new Error("This account is not linked to an employee record."), { status: 400 });
  }

  const previousRole = lower(target.role);
  if (previousRole !== "employee" && previousRole !== "manager") {
    throw Object.assign(new Error("Only Employee and Manager accounts can be changed here."), { status: 400 });
  }
  if (previousRole === nextRole) {
    return {
      updated: false,
      previousRole,
      role: nextRole,
      user: legacyUser(target),
    };
  }

  const authUserId = clean(target.auth_user_id, 100);
  if (!authUserId) throw new Error("Target account is not activated in Supabase Auth.");

  const authUser = await api(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: "GET",
  });
  const oldMetadata = authUser?.app_metadata || {};
  const changedAt = new Date().toISOString();
  const nextMetadata = {
    ...oldMetadata,
    user_key: target.user_key,
    role: nextRole,
    role_updated_at: changedAt,
    role_updated_by: actor.user_key,
  };

  await api(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: "PUT",
    body: JSON.stringify({ app_metadata: nextMetadata }),
  });

  let updated: Row;
  try {
    updated = await patchAppUser(target.user_key, { role: nextRole });
  } catch (error) {
    await api(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "PUT",
      body: JSON.stringify({ app_metadata: oldMetadata }),
    }).catch(() => null);
    await writeAudit(actor, target, previousRole, nextRole, "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await writeAudit(actor, updated, previousRole, nextRole, "success", {
    changed_at: changedAt,
  });

  return {
    updated: true,
    previousRole,
    role: nextRole,
    user: legacyUser(updated),
    sessionRefreshRequired: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    await verifyVercelOidc(req);
    const input = await req.json() as Record<string, unknown>;
    const action = clean(input.action, 60);
    if (action !== "updateEmployeeRole") {
      return json({ success: false, error: `Unsupported role action: ${action}` }, 400);
    }
    return json({ success: true, data: await updateEmployeeRole(input) });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const status = Number(error?.status || 0);
    const safeStatus = status >= 400 && status <= 599 ? status : 500;
    return json({ success: false, error: message }, safeStatus);
  }
});
