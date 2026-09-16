import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const BACKEND_TIMEOUT_MS = 12_000;
const BACKEND_RETRY_DELAYS_MS = [0, 250, 800];

const COMPAT_TABS = [
  "Summary",
  "File List",
  "Design Bill",
  "Design Deposit",
  "Supervision Bill",
  "S Deposit",
  "Others Bill",
  "Others Bill Deposit",
] as const;

type RecordRow = Record<string, unknown>;
type Category = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";

function requiredEnv() {
  if (!APPS_SCRIPT_URL) throw new Error("LAND_VIEW_API_URL is not configured.");
  if (!PROXY_SECRET) throw new Error("LAND_VIEW_PROXY_SECRET is not configured.");
}

function normalizeProjectId(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(?:LV\s*-?\s*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : "";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function amount(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function field(record: RecordRow, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function categoryFromExplicit(value: unknown): Category | "" {
  const normalized = text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (/^engineering(?: bill)?$|^design(?: bill)?$/.test(normalized)) return "Engineering Bill";
  if (/^supervision(?: bill)?$/.test(normalized)) return "Supervision Bill";
  if (/^(?:other services|others)(?: bill)?$/.test(normalized)) return "Other Services Bill";
  return "";
}

function categoryOf(record: RecordRow): Category {
  // Explicit billing/payment category wins. This is important for legitimate
  // engineering items whose service text happens to contain "Supervision".
  const explicit = categoryFromExplicit(field(record, [
    "Billing_Category", "Billing Category", "Category",
    "Payment_For", "Payment For", "Income_Category", "Income Category",
  ]));
  if (explicit) return explicit;

  const source = [field(record, ["Description", "Service", "Particulars", "Notes"])].map(text)
    .join(" ").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (/supervision|site supervision/.test(source)) return "Supervision Bill";
  if (/engineering|design|architect|structur|electrical|plumbing|\b3d\b|estimate|costing|plan approval/.test(source)) return "Engineering Bill";
  return "Other Services Bill";
}

function billIsEffective(record: RecordRow) {
  const status = text(field(record, ["Status", "Bill_Status", "Bill Status"])).toLowerCase().replace(/[_-]+/g, " ");
  return !["cancelled", "canceled", "void", "voided", "rejected"].includes(status);
}

function paymentIsEffective(record: RecordRow) {
  const type = text(field(record, ["Transaction_Type", "Transaction Type"])).toLowerCase();
  if (type === "personal income") return false;
  const impact = text(field(record, ["Affects_Business_Balance", "Affects Business Balance"])).toLowerCase();
  if (["false", "no", "0"].includes(impact)) return false;
  const status = text(field(record, ["Approval_Status", "Approval Status", "Status"])).toLowerCase().replace(/[_-]+/g, " ");
  if (!status) return true;
  return ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid"].includes(status);
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

async function parseBackendResponse(response: Response) {
  const raw = await response.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { response, raw, json };
}

async function callBackend(payload: Record<string, unknown>) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < BACKEND_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = BACKEND_RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const signal = AbortSignal.timeout(BACKEND_TIMEOUT_MS);
      const initial = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "manual",
        signal,
      });

      let result = await parseBackendResponse(initial);
      if ([301, 302, 303].includes(initial.status)) {
        const location = initial.headers.get("location") || "";
        if (!location) throw new Error("Apps Script returned an incomplete redirect.");
        const redirected = await fetch(location, { method: "GET", cache: "no-store", redirect: "follow", signal });
        result = await parseBackendResponse(redirected);
      }

      if (result.json?.success) return result.json.data;
      if (result.json) {
        const message = String(result.json?.error || result.json?.message || `Backend request failed (${result.response.status}).`);
        const retryable = result.response.status === 429 || result.response.status >= 500;
        if (!retryable || attempt === BACKEND_RETRY_DELAYS_MS.length - 1) throw new Error(message);
        lastError = new Error(message);
        continue;
      }

      const retryable = result.response.status === 404 || result.response.status === 429 || result.response.status >= 500 || /^\s*</.test(result.raw);
      lastError = new Error(/^\s*</.test(result.raw) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
      if (!retryable || attempt === BACKEND_RETRY_DELAYS_MS.length - 1) throw lastError;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Backend request failed."));
      if (attempt === BACKEND_RETRY_DELAYS_MS.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("Backend request failed.");
}

function commonPayload(request: NextRequest, token: string) {
  return { token, proxySecret: PROXY_SECRET, _clientKey: clientKey(request) };
}

function sheet(tab: string, headers: string[], rows: unknown[][]) {
  return {
    tab,
    tabs: [...COMPAT_TABS],
    headers,
    rows: rows.map((row) => row.map((value) => String(value ?? ""))),
    totals: { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 0 },
    url: "",
    updatedAt: new Date().toISOString(),
  };
}

function buildCompatibilitySheets(projectId: string, project: RecordRow, billing: any) {
  const bills = (Array.isArray(billing?.bills) ? billing.bills : []).filter(billIsEffective);
  const payments = (Array.isArray(billing?.payments) ? billing.payments : []).filter(paymentIsEffective);
  const categories: Record<Category, { bills: RecordRow[]; payments: RecordRow[]; gross: number; discount: number; paid: number; due: number }> = {
    "Engineering Bill": { bills: [], payments: [], gross: 0, discount: 0, paid: 0, due: 0 },
    "Supervision Bill": { bills: [], payments: [], gross: 0, discount: 0, paid: 0, due: 0 },
    "Other Services Bill": { bills: [], payments: [], gross: 0, discount: 0, paid: 0, due: 0 },
  };

  for (const bill of bills) {
    const category = categories[categoryOf(bill)];
    const gross = amount(field(bill, ["Amount", "Bill_Amount", "Bill Amount", "Total", "Grand_Total"]));
    const discount = amount(field(bill, ["Discount", "Discount_Amount", "Discount Amount"]));
    category.bills.push(bill);
    category.gross += gross;
    category.discount += discount;
  }
  for (const payment of payments) {
    const category = categories[categoryOf(payment)];
    category.payments.push(payment);
    category.paid += amount(field(payment, ["Amount", "Payment_Amount", "Payment Amount"]));
  }
  for (const category of Object.values(categories)) category.due = category.gross - category.discount - category.paid;

  const engineering = categories["Engineering Bill"];
  const supervision = categories["Supervision Bill"];
  const others = categories["Other Services Bill"];
  const totalDue = engineering.due + supervision.due + others.due;
  const totalBilled = engineering.gross - engineering.discount + supervision.gross - supervision.discount + others.gross - others.discount;

  const fileRow = [
    projectId,
    field(project, ["Client_Name", "Client Name", "Client"]),
    field(project, ["Client_Address", "Client Address", "Address", "Location"]),
    field(project, ["Phone_Number", "Phone Number", "Phone", "Mobile"]),
    field(project, ["Floor_Story", "Floor/Story", "Floors", "Floor", "Story"]),
    field(project, ["Build_Type", "Build Type", "Building_Type", "Project_Type", "Project Type"]),
    field(project, ["Land_Area", "Land Area", "Plot_Area", "Plot Area"]),
  ];
  const summaryRow = [
    projectId,
    field(project, ["Client_Name", "Client Name", "Client"]),
    field(project, ["Project_Name", "Project Name", "Name"]),
    engineering.gross, engineering.discount, engineering.paid, engineering.due,
    supervision.gross, supervision.discount, supervision.paid, supervision.due,
    others.gross, others.discount, others.paid, others.due,
    totalDue,
    totalDue > 0.009 ? "DUE" : totalBilled > 0 ? "FULL PAID" : "",
  ];

  const billRows = (category: Category) => categories[category].bills.map((bill) => {
    const gross = amount(field(bill, ["Amount", "Bill_Amount", "Total", "Grand_Total"]));
    const description = text(field(bill, ["Description", "Service", "Particulars", "Item"]))
      .replace(/^\[(Engineering Bill|Supervision Bill|Other Services Bill)\]\s*/i, "");
    const rawUnitPrice = field(bill, ["Unit_Price", "Unit Price", "Price", "Rate"]);
    const rawQuantity = field(bill, ["Quantity", "Qty", "QTY"]);
    const unitPrice = text(rawUnitPrice) ? amount(rawUnitPrice) : gross;
    const quantity = amount(rawQuantity) > 0 ? amount(rawQuantity) : 1;
    return [projectId, description || category, unitPrice || gross, quantity, gross, field(bill, ["Bill_ID", "Bill ID"])];
  });
  const paymentRows = (category: Category) => categories[category].payments.map((payment) => {
    const method = text(field(payment, ["Payment_Method", "Payment Method", "Method"]));
    const reference = text(field(payment, ["Reference_No", "Reference No", "Reference"]));
    return [
      projectId,
      field(payment, ["Payment_Date", "Payment Date", "Date"]),
      [method, reference].filter(Boolean).join(" · ") || "Client Payment",
      amount(field(payment, ["Amount", "Payment_Amount", "Payment Amount"])),
      "Verified",
      field(payment, ["Payment_ID", "Payment ID", "Income_ID", "Income ID"]),
    ];
  });

  return [
    sheet("Summary", ["FILE ID", "Client Name", "Project Name", "Engineering Bill", "Engineering Discount", "Engineering Deposit", "Engineering Due", "Supervision Bill", "Supervision Discount", "Supervision Deposit", "Supervision Due", "Other Services Bill", "Other Services Discount", "Other Services Deposit", "Other Services Due", "Total Due", "Status"], [summaryRow]),
    sheet("File List", ["FILE ID", "Client Name", "Address", "Phone", "Floor/Story", "Build Type", "Land Area"], [fileRow]),
    sheet("Design Bill", ["FILE ID", "Service Name", "Price", "Qty", "Amount", "Bill ID"], billRows("Engineering Bill")),
    sheet("Design Deposit", ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"], paymentRows("Engineering Bill")),
    sheet("Supervision Bill", ["FILE ID", "Service Name", "Price", "Qty", "Amount", "Bill ID"], billRows("Supervision Bill")),
    sheet("S Deposit", ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"], paymentRows("Supervision Bill")),
    sheet("Others Bill", ["FILE ID", "Service Name", "Price", "Qty", "Amount", "Bill ID"], billRows("Other Services Bill")),
    sheet("Others Bill Deposit", ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"], paymentRows("Other Services Bill")),
  ];
}

function statusForError(message: string) {
  const normalized = message.trim().toLowerCase();
  if (/unauthorized|session expired|authentication required|invalid session/.test(normalized)) return 401;
  if (/access denied|permission/.test(normalized)) return 403;
  if (/project not found|not found/.test(normalized)) return 404;
  return 502;
}

export async function GET(request: NextRequest) {
  try {
    requiredEnv();
    const projectId = normalizeProjectId(request.nextUrl.searchParams.get("fileId"));
    if (!projectId) return NextResponse.json({ success: false, error: "Enter a valid File ID such as LV-209." }, { status: 400 });

    const token = request.cookies.get(COOKIE_NAME)?.value || "";
    if (!token) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const common = commonPayload(request, token);
    const [project, billing] = await Promise.all([
      callBackend({ ...common, action: "getProject", projectId }),
      callBackend({ ...common, action: "getProjectBilling", projectId }),
    ]);
    const sheets = buildCompatibilitySheets(projectId, (project || {}) as RecordRow, billing || {});
    const effectivePayments = (Array.isArray(billing?.payments) ? billing.payments : []).filter(paymentIsEffective);

    return NextResponse.json(
      {
        success: true,
        data: {
          projectId,
          sheets,
          payments: effectivePayments,
          updatedAt: new Date().toISOString(),
          mode: "canonical-api-itemized",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project billing.";
    return NextResponse.json({ success: false, error: message }, { status: statusForError(message) });
  }
}
