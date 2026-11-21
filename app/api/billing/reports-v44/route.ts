import { NextRequest, NextResponse } from "next/server";
import { buildBillingReportV44 } from "@/lib/billing-reports-v44-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const report = await buildBillingReportV44(request);
    return NextResponse.json({success:true,data:report}, {
      headers: {
        "Cache-Control":"private, no-store, max-age=0",
        "X-Content-Type-Options":"nosniff",
        "X-Landview-Financial-Source":"billing-receivable-authority",
      },
    });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number(error.status) : 503;
    return NextResponse.json({success:false,error:error instanceof Error?error.message:"Billing report unavailable."}, {
      status: [401,403,503].includes(status)?status:503,
      headers:{"Cache-Control":"private, no-store"},
    });
  }
}
