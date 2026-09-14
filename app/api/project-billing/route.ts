import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleSheetBatchValues } from "@/lib/google-wif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

// Native Google Sheets mirrors used by the direct billing path.
const FINANCE_WORKBOOK_ID = "1N4U5l7SqMXlCMND3se-J1GmU3SPI3xGyGaR2WR_Eodg";
const FINANCE_LEDGER_ID = "1e51Mq3hOj9rUH9ugF8SiHe4SYJW3dJ3Bcw9JNgii_bs";
const RECONCILIATION_RANGE = "'Auto Invoice Reconciliation'!A1:Z10000";

const INVOICE_TABS = [
  "Summary",
  "File List",
  "Design Bill",
  "Design Deposit",
  "Supervision Bill",
  "S Deposit",
  "Others Bill",
  "Others Bill Deposit",
] as const;

type InvoiceTab = (typeof INVOICE_TABS)[number];

type FinanceSheetData = {
  tab: string;
  tabs: string[];
  headers: string[];
  rows: string[][];
  totals: { gross: number; discount: number; billed: number; paid: number; due: number; projects: number };
  url: string;
  updatedAt: string;
};

type SessionCacheEntry = { expiresAt: number; role: string };
const workspaceSessionCache = new Map<string, SessionCacheEntry>();
const SESSION_CACHE_TTL_MS = 90 * 1000;
const WORKSPACE_ROLES = new Set(["admin", "manager", "accounts"]);

const TAB_WIDTHS: Record<InvoiceTab, number> = {
  Summary: 30,
  "File List": 8,
  "Design Bill": 6,
  "Design Deposit": 5,
  "Supervision Bill": 7,
  "S Deposit": 5,
  "Others Bill": 6,
  "Others Bill Deposit": 5,
};

const TAB_END_COLUMNS: Record<InvoiceTab, string> = {
  Summary: "AD",
  "File List": "H",
  "Design Bill": "F",
  "Design Deposit": "E",
  "Supervision Bill": "G",
  "S Deposit": "E",
  "Others Bill": "F",
  "Others Bill Deposit": "E",
};

class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requiredEnv() {
  if (!APPS_SCRIPT_URL) throw new Error("LAND_VIEW_API_URL is not configured.");
  if (!PROXY_SECRET) throw new Error("LAND_VIEW_PROXY_SECRET is not configured.");
}

function normalizeProjectId(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(?:LV\s*-?\s*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : "";
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

function sessionCacheKey(token: string) {
  return createHmac("sha256", PROXY_SECRET).update(token).digest("hex");
}

async function callBackend(payload: Record<string, unknown>) {
  const delays = [0, 250, 700];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "follow",
      });
      const text = await response.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(/^\s*</.test(text) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
      }
      if (response.status >= 500 && attempt < delays.length - 1) {
        lastError = new Error(`Apps Script returned HTTP ${response.status}.`);
        continue;
      }
      return { response, json };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || "Backend request failed."));
      if (attempt >= delays.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("Unable to reach LAND VIEW backend.");
}

function commonPayload(request: NextRequest, token: string) {
  return {
    token,
    proxySecret: PROXY_SECRET,
    _clientKey: clientKey(request),
  };
}

function authStatus(json: any) {
  const message = String(json?.error || json?.message || "");
  return /unauthorized|session expired|invalid session|authentication required/i.test(message) ? 401 : 502;
}

