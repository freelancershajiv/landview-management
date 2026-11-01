function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
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
  if (!response.ok) throw new Error(`Database ${response.status}: ${raw.slice(0, 500)}`);
  return raw ? JSON.parse(raw) : null;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function authenticate(req: Request) {
  const token = String(req.headers.get("x-land-view-bot-token") || "").trim();
  if (!token || token.length > 512) throw new Error("UNAUTHORIZED");
  const hash = await sha256(token);
  const rows = await db(
    `whatsapp_bot_tokens?select=token_hash&token_hash=eq.${encodeURIComponent(hash)}&enabled=eq.true&limit=1`,
    { method: "GET" },
  ) as any[];
  if (!Array.isArray(rows) || !rows.length) throw new Error("UNAUTHORIZED");
}

function employeeFromSessionId(value: unknown) {
  const sessionId = String(value || "").trim().toLowerCase();
  const prefix = "land-view-employee-";
  if (!sessionId.startsWith(prefix)) return null;
  const employeeId = sessionId.slice(prefix.length).toUpperCase();
  if (!/^EMP-[A-Z0-9_-]+$/.test(employeeId)) return null;
  return { employeeId, sessionId };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    await authenticate(req);
    const input = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (String(input.action || "") !== "listPairedEmployeeSessions") {
      return json({ success: false, error: "Unsupported action." }, 400);
    }

    const rows = await db(
      "whatsapp_bot_auth?select=session_id,value&key_id=eq.creds&limit=5000",
      { method: "GET" },
    ) as any[];

    const unique = new Map<string, { employeeId: string; sessionId: string }>();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!String(row?.value?.me?.id || "").trim()) continue;
      const item = employeeFromSessionId(row?.session_id);
      if (item) unique.set(item.employeeId, item);
    }

    const employees = [...unique.values()].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    return json({ success: true, data: { employees, count: employees.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ success: false, error: "Unauthorized." }, 401);
    return json({ success: false, error: message }, 500);
  }
});
