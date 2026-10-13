import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, SESSION_COOKIE, requireOriginalLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { selectRows, updateRows } from "@/lib/supabase-data";
import { supabaseSessionAdmin } from "@/lib/supabase-session-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const ALLOWED_ROLES = new Set(["admin", "manager", "employee"]);

function text(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function millis(value: unknown) {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function sessionIdFromToken(token: string) {
  try {
    const part = token.split(".")[1];
    if (!part) return "";
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Row;
    return text(payload.session_id, 80);
  } catch {
    return "";
  }
}

function clientIp(request: NextRequest) {
  return text(
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") || "",
    180,
  );
}

function describeUserAgent(value: unknown) {
  const ua = text(value, 1200);
  if (!ua) return { deviceName: "Unknown device", browser: "", os: "" };
  if (/SupabaseEdgeRuntime|\bDeno\//i.test(ua)) return { deviceName: "Supabase Auth session", browser: "Auth service", os: "Server-recorded" };
  const browser = /Edg\//i.test(ua) ? "Microsoft Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /CriOS\//i.test(ua) ? "Chrome iOS"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari"
    : "Browser";
  const os = /Windows NT/i.test(ua) ? "Windows"
    : /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iPod/i.test(ua) ? "iOS / iPadOS"
    : /Mac OS X/i.test(ua) ? "macOS"
    : /Linux/i.test(ua) ? "Linux"
    : "Unknown OS";
  const deviceName = /Mobile|Android|iPhone|iPad|iPod/i.test(ua) ? "Mobile device" : "Desktop / laptop";
  return { deviceName, browser, os };
}

function stripPositionMarker(value: unknown) {
  return text(value, 6000)
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("__POSITION__:"))
    .join("\n")
    .trim();
}

function positionFromBio(value: unknown) {
  const marker = text(value, 6000).split(/\r?\n/).find((line) => line.trim().startsWith("__POSITION__:"));
  return marker ? marker.replace("__POSITION__:", "").trim() : "";
}

function buildPublicBio(position: string, bio: string) {
  return [position.trim() ? `__POSITION__:${position.trim()}` : "", stripPositionMarker(bio)]
    .filter(Boolean)
    .join("\n");
}

function accountView(row: Row | null, user: Row, role: string, employeeCode: string) {
  const source = row || {};
  return {
    userId: text(source.user_key || user.userId || user.User_ID || user.username || user.Username),
    username: text(source.username || user.username || user.Username),
    fullName: text(source.full_name || user.name || user.Name),
    role: text(source.role || role),
    employeeCode,
    authEmail: text(source.auth_email),
    active: source.active !== false,
    createdAt: text(source.created_at),
    updatedAt: text(source.updated_at),
  };
}

function employeeView(row: Row | null, employeeCode: string) {
  const source = row || {};
  const publicBio = text(source.public_bio, 6000);
  return {
    employeeCode,
    name: text(source.name, 240),
    phone: text(source.phone_number, 120),
    email: text(source.email, 240),
    designation: text(source.designation, 180),
    department: text(source.department, 180),
    joiningDate: text(source.joining_date, 40),
    status: text(source.status, 80),
    publicDisplay: Boolean(source.public_display),
    publicTitle: text(source.public_title, 120),
    position: positionFromBio(publicBio),
    bio: stripPositionMarker(publicBio),
    photoUrl: text(source.photo_url, 4000),
    linkedinUrl: text(source.linkedin_url, 4000),
  };
}

async function accountContext(request: NextRequest) {
  const user = await requireOriginalLocalSession(request) as Row | null;
  if (!user) throw Object.assign(new Error("Session expired."), { status: 401 });
  const role = roleOf(user);
  if (!ALLOWED_ROLES.has(role)) throw Object.assign(new Error("Account maintenance is available to Admin, Manager and Employee accounts."), { status: 403 });

  const userKey = userIdOf(user);
  let accountRows = userKey ? await selectRows("app_users", { filters: { user_key: userKey }, limit: 1 }) : [];
  if (!accountRows.length) {
    const username = text(user.username || user.Username);
    if (username) accountRows = await selectRows("app_users", { filters: { username }, limit: 1 });
  }
  const account = (accountRows[0] || null) as Row | null;
  const employeeCode = role === "admin"
    ? "EMP-0002"
    : text(account?.employee_code || user.employeeId || user.Employee_ID || (/^EMP-/i.test(userKey) ? userKey : ""), 80).toUpperCase();
  const employeeRows = employeeCode ? await selectRows("employees", { filters: { employee_code: employeeCode }, limit: 1 }) : [];
  const employee = (employeeRows[0] || null) as Row | null;
  return { user, role, userKey, account, employeeCode, employee };
}

function belongsToAccount(row: Row, userKey: string, username: string, employeeCode: string) {
  const candidates = new Set([userKey, username, employeeCode].map((value) => text(value).toLowerCase()).filter(Boolean));
  return candidates.has(text(row.user_id).toLowerCase()) || candidates.has(text(row.username).toLowerCase());
}

function sessionEmployeeIdentity(role: string, employeeCode: string) {
  // Admin's EMP-0002 record is its display/profile identity only. The Admin login
  // is still the separate `admin` authentication account and must never inherit
  // EMP-0002 employee login sessions.
  return role === "admin" ? "" : employeeCode;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await accountContext(request);
    const token = request.cookies.get(SESSION_COOKIE)?.value || "";
    const currentSessionId = sessionIdFromToken(token);

    if (currentSessionId) {
      await supabaseSessionAdmin("annotate", {
        sessionId: currentSessionId,
        deviceId: request.cookies.get(DEVICE_COOKIE)?.value || "",
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent") || "",
        remembered: false,
      }).catch(() => null);
    }

    const username = text(ctx.account?.username || ctx.user.username || ctx.user.Username || ctx.userKey);
    const sessionEmployeeCode = sessionEmployeeIdentity(ctx.role, ctx.employeeCode);
    const allRows = await supabaseSessionAdmin<Row[]>("list");
    const ownRows = (Array.isArray(allRows) ? allRows : []).filter((row) => belongsToAccount(row, ctx.userKey, username, sessionEmployeeCode));
    const now = Date.now();
    const sessions = ownRows.map((row) => {
      const device = describeUserAgent(row.user_agent);
      const expiresAt = millis(row.auth_not_after || row.expires_at);
      const signedIn = row.active === true && !row.revoked_at && (!expiresAt || expiresAt > now);
      return {
        sessionId: text(row.session_key),
        deviceId: text(row.device_id),
        deviceName: device.deviceName,
        browser: device.browser,
        os: device.os,
        ipAddress: text(row.ip_address).replace(/\/32$/, ""),
        createdAt: millis(row.created_at),
        lastSeenAt: millis(row.last_seen_at),
        expiresAt,
        active: signedIn,
        current: Boolean(currentSessionId && text(row.session_key) === currentSessionId),
        revokedAt: millis(row.revoked_at),
      };
    }).sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || b.lastSeenAt - a.lastSeenAt);

    return NextResponse.json({ success: true, data: {
      role: ctx.role,
      account: accountView(ctx.account, ctx.user, ctx.role, ctx.employeeCode),
      profile: employeeView(ctx.employee, ctx.employeeCode),
      capabilities: { canEditWorkProfile: ctx.role === "admin" },
      sessions,
      sessionMeta: {
        source: "Supabase Auth",
        signedInCount: sessions.filter((item) => item.active).length,
        historyCount: sessions.length,
        generatedAt: new Date().toISOString(),
      },
    } }, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load account maintenance." }, { status: Number(error?.status) || 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const ctx = await accountContext(request);
    if (!ctx.employeeCode || !ctx.employee) return NextResponse.json({ success: false, error: "No employee profile is linked to this account." }, { status: 404 });
    const body = await request.json() as Row;
    const name = text(body.name, 240);
    if (!name) return NextResponse.json({ success: false, error: "Full name is required." }, { status: 400 });

    const existingPosition = positionFromBio(ctx.employee.public_bio);
    const position = ctx.role === "admin" ? text(body.position, 180) : existingPosition;
    const changes: Row = {
      name,
      phone_number: text(body.phone, 120) || null,
      email: text(body.email, 240) || null,
      public_title: text(body.publicTitle, 120) || null,
      public_bio: buildPublicBio(position, text(body.bio, 5000)) || null,
      photo_url: text(body.photoUrl, 4000) || null,
      linkedin_url: text(body.linkedinUrl, 4000) || null,
      updated_at: new Date().toISOString(),
    };
    if (ctx.role === "admin") {
      changes.department = text(body.department, 180) || null;
      changes.designation = text(body.designation, 180) || ctx.employee.designation || null;
    }

    const updatedRows = await updateRows("employees", { employee_code: ctx.employeeCode }, changes);
    if (ctx.role !== "admin" && ctx.userKey) {
      await updateRows("app_users", { user_key: ctx.userKey }, { full_name: name, updated_at: new Date().toISOString() }).catch(() => null);
    }
    const updated = (updatedRows[0] || { ...ctx.employee, ...changes }) as Row;
    return NextResponse.json({ success: true, data: { profile: employeeView(updated, ctx.employeeCode) } }, { headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update account profile." }, { status: Number(error?.status) || 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const ctx = await accountContext(request);
    const body = await request.json() as Row;
    const action = text(body.action, 40).toLowerCase();
    if (action !== "terminate") return NextResponse.json({ success: false, error: "Unsupported account action." }, { status: 400 });

    const sessionId = text(body.sessionId, 80);
    if (!sessionId) return NextResponse.json({ success: false, error: "Session ID is required." }, { status: 400 });
    const currentSessionId = sessionIdFromToken(request.cookies.get(SESSION_COOKIE)?.value || "");
    if (sessionId === currentSessionId) return NextResponse.json({ success: false, error: "Use Sign out to end the current device session." }, { status: 400 });

    const username = text(ctx.account?.username || ctx.user.username || ctx.user.Username || ctx.userKey);
    const sessionEmployeeCode = sessionEmployeeIdentity(ctx.role, ctx.employeeCode);
    const allRows = await supabaseSessionAdmin<Row[]>("list");
    const target = (Array.isArray(allRows) ? allRows : []).find((row) => text(row.session_key) === sessionId);
    if (!target) return NextResponse.json({ success: false, error: "Session not found." }, { status: 404 });
    if (!belongsToAccount(target, ctx.userKey, username, sessionEmployeeCode)) return NextResponse.json({ success: false, error: "You can terminate only your own sessions." }, { status: 403 });

    const result = await supabaseSessionAdmin<{ terminated: boolean; sessionId: string }>("terminate", { sessionId });
    return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update account sessions." }, { status: Number(error?.status) || 502, headers: { "Cache-Control": "no-store" } });
  }
}
