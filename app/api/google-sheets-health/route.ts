import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleSheetMetadata } from "@/lib/google-wif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const FINANCE_WORKBOOK_ID = "1-JoPQqqntxP7NMVNHSYN-RYkHLWMQf4K";
const BILLING_TABS = [
  "Summary",
  "File List",
  "Design Bill",
  "Design Deposit",
  "Supervision Bill",
  "S Deposit",
  "Others Bill",
  "Others Bill Deposit",
];

export async function GET(request: NextRequest) {
  if (!request.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.json({ success: false, error: "Session required." }, { status: 401 });
  }

  try {
    const metadata = await fetchGoogleSheetMetadata(FINANCE_WORKBOOK_ID);
    const availableTabs = new Set(
      (metadata.sheets || [])
        .map((sheet) => String(sheet.properties?.title || "").trim())
        .filter(Boolean),
    );
    const missingTabs = BILLING_TABS.filter((tab) => !availableTabs.has(tab));

    return NextResponse.json(
      {
        success: true,
        data: {
          backend: "google-sheets-wif",
          workbookTitle: metadata.properties?.title || "",
          billingTabsReady: missingTabs.length === 0,
          missingTabs,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheets health check failed.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  }
}
