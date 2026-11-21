import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, handleLandviewDataAction, normalizeProjectCode, roleOf, selectRows, supabaseGateway } from "@/lib/supabase-data";
import { syncPaidServiceWorkflows, workflowServiceKey, workflowServiceName } from "@/lib/service-workflow";
import { getAdjustedProjectServiceFinancials } from "@/lib/billing-adjusted-financials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BILLING_CATEGORIES = new Set(["engineering bill", "other services bill", "supervision bill"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function cleanKey(value: unknown) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{12,120}$/.test(key) ? key : "";
}
function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function normalized(value: unknown) {
  return text(value, 120).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function canonicalPaymentServiceType(value: unknown) {
  const raw = text(value, 120);
  const key = normalized(raw);
  if (!raw) return "";
  if (["municipality pass", "municipality file pass", "municipality approval", "municipality approval contract"].includes(key)) return "Municipality File Pass";
  if (key === "soil test" || key.startsWith("soil test ")) return "Soil Test";
  if (key === "digital survey" || key.startsWith("digital survey ")) return "Digital Survey";
  return raw;
}
function actorOf(user: Record<string, unknown>) {
  return employeeCodeOf(user) || text(user.username || user.Username || user.name || user.Name, 120) || "LAND VIEW";
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const body = await request.json() as Record<string, any>;
    const action = String(body.action || "").trim();
    if (!new Set(["saveBill", "savePayment", "saveDiscount"]).has(action)) {
      return NextResponse.json({ success: false, error: "Unsupported billing write action." }, { status: 400 });
    }
    const idempotencyKey = cleanKey(body.Idempotency_Key || body.idempotencyKey);
    if (!idempotencyKey) return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });

    const user = await requireLocalSession(request) as Record<string, unknown> | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    const role = roleOf(user);
    if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    const projectCode = normalizeProjectCode(body.Project_ID || body.projectId || body.Project_Code);
    const paymentCategory = normalized(body.Payment_For || body.Income_Category || body.Category);
    const serviceType = canonicalPaymentServiceType(body.Service_Type || body.serviceType);
    const serviceAllocations = Array.isArray(body.Service_Allocations) ? body.Service_Allocations as Array<Record<string, unknown>> : [];
    const receiveAdvance = body.Receive_Advance === true;
    let existingPayment = false;
    let paymentFingerprint = "";
    if (action === "savePayment") {
      const requestedAmount = num(body.Amount);
      if (!(requestedAmount > 0) || requestedAmount > 1_000_000_000) {
        return NextResponse.json({ success: false, error: "Enter a valid positive payment amount." }, { status: 400 });
      }
      if (receiveAdvance) {
        if (!projectCode || !BILLING_CATEGORIES.has(paymentCategory) || serviceAllocations.length || serviceType) {
          return NextResponse.json({ success: false, error: "An advance requires a project and billing category, without a selected service or manual allocations." }, { status: 400 });
        }
        if (!["admin", "manager", "accounts"].includes(role)) {
          return NextResponse.json({ success: false, error: "Finance editing access is required to receive advances." }, { status: 403 });
        }
      }
      if ((body.Project_ID || body.projectId || body.Project_Code) && !projectCode) {
        return NextResponse.json({ success: false, error: "Enter a valid project ID." }, { status: 400 });
      }
      const prior = (await selectRows("payments", {
        select: "billing_request_fingerprint", filters: { idempotency_key: idempotencyKey }, limit: 1,
      }))[0];
      const payload = {
        ...body, Project_ID: projectCode, Service_Type: serviceType, Idempotency_Key: idempotencyKey,
      };
      paymentFingerprint = createHash("sha256").update(JSON.stringify(payload, Object.keys(payload)
        .concat(serviceAllocations.flatMap((row) => Object.keys(row)))
        .filter((key, index, keys) => keys.indexOf(key) === index).sort())).digest("hex");
      if (prior && prior.billing_request_fingerprint !== paymentFingerprint) {
        return NextResponse.json({
          success: false,
          error: "This submission key belongs to another or older payment. Review the existing receipt before retrying.",
        }, { status: 409 });
      }
      existingPayment = Boolean(prior);
    }

    if (action === "savePayment" && !existingPayment && !receiveAdvance && paymentCategory === "other services bill") {
      if (!projectCode || !serviceType) {
        return NextResponse.json({ success: false, error: "Choose a billed Other Services service." }, { status: 400 });
      }
      const services = await getAdjustedProjectServiceFinancials(projectCode);
      const selectedKey = workflowServiceKey(serviceType === "Municipality File Pass" ? "Municipality Approval Contract" : serviceType);
      const selected = services.services.find((item) => item.billingCategory === "Other Services Bill" && item.serviceKey === selectedKey);
      if (!selected) {
        return NextResponse.json({ success: false, error: "The selected Other Services item is not billed to this project." }, { status: 400 });
      }
    }

    if (action === "savePayment" && !existingPayment && !receiveAdvance && paymentCategory.includes("engineering")) {
      if (!projectCode) return NextResponse.json({ success: false, error: "Project is required." }, { status: 400 });
      if (!serviceAllocations.length) {
        return NextResponse.json({ success: false, error: "Engineering Bill payments must be allocated to services. Use Finance → Service Payments." }, { status: 400 });
      }
      const paymentAmount = Math.max(0, num(body.Amount));
      const allocated = serviceAllocations.reduce((sum, row) => sum + Math.max(0, num(row.amount || row.allocatedAmount)), 0);
      if (Math.abs(paymentAmount - allocated) > 0.01) {
        return NextResponse.json({ success: false, error: `Service allocations must equal the payment amount (BDT ${paymentAmount.toLocaleString("en-BD")}).` }, { status: 400 });
      }
      const snapshot = await getAdjustedProjectServiceFinancials(projectCode);
      const byKey = new Map(snapshot.services.map((row) => [row.serviceKey, row]));
      const selectedServices = new Set<string>();
      for (const allocation of serviceAllocations) {
        const amount = Math.max(0, num(allocation.amount || allocation.allocatedAmount));
        if (amount <= 0) continue;
        const key = workflowServiceKey(allocation.serviceName || allocation.service || "");
        const service = byKey.get(key);
        if (!service || service.billingCategory !== "Engineering Bill") {
          return NextResponse.json({ success: false, error: `Invalid Engineering service allocation: ${text(allocation.serviceName || allocation.service) || "Unknown service"}.` }, { status: 400 });
        }
        if (selectedServices.has(key)) {
          return NextResponse.json({ success: false, error: "Enter a single allocation per Engineering service." }, { status: 400 });
        }
        selectedServices.add(key);
      }
    }

    let data: unknown;
    if (action === "saveDiscount") {
      const category = text(body.Billing_Category || body.Category || body.category, 80);
      const discountAmount = num(body.Amount || body.Discount || body.discount);
      if (!projectCode) return NextResponse.json({ success: false, error: "Project is required." }, { status: 400 });
      if (!category) return NextResponse.json({ success: false, error: "Discount category is required." }, { status: 400 });
      if (!(discountAmount > 0)) return NextResponse.json({ success: false, error: "Enter a valid discount amount." }, { status: 400 });

      data = await supabaseGateway("applyBillingDiscount", {
        projectCode,
        category,
        amount: discountAmount,
        discountDate: text(body.Discount_Date || body.Date, 20) || new Date().toISOString().slice(0, 10),
        notes: text(body.Notes || body.notes, 1000),
        createdBy: actorOf(user),
        idempotencyKey,
      });
    } else {
      const allocations = !receiveAdvance && paymentCategory.includes("engineering")
        ? serviceAllocations.flatMap((allocation) => {
            const amount = num(allocation.amount || allocation.allocatedAmount);
            if (amount <= 0) return [];
            const serviceName = workflowServiceName(allocation.serviceName || allocation.service || "");
            return [{
              service_name: serviceName,
              service_key: workflowServiceKey(serviceName),
              allocated_amount: amount,
              discount_allocated: Math.max(0, num(allocation.discount)),
            }];
          })
        : [];
      const paymentOptions = action === "savePayment" ? {
        fingerprint: paymentFingerprint,
        serviceType,
        allocations,
      } : undefined;
      data = await handleLandviewDataAction(action, {
        ...body, ...(action === "savePayment" ? { Project_ID: projectCode } : {}), Idempotency_Key: idempotencyKey,
      }, user, paymentOptions);

      if (action === "savePayment" && projectCode) {
        try { await syncPaidServiceWorkflows(projectCode, actorOf(user)); }
        catch (workflowError) { console.error("LAND VIEW paid-service workflow sync failed after payment:", workflowError); }
      }
    }

    const masterAdmin = role === "admin";
    return NextResponse.json({
      success: true,
      data: masterAdmin && action === "savePayment"
        ? { ...(data as Record<string, unknown>), Approval_Status: "Approved", Acknowledgement_Status: "Unseen" }
        : data,
      ...(masterAdmin && action === "savePayment" ? {
        autoApproved: true,
        acknowledgementRequiredBy: "EMP-0001",
        ledgerPosted: true,
        ledgerDeferred: false,
      } : {}),
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The billing write response timed out. Refresh Billing before trying again so you do not duplicate a transaction."
      : error instanceof Error ? error.message : "Billing write failed.";
    const status = /belongs to another|conflicts with/i.test(message) ? 409 : /required|invalid|cannot exceed|must be greater|choose a billed|allocat|positive payment/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
