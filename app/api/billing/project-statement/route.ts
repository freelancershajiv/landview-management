import { NextRequest, NextResponse } from "next/server";
import { buildProjectStatementV43, ProjectStatementError } from "@/lib/project-statement-v43";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const data = await buildProjectStatementV43(request, request.nextUrl.searchParams.get("projectId"));
    return NextResponse.json({ success: true, data }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Landview-Financial-Source": "billing-receivable-authority",
      },
    });
  } catch (error) {
    const status = error instanceof ProjectStatementError ? error.status : 503;
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not prepare the project statement.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
