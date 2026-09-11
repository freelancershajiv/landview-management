import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const SESSION_COOKIE = "landview_session";

export async function GET(request: NextRequest) {
  try {
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
      return NextResponse.json({ success: false, error: "LAND VIEW backend is not configured." }, { status: 500 });
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

    const payload = {
      action: "getPublicProjects",
      _employeeWorkspace: "1",
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

    if (!json?.success) {
      return NextResponse.json(
        { success: false, error: String(json?.error || json?.message || "Could not load employee workbook data.") },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: json.data || {} }, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Employee workbook request failed." }, { status: 502 });
  }
}
