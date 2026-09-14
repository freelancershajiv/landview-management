import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleSheetBatchValues } from "@/lib/google-wif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const SIGNED_USER_COOKIE = "landview_quick_user";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

const FINANCE_WORKBOOK_ID = "1N4U5l7SqMXlCMND3se-J1GmU3SPI3xGyGaR2WR_Eodg";
const FINANCE_LEDGER_ID = "1e51Mq3hOj9rUH9ugF8SiHe4SYJW3dJ3Bcw9JNgii_bs";
const RECONCILIATION_RANGE = "'Auto Invoice Reconciliation'!A:P";

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

type VerificationRecord = { verified: boolean; incomeId: string };
type VerificationMaps = Record<
  "Design Deposit" | "S Deposit" | "Others Bill Deposit",
  Record<number, VerificationRecord>
>;

type DirectPayment = {
  Payment_ID: string;
  Project_ID: string;
  Payment_Date: string;
  Amount: string;
  Payment_Method: string;
  Reference: string;
};

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
  if (!PROXY_SECRET) throw new Error("LAND_VIEW_PROXY_SECRET is not configured.");
}

function normalizeProjectId(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(?:LV\s*-?\s*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : "";
}

function hmac(value: string) {
  return createHmac("sha256", PROXY_SECRET).update(value).digest("hex");
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function readSignedWorkspaceUser(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  if (!token) throw new RouteError(401, "Session expired.");

  const signed = String(request.cookies.get(SIGNED_USER_COOKIE)?.value || "");
  const dot = signed.lastIndexOf(".");
  if (dot < 1) {
    throw new RouteError(401, "Your secure local session is unavailable. Please sign in again.");
  }

  const payload = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  if (!secureEqual(signature, hmac(`quick-user|${payload}`))) {
    throw new RouteError(401, "Your secure local session is invalid. Please sign in again.");
  }

  let user: Record<string, unknown>;
  try {
    user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new RouteError(401, "Your secure local session is invalid. Please sign in again.");
  }

  const role = String(user?.role || user?.Role || "").trim().toLowerCase();
  if (!WORKSPACE_ROLES.has(role)) throw new RouteError(403, "Access denied.");
  return { token, user, role };
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

function commonPayload(request: NextRequest, token: string) {
  return {
    token,
    proxySecret: PROXY_SECRET,
    _clientKey: clientKey(request),
  };
}

function billingHeaders(mode: string, durationMs: number) {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Landview-Billing-Mode": mode,
    "X-Landview-Billing-Duration-Ms": String(durationMs),
    "Server-Timing": `project-billing;dur=${durationMs}`,
  };
}

function logBillingResult(projectId: string, mode: string, durationMs: number, status = 200) {
  console.info(`[project-billing] project=${projectId} mode=${mode} status=${status} durationMs=${durationMs}`);
}

async function callBackend(payload: Record<string, unknown>) {
  if (!APPS_SCRIPT_URL) throw new Error("Apps Script fallback is not configured.");
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

function authStatus(json: any) {
  const message = String(json?.error || json?.message || "");
  return /unauthorized|session expired|invalid session|authentication required/i.test(message) ? 401 : 502;
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

function emptyVerificationMaps(): VerificationMaps {
  return { "Design Deposit": {}, "S Deposit": {}, "Others Bill Deposit": {} };
}

async function readReconciliationData(projectId: string) {
  const maps = emptyVerificationMaps();
  const payments: DirectPayment[] = [];

  const batch = await fetchGoogleSheetBatchValues(FINANCE_LEDGER_ID, [RECONCILIATION_RANGE]);
  const values = batch.valueRanges?.[0]?.values || [];
  if (values.length < 2) return { maps, payments };

  const headers = values[0].map((value) => String(value || "").trim());
  const index = (name: string) => headers.indexOf(name);
  const sourceKeyIndex = index("Source_Key");
  const sourceSheetIndex = index("Source_Sheet");
  const sourceRowIndex = index("Source_Row");
  const fileIdIndex = index("File_ID");
  const paymentDateIndex = index("Payment_Date");
  const detailsIndex = index("Details");
  const amountIndex = index("Amount");
  const incomeIdIndex = index("Matched_Income_ID");
  const matchStatusIndex = index("Match_Status");
  const manualIndex = index("Manual_Verification");

  if (sourceSheetIndex < 0 || sourceRowIndex < 0 || matchStatusIndex < 0) {
    throw new Error("Auto Invoice Reconciliation headers are incomplete.");
  }

  for (const rawRow of values.slice(1)) {
    const row = rawRow.map((value) => String(value ?? ""));
    const sourceName = String(row[sourceSheetIndex] || "").trim() as keyof VerificationMaps;
    const sourceRow = Number(row[sourceRowIndex] || 0);
    const incomeId = incomeIdIndex >= 0 ? String(row[incomeIdIndex] || "").trim() : "";
    const matchStatus = String(row[matchStatusIndex] || "").trim().toUpperCase();
    const manual = manualIndex >= 0 ? String(row[manualIndex] || "").trim().toLowerCase() : "";
    const verified = manual === "verified" || (manual !== "unverified" && matchStatus === "MATCHED_EXACT" && !!incomeId);

    if (Object.prototype.hasOwnProperty.call(maps, sourceName) && sourceRow) {
      maps[sourceName][sourceRow] = { verified, incomeId };
    }

    if (
      verified &&
      incomeId &&
      fileIdIndex >= 0 &&
      normalizeProjectId(row[fileIdIndex]) === projectId
    ) {
      payments.push({
        Payment_ID: incomeId,
        Project_ID: projectId,
        Payment_Date: paymentDateIndex >= 0 ? String(row[paymentDateIndex] || "") : "",
        Amount: amountIndex >= 0 ? String(row[amountIndex] || "") : "",
        Payment_Method: detailsIndex >= 0 ? String(row[detailsIndex] || "") : "",
        Reference: sourceKeyIndex >= 0 ? String(row[sourceKeyIndex] || "") : "",
      });
    }
  }

  return { maps, payments };
}

function verificationSource(tab: InvoiceTab): keyof VerificationMaps | "" {
  if (tab === "Design Deposit") return "Design Deposit";
  if (tab === "S Deposit") return "S Deposit";
  if (tab === "Others Bill Deposit") return "Others Bill Deposit";
  return "";
}

async function readDirectProjectBilling(projectId: string) {
  const ranges = INVOICE_TABS.map((tab) => `'${tab}'!A1:${TAB_END_COLUMNS[tab]}10000`);
  const [financeBatch, reconciliation] = await Promise.all([
    fetchGoogleSheetBatchValues(FINANCE_WORKBOOK_ID, ranges),
    readReconciliationData(projectId),
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
      const map = reconciliation.maps[source] || {};
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

  return {
    projectId,
    sheets,
    payments: reconciliation.payments,
    updatedAt,
    mode: "direct-google-sheets",
  };
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
  const startedAt = Date.now();
  const projectId = normalizeProjectId(request.nextUrl.searchParams.get("fileId"));

  try {
    requiredEnv();

    if (!projectId) {
      const durationMs = Date.now() - startedAt;
      logBillingResult("invalid", "validation-error", durationMs, 400);
      return NextResponse.json(
        { success: false, error: "Enter a valid File ID such as LV-209." },
        { status: 400, headers: billingHeaders("validation-error", durationMs) },
      );
    }

    const { token } = readSignedWorkspaceUser(request);
    const common = commonPayload(request, token);

    try {
      const direct = await readDirectProjectBilling(projectId);
      const durationMs = Date.now() - startedAt;
      logBillingResult(projectId, direct.mode, durationMs);
      return NextResponse.json(
        { success: true, data: direct },
        { headers: billingHeaders(direct.mode, durationMs) },
      );
    } catch (directError) {
      console.warn(
        "Direct Google Sheets project billing failed; using Apps Script fallback:",
        directError instanceof Error ? directError.message : directError,
      );
    }

    const fallback = await appsScriptBundleFallback(common, projectId);
    const mode = String(fallback.data?.mode || "apps-script-fallback");
    const durationMs = Date.now() - startedAt;
    logBillingResult(projectId, mode, durationMs);
    return NextResponse.json(fallback, {
      headers: billingHeaders(mode, durationMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project billing.";
    const status = error instanceof RouteError
      ? error.status
      : /session expired|unauthorized/i.test(message)
        ? 401
        : 502;
    const mode = status === 401 ? "auth-error" : status === 403 ? "access-denied" : "error";
    const durationMs = Date.now() - startedAt;
    logBillingResult(projectId || "unknown", mode, durationMs, status);
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: billingHeaders(mode, durationMs) },
    );
  }
}
