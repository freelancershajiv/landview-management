import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type HealthStatus = "healthy" | "warning" | "critical" | "unknown";
type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  score: number;
  weight: number;
  detail: string;
  metric?: string;
  href: string;
};

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function ageMinutes(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

async function requireManagement(request: NextRequest) {
  const user = (await requireLocalSession(request)) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required.");
  return user;
}

async function databaseCheck(): Promise<HealthCheck> {
  try {
    await selectRows("projects", { limit: 1 });
    return {
      id: "database",
      label: "Database Gateway",
      status: "healthy",
      score: 100,
      weight: 25,
      detail: "LAND VIEW can read the production project database through the Supabase gateway.",
      metric: "Online",
      href: "/admin/projects",
    };
  } catch (error: any) {
    return {
      id: "database",
      label: "Database Gateway",
      status: "critical",
      score: 0,
      weight: 25,
      detail: clean(error?.message || "Production database gateway is unavailable.", 500),
      metric: "Unavailable",
      href: "/admin/projects",
    };
  }
}

async function analyticsCheck(): Promise<HealthCheck> {
  try {
    const rows = await selectRows("website_analytics_interactions", { order: "occurred_at:desc", limit: 1 });
    const last = rows[0]?.occurred_at || rows[0]?.created_at;
    return {
      id: "analytics",
      label: "Website Analytics",
      status: "healthy",
      score: 100,
      weight: 20,
      detail: last
        ? `Analytics storage is readable. Latest tracked interaction: ${new Date(last).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}.`
        : "Analytics storage is available and ready for website events.",
      metric: rows.length ? "Receiving data" : "Ready",
      href: "/admin/website-analytics",
    };
  } catch (error: any) {
    return {
      id: "analytics",
      label: "Website Analytics",
      status: "critical",
      score: 0,
      weight: 20,
      detail: clean(error?.message || "Analytics storage cannot be reached through the LAND VIEW data gateway.", 500),
      metric: "Write/read path broken",
      href: "/admin/website-analytics",
    };
  }
}

function whatsappConfig() {
  const base = clean(process.env.WHATSAPP_BOT_URL, 1000).replace(/\/+$/, "");
  const token = clean(process.env.WHATSAPP_BOT_API_TOKEN, 1000);
  return { base, token };
}

async function whatsappCheck(kind: "admin" | "client"): Promise<HealthCheck> {
  const { base, token } = whatsappConfig();
  const label = kind === "admin" ? "Admin WhatsApp" : "Client WhatsApp";
  const weight = kind === "admin" ? 15 : 15;
  if (!base || !token) {
    return {
      id: kind === "admin" ? "whatsapp-admin" : "whatsapp-client",
      label,
      status: "critical",
      score: 0,
      weight,
      detail: "WhatsApp bot environment configuration is missing.",
      metric: "Not configured",
      href: "/admin/whatsapp",
    };
  }

  try {
    const pairPath = kind === "admin" ? "/pair" : "/client/pair";
    const response = await fetch(`${base}${pairPath}?key=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const html = await response.text();
    if (!response.ok) throw new Error(`WhatsApp service returned HTTP ${response.status}.`);

    const connected = /<h2>Connected<\/h2>/i.test(html);
    const qrAvailable = /<img\s+src="[^"]+"/i.test(html);
    const loggedOut = /Pairing reset required/i.test(html);

    if (connected) {
      return {
        id: kind === "admin" ? "whatsapp-admin" : "whatsapp-client",
        label,
        status: "healthy",
        score: 100,
        weight,
        detail: `${label} session is paired and responding.`,
        metric: "Connected",
        href: "/admin/whatsapp",
      };
    }
    if (loggedOut) {
      return {
        id: kind === "admin" ? "whatsapp-admin" : "whatsapp-client",
        label,
        status: "critical",
        score: 0,
        weight,
        detail: `${label} session is logged out and needs pairing reset.`,
        metric: "Reset required",
        href: "/admin/whatsapp",
      };
    }
    return {
      id: kind === "admin" ? "whatsapp-admin" : "whatsapp-client",
      label,
      status: "warning",
      score: 60,
      weight,
      detail: qrAvailable ? `${label} is waiting for a QR scan.` : `${label} service is responding but the session is still connecting.`,
      metric: qrAvailable ? "Pair now" : "Connecting",
      href: "/admin/whatsapp",
    };
  } catch (error: any) {
    return {
      id: kind === "admin" ? "whatsapp-admin" : "whatsapp-client",
      label,
      status: "critical",
      score: 0,
      weight,
      detail: clean(error?.message || `${label} service is unreachable.`, 500),
      metric: "Unreachable",
      href: "/admin/whatsapp",
    };
  }
}

async function mediaQueueCheck(): Promise<HealthCheck> {
  try {
    const rows = await selectRows("site_visits", { order: "created_at:asc", limit: 5000 });
    const pending = rows.filter((row) => clean(row.visit_photo_path) || clean(row.problem_photo_path));
    const pendingMedia = pending.reduce((count, row) => count + (clean(row.visit_photo_path) ? 1 : 0) + (clean(row.problem_photo_path) ? 1 : 0), 0);
    const oldestMinutes = pending.reduce((max, row) => Math.max(max, ageMinutes(row.created_at || row.source_created_at)), 0);

    if (!pendingMedia) {
      return {
        id: "site-media",
        label: "Site Visit Media",
        status: "healthy",
        score: 100,
        weight: 25,
        detail: "No Site Visit photos are waiting to move from temporary storage to Google Drive.",
        metric: "Queue clear",
        href: "/admin/site-visits",
      };
    }

    const status: HealthStatus = oldestMinutes >= 240 ? "critical" : oldestMinutes >= 90 ? "warning" : "healthy";
    const score = status === "critical" ? 20 : status === "warning" ? 60 : 90;
    const ageText = oldestMinutes >= 60 ? `${Math.floor(oldestMinutes / 60)}h ${oldestMinutes % 60}m` : `${oldestMinutes}m`;
    return {
      id: "site-media",
      label: "Site Visit Media",
      status,
      score,
      weight: 25,
      detail: `${pendingMedia} photo${pendingMedia === 1 ? " is" : "s are"} waiting for Google Drive sync. Oldest queued item: ${ageText}.`,
      metric: `${pendingMedia} pending`,
      href: "/admin/site-visits",
    };
  } catch (error: any) {
    return {
      id: "site-media",
      label: "Site Visit Media",
      status: "unknown",
      score: 50,
      weight: 25,
      detail: clean(error?.message || "Could not inspect Site Visit media queue.", 500),
      metric: "Unknown",
      href: "/admin/site-visits",
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireManagement(request);
    const checks = await Promise.all([
      databaseCheck(),
      analyticsCheck(),
      whatsappCheck("admin"),
      whatsappCheck("client"),
      mediaQueueCheck(),
    ]);

    const weightTotal = checks.reduce((sum, check) => sum + check.weight, 0) || 1;
    const score = Math.round(checks.reduce((sum, check) => sum + check.score * check.weight, 0) / weightTotal);
    const criticalCount = checks.filter((check) => check.status === "critical").length;
    const warningCount = checks.filter((check) => check.status === "warning" || check.status === "unknown").length;
    const status: HealthStatus = criticalCount ? "critical" : warningCount ? "warning" : "healthy";

    return NextResponse.json({
      success: true,
      data: {
        score,
        status,
        criticalCount,
        warningCount,
        checks,
        generatedAt: new Date().toISOString(),
      },
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error: any) {
    const message = clean(error?.message || "Could not calculate LAND VIEW system health.", 1000);
    const status = /session expired/i.test(message) ? 401 : /Admin or Manager/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
