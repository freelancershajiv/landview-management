import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const SESSION_COOKIE = "landview_session";

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
      return NextResponse.json({ success: false, error: "LAND VIEW backend is not configured." }, { status: 500 });
    }
    if (!allowedOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON request." }, { status: 400 });
    }

    const workflowOp = String(body.workflowOp || "").trim().toLowerCase();
    if (workflowOp !== "create" && workflowOp !== "update") {
      return NextResponse.json({ success: false, error: "Unsupported workflow operation." }, { status: 400 });
    }

    const payload = {
      ...body,
      action: "getFinanceSheet",
      tab: "Workflow",
      workflowOp,
      token,
      proxySecret: PROXY_SECRET,
    };

    const backend = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow",
    });

    const text = await backend.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { success: false, error: /^\s*</.test(text) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON." },
        { status: 502 }
      );
    }

    return NextResponse.json(json, {
      status: backend.ok ? 200 : backend.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Workflow save failed." }, { status: 502 });
  }
}
