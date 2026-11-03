import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { signBillVerification, signProjectVerification } from "@/lib/billing-verification";
import { insertRows, selectRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { requireLocalSession, readSignedWorkspaceUser, roleOf } from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";
const QUICK_USER_COOKIE = "landview_quick_user";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const BACKEND_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [0, 250, 800];

function cleanText(value: unknown, max = 80) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function secureEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readSignedQuickUser(value: string | undefined) {
  if (!value || !PROXY_SECRET) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = createHmac("sha256", PROXY_SECRET).update(`quick-user|${payload}`).digest("hex");
  if (!secureEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function parseBackendResponse(response: Response) {
  const raw = await response.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { response, raw, json };
}

async function backend(token: string, action: string, payload: Record<string, unknown> = {}) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("LAND VIEW backend is not configured.");
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const signal = AbortSignal.timeout(BACKEND_TIMEOUT_MS);
      const initial = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, proxySecret: PROXY_SECRET, token, ...payload }),
        cache: "no-store",
        redirect: "manual",
        signal,
      });

      let result = await parseBackendResponse(initial);
      if ([301, 302, 303].includes(initial.status)) {
        const location = initial.headers.get("location") || "";
        if (!location) throw new Error("LAND VIEW backend redirect was incomplete.");
        const redirected = await fetch(location, { method: "GET", cache: "no-store", redirect: "follow", signal });
        result = await parseBackendResponse(redirected);
      }

      if (result.json?.success) return result.json.data || {};
      if (result.json) {
        const message = String(result.json?.error || result.json?.message || `LAND VIEW backend request failed (${result.response.status}).`);
        const retryable = result.response.status === 429 || result.response.status >= 500;
        if (!retryable || attempt === RETRY_DELAYS_MS.length - 1) throw new Error(message);
        lastError = new Error(message);
        continue;
      }

      const retryable = result.response.status === 404 || result.response.status === 429 || result.response.status >= 500 || /^\s*</.test(result.raw);
      lastError = new Error("LAND VIEW backend returned an invalid response.");
      if (!retryable || attempt === RETRY_DELAYS_MS.length - 1) throw lastError;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "LAND VIEW backend request failed."));
      if (attempt === RETRY_DELAYS_MS.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("LAND VIEW backend request failed.");
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });

    const input = await request.json();
    const fileId = cleanText(input?.fileId, 30).toUpperCase();
    const billCode = cleanText(input?.billCode, 120).toUpperCase();
    const documentKind = cleanText(input?.documentKind, 30).toLowerCase();
    if (documentKind && !["project", "due"].includes(documentKind)) {
      return NextResponse.json({ success: false, error: "Invalid statement type." }, { status: 400 });
    }
    if (billCode && documentKind) {
      return NextResponse.json({ success: false, error: "Choose either a single invoice or a project statement." }, { status: 400 });
    }
    if (billCode && !/^BILL-[A-Z0-9-]{5,100}$/.test(billCode)) {
      return NextResponse.json({ success: false, error: "Invalid bill identifier." }, { status: 400 });
    }
    if (!/^LV-\d+$/.test(fileId)) return NextResponse.json({ success: false, error: "Invalid File ID." }, { status: 400 });

    // QR generation must be local and fast. The billing page has already
    // authenticated against Supabase, so do not make another Apps Script
    // workspace request just to generate the deterministic verification URL.
    let user = readSignedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value);
    if (!user) user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const role = roleOf(user);
    if (role === "client") {
      const rawIds = String((user as any).projectIds || (user as any).Project_IDs || (user as any).project_ids || "");
      const allowedIds = new Set(rawIds.split(/[;,\s]+/).map((id) => cleanText(id, 30).toUpperCase()).filter(Boolean));
      if (!allowedIds.has(fileId)) {
        return NextResponse.json({ success: false, error: "This project is not authorized for your client account." }, { status: 403 });
      }
    } else if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Billing verification is not available for this role." }, { status: 403 });
    }

    let token = signProjectVerification(fileId);
    let invoiceCode = "";
    if (billCode) {
      // Authorize the actual bill+invoice relation; never trust a client-supplied
      // project/bill pair or amounts when issuing a public verification link.
      const projects = await selectRows("projects", { filters: { project_code: fileId }, select: "id,project_code", limit: 1 });
      const project = projects[0];
      if (!project) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
      const [bills, invoices, authority] = await Promise.all([
        selectRows("bills", { filters: { project_id: project.id, bill_code: billCode }, limit: 1 }),
        selectRows("invoices", { filters: { project_id: project.id, bill_code: billCode }, order: "created_at:desc", limit: 1 }),
        loadReceivableAuthority({ projectId: project.id }),
      ]);
      const bill = bills[0];
      const invoice = invoices[0];
      const state = authority.billByCode.get(billCode);
      if (!bill || !invoice || !state || ["cancelled", "canceled", "void", "voided", "draft", "rejected"].includes(String(bill.status || "").toLowerCase())) {
        return NextResponse.json({ success: false, error: "An issued invoice for this bill was not found." }, { status: 404 });
      }
      invoiceCode = String(invoice.invoice_code || invoice.invoice_no || "").trim();
      token = signBillVerification(fileId, billCode);
      const actor = String((user as any).userId || (user as any).User_ID || (user as any).username || (user as any).Username || role);
      // Append-only issued-document snapshot. Does not touch bills, payments or ledgers.
      await insertRows("app_audit_log", {
        actor_user_key: actor,
        actor_role: role,
        action: "billing.invoice.generated",
        target: fileId,
        outcome: "success",
        entity_type: "billing_invoice",
        entity_id: billCode,
        source: "lv-auto-invoice",
        request_path: request.nextUrl.pathname,
        details: {
          fileId, billCode, invoiceCode,
          gross: state.gross + state.debitAdjustment,
          discount: state.effectiveDiscount,
          net: state.effectiveAmount,
          paid: state.paidForReceivable,
          due: state.dueBeforeRelief,
          issueDate: invoice.issue_date || bill.bill_date || "",
          generatedAt: new Date().toISOString(),
        },
      });
    }
    let statementRef = "";
    if (documentKind) {
      const project = (await selectRows("projects", {
        filters: { project_code: fileId }, select: "id,project_code", limit: 1,
      }))[0];
      if (!project) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
      const authority = await loadReceivableAuthority({ projectId: project.id });
      const balance = authority.projects.get(String(project.id));
      if (!balance) return NextResponse.json({ success: false, error: "Project billing was not found." }, { status: 404 });
      if (documentKind === "due" && balance.totalDue <= 0.009) {
        return NextResponse.json({ success: false, error: "There is no outstanding due balance." }, { status: 409 });
      }
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date()).replace(/-/g, "");
      statementRef = `${documentKind === "due" ? "DUE" : "STMT"}-${fileId}-${date}`;
      await insertRows("app_audit_log", {
        actor_user_key: String((user as any).userId || (user as any).User_ID || (user as any).username || role),
        actor_role: role,
        action: "billing.statement.generated",
        target: fileId,
        outcome: "success",
        entity_type: "billing_statement",
        entity_id: fileId,
        source: "lv-auto-invoice",
        request_path: request.nextUrl.pathname,
        details: {
          fileId, documentKind, statementRef,
          net: balance.billed,
          paid: balance.paid,
          due: balance.totalDue,
          generatedAt: new Date().toISOString(),
        },
      });
    }
    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = `${origin}/verify/${encodeURIComponent(token)}`;
    return NextResponse.json({ success: true, url, fileId, billCode: billCode || null, invoiceCode: invoiceCode || null, statementRef: statementRef || null, permanent: true }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    const message = error?.message || "Could not create verification link.";
    const status = /unauthorized|session expired|authentication required|invalid session/i.test(message) ? 401 : /access|role|authorized/i.test(message) ? 403 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
