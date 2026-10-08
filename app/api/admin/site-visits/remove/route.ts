import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { deleteRows, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 700) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Invalid request origin.", 403);

  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return fail("Session expired.", 401);
    if (roleOf(user) !== "admin") return fail("Only Admin can delete Site Visits.", 403);

    const body = await request.json().catch(() => ({})) as Row;
    const visitId = text(body.visitId || body.Visit_ID, 180);
    const confirmation = text(body.confirmation, 40);

    if (!visitId) return fail("Site Visit ID is required.", 400);
    if (confirmation !== "DELETE_SITE_VISIT") return fail("Deletion confirmation is required.", 400);

    const rows = await selectRows("site_visits", { filters: { visit_code: visitId }, limit: 1 });
    const visit = rows[0];
    if (!visit) return fail("Site Visit was not found.", 404);

    const deleted = await deleteRows("site_visits", { id: visit.id });
    if (!deleted.length) return fail("Site Visit could not be deleted.", 409);

    return NextResponse.json({
      success: true,
      data: { Visit_ID: visitId, deleted: true },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error: any) {
    return fail(text(error?.message || "Could not delete Site Visit."), 500);
  }
}
