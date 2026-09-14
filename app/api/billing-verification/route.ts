import { NextRequest, NextResponse } from "next/server";
import { signProjectVerification, type VerificationSnapshot } from "@/lib/billing-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

function cleanText(value: unknown, max = 80) {
  return String(value ?? "").trim().slice(0, max);
}

function amount(value: unknown) {
  const n = Number(String(value ?? "").replace(/BDT|Tk\.?|৳|,/gi, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function backend(token: string, action: string, payload: Record<string, unknown> = {}) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("LAND VIEW backend is not configured.");
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, proxySecret: PROXY_SECRET, token, ...payload }),
    cache: "no-store",
    redirect: "follow",
  });
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error("LAND VIEW backend returned an invalid response."); }
  if (!json?.success) throw new Error(String(json?.error || json?.message || "LAND VIEW backend request failed."));
  return json.data || {};
}

function dateValue(value: unknown) {
  const text = cleanText(value, 40);
  if (!text) return 0;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function issueDateFromBilling(billing: Record<string, any[]>) {
  const depositNames = ["Design Deposit", "Engineering Deposit", "S Deposit", "Supervision Deposit", "Others Bill Deposit", "Others Deposit"];
  const dates: number[] = [];
  for (const name of depositNames) {
    const rows = Array.isArray(billing?.[name]) ? billing[name] : [];
    for (const row of rows) {
      const raw = row?.Date ?? row?.Payment_Date ?? row?.["Payment Date"] ?? row?.["Deposit Date"];
      const value = dateValue(raw);
      if (value) dates.push(value);
    }
  }
  const latest = dates.length ? new Date(Math.max(...dates)) : new Date();
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric" }).format(latest);
}

function clientSnapshot(project: any): VerificationSnapshot {
  const finance = project?.finance || {};
  const billing = project?.billing || {};
  const specs = [
    { name: "Engineering", gross: amount(finance.engineeringBill), paid: amount(finance.engineeringPaid), due: amount(finance.engineeringDue), billRows: billing["Design Bill"], payRows: billing["Design Deposit"] },
    { name: "Supervision", gross: amount(finance.supervisionBill), paid: amount(finance.supervisionPaid), due: amount(finance.supervisionDue), billRows: billing["Supervision Bill"], payRows: billing["S Deposit"] || billing["Supervision Deposit"] },
    { name: "Others", gross: amount(finance.othersBill), paid: amount(finance.othersPaid), due: amount(finance.othersDue), billRows: billing["Others Bill"], payRows: billing["Others Bill Deposit"] || billing["Others Deposit"] },
  ];
  const categories = specs.map((spec) => ({
    name: spec.name,
    gross: spec.gross,
    paid: spec.paid,
    due: spec.due,
    discount: Math.max(0, spec.gross - spec.paid - spec.due),
    hasRows: (Array.isArray(spec.billRows) && spec.billRows.length > 0) || (Array.isArray(spec.payRows) && spec.payRows.length > 0),
  })).filter((spec) => spec.hasRows || Math.abs(spec.gross) > 0.009 || Math.abs(spec.paid) > 0.009 || Math.abs(spec.due) > 0.009 || Math.abs(spec.discount) > 0.009)
    .map(({ hasRows: _hasRows, ...spec }) => spec);

  const gross = amount(finance.totalBill) || categories.reduce((sum, item) => sum + item.gross, 0);
  const paid = amount(finance.totalPaid) || categories.reduce((sum, item) => sum + item.paid, 0);
  const due = finance.due !== undefined && finance.due !== null && String(finance.due).trim() !== ""
    ? amount(finance.due)
    : categories.reduce((sum, item) => sum + item.due, 0);

  return {
    clientName: cleanText(project?.clientName, 80),
    issueDate: issueDateFromBilling(billing),
    categories,
    totals: { gross, paid, due, discount: Math.max(0, gross - paid - due) },
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (!sessionToken) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const input = await request.json();
    const fileId = cleanText(input?.fileId, 30).toUpperCase();
    if (!/^LV-\d+$/.test(fileId)) return NextResponse.json({ success: false, error: "Invalid File ID." }, { status: 400 });

    const session = await backend(sessionToken, "getSession");
    const user = session?.user || {};
    const role = cleanText(user?.role || user?.Role, 30).toLowerCase().replace(/\s+/g, "");
    let billing: VerificationSnapshot;

    if (role === "client") {
      const workspace = await backend(sessionToken, "getPublicProjects", { _clientPortal: "1", clientOp: "workspace" });
      const project = (workspace?.projects || []).find((item: any) => cleanText(item?.projectId, 30).toUpperCase() === fileId);
      if (!project) return NextResponse.json({ success: false, error: "This project is not authorized for your client account." }, { status: 403 });
      billing = clientSnapshot(project);
    } else if (["admin", "manager", "accounts"].includes(role)) {
      const suppliedBilling = input?.billing as VerificationSnapshot | undefined;
      if (!suppliedBilling || !Array.isArray(suppliedBilling?.categories) || !suppliedBilling?.totals) {
        return NextResponse.json({ success: false, error: "Billing snapshot is required for verification." }, { status: 400 });
      }
      billing = suppliedBilling;
    } else {
      return NextResponse.json({ success: false, error: "Billing verification is not available for this role." }, { status: 403 });
    }

    const token = signProjectVerification(fileId, billing);
    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = `${origin}/verify/${encodeURIComponent(token)}`;

    return NextResponse.json({ success: true, url, fileId }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    const message = error?.message || "Could not create verification link.";
    const status = /unauthorized|session|access|role/i.test(message) ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
