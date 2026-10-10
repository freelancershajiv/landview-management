import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability, permissionStatus } from "@/lib/permission-guard";
import { selectRows } from "@/lib/supabase-data";
import { getMediaQueueStats } from "@/lib/site-visit-media-queue";
import { isR2Configured } from "@/lib/cloudflare-r2";

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

function ageText(minutes: number) {
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

async function databaseCheck(): Promise<HealthCheck> {
  try {
    await selectRows("projects", { limit: 1 });
    return {
      id: "database",
      label: "Database Gateway",
      status: "healthy",
      score: 100,
      weight: 20,
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
      weight: 20,
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
      weight: 15,
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
      weight: 15,
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
  const weight = kind === "admin" ? 15 : 10;
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

function r2ConfigCheck(): HealthCheck {
  const configured = isR2Configured();
  return configured ? {
    id: "r2-storage",
    label: "R2 Media Storage",
    status: "healthy",
    score: 100,
    weight: 10,
    detail: "Cloudflare R2 credentials and bucket configuration are present for new Site Visit media.",
    metric: "Configured",
    href: "/admin/site-visits",
  } : {
    id: "r2-storage",
    label: "R2 Media Storage",
    status: "critical",
    score: 0,
    weight: 10,
    detail: "Cloudflare R2 configuration is incomplete. New Site Visit photo uploads may fail.",
    metric: "Not configured",
    href: "/admin/site-visits",
  };
}

async function mediaQueueCheck(): Promise<HealthCheck> {
  try {
    const data = await getMediaQueueStats();
    const totals = data?.totals || { pending: 0, processing: 0, failed: 0, terminalFailed: 0, completed24h: 0 };
    const jobs: Row[] = Array.isArray(data?.jobs) ? data.jobs : [];
    const active = jobs.filter((job) => ["pending", "processing", "failed"].includes(clean(job.status, 30).toLowerCase()));
    const oldestMinutes = active.reduce((max, job) => Math.max(max, ageMinutes(job.created_at || job.source_created_at || job.updated_at || job.next_retry_at)), 0);
    const staleProcessing = active.filter((job) => clean(job.status, 30).toLowerCase() === "processing" && ageMinutes(job.updated_at || job.locked_at || job.created_at) >= 15).length;
    const activeCount = Number(totals.pending || 0) + Number(totals.processing || 0) + Number(totals.failed || 0);
    const terminal = Number(totals.terminalFailed || 0);
    const retrying = Number(totals.failed || 0);

    if (!activeCount && !terminal) {
      return {
        id: "site-media",
        label: "Site Visit Media Queue",
        status: "healthy",
        score: 100,
        weight: 30,
        detail: `R2 migration queue is clear. ${Number(totals.completed24h || 0)} job${Number(totals.completed24h || 0) === 1 ? "" : "s"} completed in the last 24 hours.`,
        metric: "Queue clear",
        href: "/admin/site-visits",
      };
    }

    let status: HealthStatus = "healthy";
    let score = 90;
    if (terminal > 0 || staleProcessing > 0 || oldestMinutes >= 240) {
      status = "critical";
      score = 20;
    } else if (retrying > 0 || oldestMinutes >= 60) {
      status = "warning";
      score = 60;
    }

    const parts = [
      `${Number(totals.pending || 0)} pending`,
      `${Number(totals.processing || 0)} processing`,
      `${retrying} retrying/failed`,
    ];
    if (terminal) parts.push(`${terminal} manual retry required`);
    if (staleProcessing) parts.push(`${staleProcessing} processing job stale`);

    return {
      id: "site-media",
      label: "Site Visit Media Queue",
      status,
      score,
      weight: 30,
      detail: `${parts.join(" · ")}. Oldest active job: ${ageText(oldestMinutes)}.`,
      metric: terminal ? `${terminal} needs action` : `${activeCount} active`,
      href: "/admin/site-visits",
    };
  } catch (error: any) {
    return {
      id: "site-media",
      label: "Site Visit Media Queue",
      status: "unknown",
      score: 50,
      weight: 30,
      detail: clean(error?.message || "Could not inspect the Site Visit media queue.", 500),
      metric: "Unknown",
      href: "/admin/site-visits",
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireApiCapability(request, "systemHealth.view");
    const checks = await Promise.all([
      databaseCheck(),
      analyticsCheck(),
      whatsappCheck("admin"),
      whatsappCheck("client"),
      Promise.resolve(r2ConfigCheck()),
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
    return NextResponse.json({ success: false, error: message }, { status: permissionStatus(error), headers: { "Cache-Control": "no-store" } });
  }
}
