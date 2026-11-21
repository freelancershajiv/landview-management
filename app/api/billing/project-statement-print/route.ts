import { NextRequest, NextResponse } from "next/server";
import { buildProjectStatementV43, ProjectStatementError } from "@/lib/project-statement-v43";
import { renderProjectStatementV43 } from "@/lib/project-statement-document-v43";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const data = await buildProjectStatementV43(request, request.nextUrl.searchParams.get("projectId"));
    const html = renderProjectStatementV43(data, request.nextUrl.searchParams.get("autoprint") === "1");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex,nofollow,noarchive",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline' 'self'; script-src 'unsafe-inline' 'self'; img-src 'self' data:;",
      },
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Project statement unavailable.", {
      status: error instanceof ProjectStatementError ? error.status : 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
}