async function requireWorkspaceSession(common: Record<string, unknown>, token: string) {
  const key = sessionCacheKey(token);
  const cached = workspaceSessionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.role;

  const { json } = await callBackend({ ...common, action: "getSession" });
  if (!json?.success || !json?.data?.authenticated || !json?.data?.user) {
    const status = authStatus(json);
    throw new RouteError(status === 401 ? 401 : 502, String(json?.error || json?.message || "Could not validate session."));
  }

  const role = String(json.data.user.role || json.data.user.Role || "").trim().toLowerCase();
  if (!WORKSPACE_ROLES.has(role)) throw new RouteError(403, "Access denied.");

  workspaceSessionCache.set(key, { role, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  if (workspaceSessionCache.size > 500) {
    const now = Date.now();
    for (const [cacheKey, entry] of workspaceSessionCache.entries()) {
      if (entry.expiresAt <= now) workspaceSessionCache.delete(cacheKey);
    }
  }

  return role;
}

function padRow(row: unknown[] | undefined, width: number) {
  return Array.from({ length: width }, (_, index) => String(row?.[index] ?? ""));
}

function projectBillingNumber(value: unknown) {
  let text = String(value ?? "").trim();
  if (!text || text === "-" || text === "—") return 0;
  text = text.replace(/BDT|Tk\.?|৳|,/gi, "").replace(/\s/g, "");
  if (/^\(.*\)$/.test(text)) text = `-${text.slice(1, -1)}`;
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

function projectBillingTotals(summaryRows: string[][]) {
  const totals = { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 };
  if (!summaryRows.length) return totals;
  const row = summaryRows[0];
  totals.projects = 1;
  totals.gross = projectBillingNumber(row[3]) + projectBillingNumber(row[7]) + projectBillingNumber(row[11]);
  totals.discount = projectBillingNumber(row[4]) + projectBillingNumber(row[8]) + projectBillingNumber(row[12]);
  totals.paid = projectBillingNumber(row[5]) + projectBillingNumber(row[9]) + projectBillingNumber(row[13]);
  totals.due = projectBillingNumber(row[15]);
  totals.billed = totals.gross - totals.discount;
  return totals;
}

type VerificationRecord = { verified: boolean; incomeId: string };
type VerificationMaps = Record<"Design Deposit" | "S Deposit" | "Others Bill Deposit", Record<number, VerificationRecord>>;

function emptyVerificationMaps(): VerificationMaps {
  return { "Design Deposit": {}, "S Deposit": {}, "Others Bill Deposit": {} };
}

async function readVerificationMaps(): Promise<VerificationMaps> {
  const maps = emptyVerificationMaps();
  try {
    const batch = await fetchGoogleSheetBatchValues(FINANCE_LEDGER_ID, [RECONCILIATION_RANGE]);
    const values = batch.valueRanges?.[0]?.values || [];
    if (values.length < 2) return maps;

    const headers = values[0].map((value) => String(value || "").trim());
    const sourceSheetIndex = headers.indexOf("Source_Sheet");
    const sourceRowIndex = headers.indexOf("Source_Row");
    const incomeIdIndex = headers.indexOf("Matched_Income_ID");
    const matchStatusIndex = headers.indexOf("Match_Status");
    const manualIndex = headers.indexOf("Manual_Verification");
    if (sourceSheetIndex < 0 || sourceRowIndex < 0 || matchStatusIndex < 0) return maps;

    for (const rawRow of values.slice(1)) {
      const row = rawRow.map((value) => String(value ?? ""));
      const sourceName = String(row[sourceSheetIndex] || "").trim() as keyof VerificationMaps;
      if (!Object.prototype.hasOwnProperty.call(maps, sourceName)) continue;
      const sourceRow = Number(row[sourceRowIndex] || 0);
      if (!sourceRow) continue;

      const incomeId = incomeIdIndex >= 0 ? String(row[incomeIdIndex] || "").trim() : "";
      const matchStatus = String(row[matchStatusIndex] || "").trim().toUpperCase();
      const manual = manualIndex >= 0 ? String(row[manualIndex] || "").trim().toLowerCase() : "";
      maps[sourceName][sourceRow] = {
        verified: manual === "verified" || (manual !== "unverified" && matchStatus === "MATCHED_EXACT" && !!incomeId),
        incomeId,
      };
    }
  } catch (error) {
    console.warn("Direct project billing reconciliation lookup unavailable:", error instanceof Error ? error.message : error);
  }
  return maps;
}

function verificationSource(tab: InvoiceTab): keyof VerificationMaps | "" {
  if (tab === "Design Deposit") return "Design Deposit";
  if (tab === "S Deposit") return "S Deposit";
  if (tab === "Others Bill Deposit") return "Others Bill Deposit";
  return "";
}

async function readDirectProjectBilling(projectId: string) {
  const ranges = INVOICE_TABS.map((tab) => `'${tab}'!A1:${TAB_END_COLUMNS[tab]}10000`);
  const [financeBatch, verificationMaps] = await Promise.all([
    fetchGoogleSheetBatchValues(FINANCE_WORKBOOK_ID, ranges),
    readVerificationMaps(),
  ]);

  const valueRanges = financeBatch.valueRanges || [];
  if (valueRanges.length !== INVOICE_TABS.length) {
    throw new Error("Google Sheets did not return all billing worksheets.");
  }

  const tabs = [...INVOICE_TABS];
  const updatedAt = new Date().toISOString();
  const workbookUrl = `https://docs.google.com/spreadsheets/d/${FINANCE_WORKBOOK_ID}/edit`;

  const sheets: FinanceSheetData[] = INVOICE_TABS.map((tab, tabIndex) => {
    const width = TAB_WIDTHS[tab];
    const grid = (valueRanges[tabIndex]?.values || []).map((row) => padRow(row, width));
    let headers = padRow(grid[0] || [], width);
    const sourceRowNumbers: number[] = [];
    let rows = grid.slice(1).filter((row, index) => {
      if (normalizeProjectId(row[0]) !== projectId) return false;
      if (tab !== "Summary" && tab !== "File List") {
        const hasBillingValue = row.slice(2).some((value) => value !== "");
        if (!hasBillingValue) return false;
      }
      sourceRowNumbers.push(index + 2);
      return true;
    });

    if (tab !== "Summary" && tab !== "File List") {
      headers = headers.filter((_, index) => index !== 1);
      rows = rows.map((row) => row.filter((_, index) => index !== 1));
    }

    const source = verificationSource(tab);
    if (source) {
      const map = verificationMaps[source] || {};
      headers = headers.concat(["Verification", "Linked Income ID"]);
      rows = rows.map((row, index) => {
        const verification = map[sourceRowNumbers[index]] || null;
        return row.concat([
          verification?.verified ? "Verified" : "Unverified",
          verification?.incomeId || "",
        ]);
      });
    }

    return {
      tab,
      tabs,
      headers,
      rows,
      totals: { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 },
      url: workbookUrl,
      updatedAt,
    };
  });

  const summaryData = sheets.find((item) => item.tab === "Summary");
  const totals = projectBillingTotals(summaryData?.rows || []);
  for (const sheet of sheets) sheet.totals = totals;

  return { projectId, sheets, updatedAt };
}

async function appsScriptBundleFallback(common: Record<string, unknown>, projectId: string) {
  const bundled = await callBackend({
    ...common,
    action: "getFinanceSheet",
    bundle: "projectBilling",
    projectId,
  });

  if (bundled.json?.success && Array.isArray(bundled.json?.data?.sheets)) {
    return { success: true as const, data: { ...bundled.json.data, mode: "project-bundle" } };
  }

  if (!bundled.json?.success) {
    const status = authStatus(bundled.json);
    if (status === 401) {
      throw new RouteError(401, String(bundled.json?.error || bundled.json?.message || "Session expired."));
    }
  }

  const sheetRequests = INVOICE_TABS.map(async (tab) => {
    const { json } = await callBackend({ ...common, action: "getFinanceSheet", tab });
    if (!json?.success || !json?.data) throw new Error(String(json?.error || `Could not load ${tab}.`));
    return json.data;
  });
  const paymentsRequest = callBackend({ ...common, action: "getPayments", projectId })
    .then(({ json }) => (json?.success && Array.isArray(json?.data) ? json.data : []))
    .catch(() => []);

  const [sheets, payments] = await Promise.all([Promise.all(sheetRequests), paymentsRequest]);
  return {
    success: true as const,
    data: {
      projectId,
      sheets,
      payments,
      updatedAt: new Date().toISOString(),
      mode: "compatibility-aggregate",
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    requiredEnv();
    const projectId = normalizeProjectId(request.nextUrl.searchParams.get("fileId"));
    if (!projectId) {
      return NextResponse.json({ success: false, error: "Enter a valid File ID such as LV-209." }, { status: 400 });
    }

    const token = request.cookies.get(COOKIE_NAME)?.value || "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

    const common = commonPayload(request, token);

    // Preserve the same workspace-only security boundary that getFinanceSheet uses.
    await requireWorkspaceSession(common, token);

    // Preferred path: the eight finance tabs are fetched in one Google Sheets API
    // batch request. Reconciliation is read in parallel. Payments remain on the
    // existing authenticated Apps Script endpoint until the management workbook
    // itself is migrated to direct Sheets access.
    const [directResult, paymentResult] = await Promise.allSettled([
      readDirectProjectBilling(projectId),
      callBackend({ ...common, action: "getPayments", projectId }),
    ]);

    if (directResult.status === "fulfilled" && paymentResult.status === "fulfilled") {
      const paymentJson = paymentResult.value.json;
      if (!paymentJson?.success) {
        const status = authStatus(paymentJson);
        if (status === 401) throw new RouteError(401, String(paymentJson?.error || paymentJson?.message || "Session expired."));
      } else if (Array.isArray(paymentJson.data)) {
        return NextResponse.json(
          {
            success: true,
            data: {
              ...directResult.value,
              payments: paymentJson.data,
              mode: "direct-google-sheets",
            },
          },
          { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
        );
      }
    }

    if (directResult.status === "rejected") {
      console.warn(
        "Direct Google Sheets project billing failed; using Apps Script fallback:",
        directResult.reason instanceof Error ? directResult.reason.message : directResult.reason,
      );
    }
    if (paymentResult.status === "rejected") {
      console.warn(
        "Direct project billing payment lookup failed; using Apps Script fallback:",
        paymentResult.reason instanceof Error ? paymentResult.reason.message : paymentResult.reason,
      );
    }

    const fallback = await appsScriptBundleFallback(common, projectId);
    return NextResponse.json(fallback, {
      headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project billing.";
    const status = error instanceof RouteError
      ? error.status
      : /session expired|unauthorized/i.test(message)
        ? 401
        : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
