import { NextResponse } from "next/server";
import { fetchGoogleSheetMetadata } from "@/lib/google-wif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const metadata = await fetchGoogleSheetMetadata(FINANCE_WORKBOOK_ID);
    const availableTabs = new Set(
      (metadata.sheets || [])
        .map((sheet) => String(sheet.properties?.title || "").trim())
        .filter(Boolean),
    );
    const billingTabsReady = BILLING_TABS.every((tab) => availableTabs.has(tab));

    return NextResponse.json(
      {
        success: true,
        data: {
          backend: "google-sheets-wif",
          federationReady: true,
          financeWorkbookReachable: true,
          billingTabsReady,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheets health check failed.";
    console.error("Google Sheets federation health check failed:", message);
    return NextResponse.json(
      {
        success: false,
        data: {
          backend: "google-sheets-wif",
          federationReady: false,
          financeWorkbookReachable: false,
          billingTabsReady: false,
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  }
}
