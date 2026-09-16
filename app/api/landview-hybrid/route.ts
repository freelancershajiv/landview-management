import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../landview/route";
import {
  handleLandviewDataAction,
  normalizeProjectCode,
  roleOf,
  selectRows,
  SUPABASE_DATA_GET_ACTIONS,
  SUPABASE_DATA_POST_ACTIONS,
  supabaseGateway,
  upsertRows,
} from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_COOKIE = "landview_data_user";
const DATA_COOKIE_AGE = 5 * 60;
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

const GOOGLE_SIDE_EFFECT_ACTIONS = new Set([
  "createProject", "deleteProject", "createEmployee", "updateEmployee", "deleteEmployee",
]);
const ADMIN_ONLY_DATA_WRITES = new Set([
  "createProject", "updateProject", "deleteProject", "updateProjectEmployees",
  "createEmployee", "updateEmployee", "deleteEmployee", "saveBill", "createBill",
  "initializeErpSheets",
]);
const FINANCE_WRITES = new Set(["savePayment", "createPayment", "reviewChairmanPendingApproval"]);

function sign(value: string) {
  return createHmac("sha256", PROXY_SECRET).update(`supabase-user-v1|${value}`).digest("hex");
}
function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a, "utf8"), bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function encodeUser(user: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function decodeUser(value: string | undefined) {
  if (!value || !PROXY_SECRET) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = value.slice(0, dot), signature = value.slice(dot + 1);
  if (!secureEqual(signature, sign(payload))) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return user && typeof user === "object" ? user as Record<string, unknown> : null;
  } catch { return null; }
}
function dataCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: DATA_COOKIE_AGE, priority: "high" as const };
}
function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch { return false; }
}
function numberOf(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function readLegacySession(request: NextRequest) {
  const url = new URL(request.url);
  url.pathname = "/api/landview";
  url.search = "";
  url.searchParams.set("action", "getSession");
  const sessionRequest = new NextRequest(url, { method: "GET", headers: new Headers(request.headers) });
  const response = await legacyGET(sessionRequest);
  const json = await response.clone().json().catch(() => null);
  if (!response.ok || !json?.success || !json?.data?.authenticated || !json?.data?.user) return null;
  return json.data.user as Record<string, unknown>;
}
async function authorizedUser(request: NextRequest) {
  const cached = decodeUser(request.cookies.get(DATA_COOKIE)?.value);
  if (cached) return cached;
  return readLegacySession(request);
}
function ok(data: unknown, user?: Record<string, unknown> | null) {
  const response = NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Landview-Data": "supabase" } });
  if (user) response.cookies.set(DATA_COOKIE, encodeUser(user), dataCookieOptions());
  return response;
}
function statusForError(message: string) {
  if (/session|authentication|unauthorized/i.test(message)) return 401;
  if (/access|permission/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  return 502;
}

async function syncProvisionedRecord(action: string, input: Record<string, unknown>, sourceData: unknown) {
  const source = sourceData && typeof sourceData === "object" ? sourceData as Record<string, unknown> : {};
  if (action === "createProject") return supabaseGateway("syncProject", { record: { ...input, ...source } });
  if (action === "deleteProject") return supabaseGateway("deleteProject", { projectId: input.projectId || input.Project_ID });
  if (action === "createEmployee" || action === "updateEmployee") return supabaseGateway("syncEmployee", { record: { ...input, ...source } });
  if (action === "deleteEmployee") return supabaseGateway("deleteEmployee", { employeeId: input.employeeId || input.Employee_ID });
  return null;
}

async function mirrorInvoice(sourceData: unknown, input: Record<string, unknown>, user: Record<string, unknown>) {
  const source = sourceData && typeof sourceData === "object" ? sourceData as Record<string, any> : {};
  const invoice = source.invoice && typeof source.invoice === "object" ? source.invoice as Record<string, any> : {};
  const invoiceCode = String(source.invoiceId || invoice.Invoice_ID || invoice.Invoice_No || "").trim();
  const projectCode = normalizeProjectCode(source.projectId || input.projectId || input.Project_ID);
  if (!invoiceCode || !projectCode) return sourceData;
  const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  const project = projects[0];
  if (!project) return sourceData;
  const totalBill = numberOf(source.totalBill ?? invoice.Total_Bill ?? invoice.Amount);
  const totalPaid = numberOf(source.totalPaid ?? invoice.Total_Paid ?? invoice.Paid_Amount);
  const due = numberOf(source.due ?? invoice.Due ?? Math.max(0, totalBill - totalPaid));
  await upsertRows("invoices", {
    invoice_code: invoiceCode,
    invoice_no: String(invoice.Invoice_No || invoiceCode),
    project_id: project.id,
    issue_date: String(invoice.Issue_Date || new Date().toISOString().slice(0, 10)),
    amount: totalBill,
    status: due > 0.009 ? "OPEN" : "PAID",
    paid_amount_snapshot: totalPaid,
    due_amount_snapshot: due,
    pdf_url: String(source.pdfUrl || invoice.PDF_URL || "") || null,
    drive_file_id: String(source.fileId || invoice.File_ID || "") || null,
    project_name_snapshot: String(source.projectName || project.project_name || "") || null,
    client_name_snapshot: String(source.clientName || project.client_name_snapshot || "") || null,
    total_bill_snapshot: totalBill,
    total_paid_snapshot: totalPaid,
    pdf_file_id: String(source.fileId || invoice.File_ID || "") || null,
    download_url: String(source.downloadUrl || invoice.Download_URL || "") || null,
    invoice_folder_url: String(source.folderUrl || invoice.Folder_URL || "") || null,
    source_created_by: String(user.userId || user.User_ID || user.username || user.Username || "LAND VIEW"),
    source_created_at: new Date().toISOString(),
    source_updated_at: new Date().toISOString(),
  }, "invoice_code");
  return sourceData;
}

export async function GET(request: NextRequest) {
  const action = String(request.nextUrl.searchParams.get("action") || "").trim();
  if (!SUPABASE_DATA_GET_ACTIONS.has(action)) return legacyGET(request);

  try {
    const user = await authorizedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    const input: Record<string, unknown> = {};
    request.nextUrl.searchParams.forEach((value, key) => { if (key !== "action") input[key] = value; });
    const data = await handleLandviewDataAction(action, input, user);
    return ok(data, user);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Google compatibility service|Finance tab .* not available/i.test(message)) return legacyGET(request);
    console.warn("LAND VIEW Supabase read failed", { action, message: message.slice(0, 220) });
    return NextResponse.json({ success: false, error: message }, { status: statusForError(message), headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const copy = request.clone();
  const input = await copy.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(input.action || "").trim();
  const isInvoiceGeneration = action === "createInvoice";
  if (!SUPABASE_DATA_POST_ACTIONS.has(action) && !isInvoiceGeneration) return legacyPOST(request);
  if (!originAllowed(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });

  try {
    const user = await authorizedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    const role = roleOf(user);
    if ((ADMIN_ONLY_DATA_WRITES.has(action) || isInvoiceGeneration) && !["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Management access is required." }, { status: 403 });
    }
    if (FINANCE_WRITES.has(action) && !["admin", "manager", "accounts", "employee"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    if (isInvoiceGeneration) {
      const legacy = await legacyPOST(request);
      const json = await legacy.clone().json().catch(() => null);
      if (!legacy.ok || !json?.success) return legacy;
      await mirrorInvoice(json.data, input, user);
      return ok(json.data, user);
    }

    // Project/employee provisioning still creates or maintains Google-backed
    // login/Drive resources. Run that side effect first, then make Supabase the
    // canonical record returned to the app.
    if (GOOGLE_SIDE_EFFECT_ACTIONS.has(action)) {
      const legacy = await legacyPOST(request);
      const json = await legacy.clone().json().catch(() => null);
      if (!legacy.ok || !json?.success) return legacy;
      const synced = await syncProvisionedRecord(action, input, json.data);
      return ok(synced ?? json.data, user);
    }

    const data = await handleLandviewDataAction(action, input, user);
    return ok(data, user);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("LAND VIEW Supabase write failed", { action, message: message.slice(0, 220) });
    return NextResponse.json({ success: false, error: message }, { status: statusForError(message), headers: { "Cache-Control": "no-store" } });
  }
}
