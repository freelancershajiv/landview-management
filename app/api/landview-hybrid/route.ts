import { createHmac, timingSafeEqual } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../landview/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_COOKIE = "landview_data_user";
const DATA_COOKIE_AGE = 5 * 60;
const SUPABASE_DATA_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-data";
const SUPABASE_AUDIENCE = "https://supabase.landview.internal";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

const FAST_GET_ACTIONS = new Set(["getProjects", "getProject", "getEmployees"]);
const MIRROR_POST_ACTIONS = new Set([
  "createProject",
  "updateProject",
  "deleteProject",
  "createEmployee",
  "updateEmployee",
  "deleteEmployee",
]);

function roleOf(user: Record<string, unknown> | null | undefined) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

function sign(value: string) {
  return createHmac("sha256", PROXY_SECRET).update(`supabase-user-v1|${value}`).digest("hex");
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function encodeUser(user: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeUser(value: string | undefined) {
  if (!value || !PROXY_SECRET) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!secureEqual(signature, sign(payload))) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return user && typeof user === "object" ? (user as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function dataCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DATA_COOKIE_AGE,
    priority: "high" as const,
  };
}

async function readLegacySession(request: NextRequest) {
  const url = new URL(request.url);
  url.pathname = "/api/landview";
  url.search = "";
  url.searchParams.set("action", "getSession");
  const sessionRequest = new NextRequest(url, { method: "GET", headers: new Headers(request.headers) });
  const response = await legacyGET(sessionRequest);
  const json = await response.clone().json().catch(() => null);
  if (!response.ok || !json?.success || !json?.data?.authenticated || !json?.data?.user) return null;
  return json.data.user as Record<string, unknown>;
}

async function authorizedUser(request: NextRequest) {
  const cached = decodeUser(request.cookies.get(DATA_COOKIE)?.value);
  if (cached) return cached;
  return readLegacySession(request);
}

async function callSupabase(action: string, input: Record<string, unknown>) {
  const oidc = await getVercelOidcToken({ audience: SUPABASE_AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(SUPABASE_DATA_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidc}`,
      "content-type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ action, ...input }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || `Supabase data service returned HTTP ${response.status}.`));
  }
  return json.data;
}

function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
}

export async function GET(request: NextRequest) {
  const action = String(request.nextUrl.searchParams.get("action") || "").trim();
  if (!FAST_GET_ACTIONS.has(action)) return legacyGET(request);

  try {
    const user = await authorizedUser(request);
    const role = roleOf(user);
    if (!user || (role !== "admin" && role !== "manager")) return legacyGET(request);

    const input: Record<string, unknown> = {};
    request.nextUrl.searchParams.forEach((value, key) => { if (key !== "action") input[key] = value; });
    const data = await callSupabase(action, input);
    const response = NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Landview-Data": "supabase" } },
    );
    response.cookies.set(DATA_COOKIE, encodeUser(user), dataCookieOptions());
    return response;
  } catch (error) {
    console.warn("LAND VIEW Supabase read failed; using Apps Script fallback", {
      action,
      message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180),
    });
    return legacyGET(request);
  }
}

async function mirrorWrite(action: string, input: Record<string, unknown>, sourceData: unknown) {
  if (!MIRROR_POST_ACTIONS.has(action)) return;
  if (action === "deleteProject") {
    await callSupabase("deleteProject", { projectId: input.projectId || input.Project_ID });
    return;
  }
  if (action === "deleteEmployee") {
    await callSupabase("deleteEmployee", { employeeId: input.employeeId || input.Employee_ID });
    return;
  }
  if (action === "createProject" || action === "updateProject") {
    const source = sourceData && typeof sourceData === "object" ? sourceData as Record<string, unknown> : {};
    await callSupabase("syncProject", { record: { ...input, ...source } });
    return;
  }
  if (action === "createEmployee" || action === "updateEmployee") {
    const source = sourceData && typeof sourceData === "object" ? sourceData as Record<string, unknown> : {};
    await callSupabase("syncEmployee", { record: { ...input, ...source } });
  }
}

export async function POST(request: NextRequest) {
  const copy = request.clone();
  const input = await copy.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(input.action || "").trim();
  const response = await legacyPOST(request);

  if (!response.ok || !MIRROR_POST_ACTIONS.has(action)) return response;
  const json = await response.clone().json().catch(() => null);
  if (!json?.success) return response;

  try {
    const user = await authorizedUser(copy as unknown as NextRequest);
    const role = roleOf(user);
    if (user && (role === "admin" || role === "manager")) {
      await mirrorWrite(action, input, json.data);
    }
  } catch (error) {
    console.warn("LAND VIEW Supabase mirror failed; Apps Script write remains authoritative", {
      action,
      message: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180),
    });
  }

  return response;
}
