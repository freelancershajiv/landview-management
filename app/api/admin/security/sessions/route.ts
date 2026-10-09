import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE, SESSION_COOKIE, requireLocalSession, roleOf } from "@/lib/local-session";
import { supabaseSessionAdmin } from "@/lib/supabase-session-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

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

async function authorized(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) return { user: null, response: NextResponse.json({ success: false, error: "Session expired." }, { status: 401 }) };
  const role = roleOf(user);
  if (!["admin", "manager"].includes(role)) {
    return { user: null, response: NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorized(request);
    if (access.response) return access.response;

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

    const rows = await supabaseSessionAdmin<Row[]>("list");
    const sessions = (Array.isArray(rows) ? rows : []).map((row) => {
      const device = describeUserAgent(row.user_agent);
      const active = row.active === true && !row.revoked_at;
      return {
        sessionId: text(row.session_key),
        userId: text(row.user_id),
        username: text(row.username),
        name: text(row.full_name),
        role: text(row.role),
        deviceId: text(row.device_id),
        deviceName: device.deviceName,
        browser: device.browser,
        os: device.os,
        ipAddress: text(row.ip_address).replace(/\/32$/, ""),
        location: "",
        createdAt: millis(row.created_at),
        lastSeenAt: millis(row.last_seen_at),
        expiresAt: millis(row.auth_not_after),
        active,
        current: Boolean(currentSessionId && text(row.session_key) === currentSessionId),
        revokedAt: millis(row.revoked_at),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        sessions,
        source: "Supabase Auth",
        activeCount: sessions.filter((item) => item.active).length,
        historyCount: sessions.length,
        generatedAt: new Date().toISOString(),
      },
    }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Landview-Data": "supabase",
        "X-Landview-Auth": "supabase",
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load sessions." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const access = await authorized(request);
    if (access.response) return access.response;
    if (roleOf(access.user) !== "admin") return NextResponse.json({ success: false, error: "Admin access is required to terminate sessions." }, { status: 403 });

    const body = await request.json() as Row;
    const action = text(body.action, 40).toLowerCase();
    if (action !== "terminate") return NextResponse.json({ success: false, error: "Unsupported session action." }, { status: 400 });

    const sessionId = text(body.sessionId, 80);
    const currentSessionId = sessionIdFromToken(request.cookies.get(SESSION_COOKIE)?.value || "");
    if (sessionId && sessionId === currentSessionId) {
      return NextResponse.json({ success: false, error: "Use Sign out to end the current device session." }, { status: 400 });
    }

    const result = await supabaseSessionAdmin<{ terminated: boolean; sessionId: string }>("terminate", { sessionId });
    return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not terminate session." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
