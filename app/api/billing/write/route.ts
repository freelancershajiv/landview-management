import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, handleLandviewDataAction, insertRows, roleOf, selectRows, supabaseGateway, updateRows } from "@/lib/supabase-data";
import { syncPaidServiceWorkflows, workflowServiceKey, workflowServiceName } from "@/lib/service-workflow";
import { getAdjustedProjectServiceFinancials } from "@/lib/billing-adjusted-financials";
import { callOutsourcingAutomation } from "@/lib/outsourcing-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OTHER_SERVICE_TYPES = new Set(["Soil Test", "Digital Survey", "Municipality File Pass"]);

type OutsourcingAllocation = {
  partyId: string;
  serviceName: string;
  serviceKey: string;
  amount: number;
  notes: string;
};

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
function outsourcingAllocationsOf(body: Record<string, any>): OutsourcingAllocation[] {
  const rows = Array.isArray(body.Outsourcing_Allocations)
    ? body.Outsourcing_Allocations as Array<Record<string, unknown>>
    : [];
  return rows.map((row) => {
    const rawService = row.serviceName || row.service || row.serviceType || "";
    const serviceName = workflowServiceName(rawService) || canonicalPaymentServiceType(rawService);
    return {
      partyId: text(row.partyId || row.party_id, 80),
      serviceName,
      serviceKey: text(row.serviceKey || row.service_key, 180) || workflowServiceKey(serviceName),
      amount: Math.max(0, num(row.amount || row.agreedAmount || row.agreed_amount)),
      notes: text(row.notes, 1000),
    };
  }).filter((row) => row.amount > 0 || row.partyId || row.serviceName);
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
    if (!["admin", "manager", "accounts", "employee"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    const projectCode = text(body.Project_ID || body.projectId || body.Project_Code, 60).toUpperCase();
    const paymentCategory = normalized(body.Payment_For || body.Income_Category || body.Category);
    const serviceType = canonicalPaymentServiceType(body.Service_Type || body.serviceType);
    const serviceAllocations = Array.isArray(body.Service_Allocations) ? body.Service_Allocations as Array<Record<string, unknown>> : [];
    const outsourcingAllocations = action === "savePayment" ? outsourcingAllocationsOf(body) : [];

    if (action === "savePayment" && (paymentCategory === "other services bill" || paymentCategory === "other services" || paymentCategory === "others bill")) {
      if (!OTHER_SERVICE_TYPES.has(serviceType)) {
        return NextResponse.json({ success: false, error: "Choose Soil Test, Digital Survey or Municipality File Pass for Other Services." }, { status: 400 });
      }
    }

    if (action === "savePayment" && paymentCategory.includes("engineering")) {
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
      for (const allocation of serviceAllocations) {
        const amount = Math.max(0, num(allocation.amount || allocation.allocatedAmount));
        if (amount <= 0) continue;
        const key = workflowServiceKey(allocation.serviceName || allocation.service || "");
        const service = byKey.get(key);
        if (!service || service.billingCategory !== "Engineering Bill") {
          return NextResponse.json({ success: false, error: `Invalid Engineering service allocation: ${text(allocation.serviceName || allocation.service) || "Unknown service"}.` }, { status: 400 });
        }
        if (amount > service.due + 0.01) {
          return NextResponse.json({ success: false, error: `${service.serviceName} allocation cannot exceed its due of BDT ${service.due.toLocaleString("en-BD")}.` }, { status: 400 });
        }
      }
    }

    if (action === "savePayment" && outsourcingAllocations.length) {
      if (!projectCode) return NextResponse.json({ success: false, error: "Project is required for outsourcing." }, { status: 400 });
      for (const allocation of outsourcingAllocations) {
        if (!allocation.partyId) return NextResponse.json({ success: false, error: `${allocation.serviceName || "Outsourced service"}: choose an outsourcer.` }, { status: 400 });
        if (!allocation.serviceName || !allocation.serviceKey) return NextResponse.json({ success: false, error: "Every outsourcing allocation must be linked to a service." }, { status: 400 });
        if (!(allocation.amount > 0)) return NextResponse.json({ success: false, error: `${allocation.serviceName}: outsourcing amount must be greater than zero.` }, { status: 400 });
      }

      if (paymentCategory.includes("engineering")) {
        const clientAllocatedKeys = new Set(serviceAllocations
          .filter((row) => Math.max(0, num(row.amount || row.allocatedAmount)) > 0)
          .map((row) => workflowServiceKey(row.serviceName || row.service || "")));
        const invalid = outsourcingAllocations.find((row) => !clientAllocatedKeys.has(row.serviceKey));
        if (invalid) {
          return NextResponse.json({ success: false, error: `Allocate client payment to ${invalid.serviceName} before creating its outsourcing bill.` }, { status: 400 });
        }
      } else if (serviceType) {
        const serviceKey = workflowServiceKey(serviceType);
        const invalid = outsourcingAllocations.find((row) => row.serviceKey !== serviceKey);
        if (invalid) return NextResponse.json({ success: false, error: "Outsourcing must belong to the service receiving this payment." }, { status: 400 });
      }

      await callOutsourcingAutomation({ action: "validateAllocations", items: outsourcingAllocations });
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
      data = await handleLandviewDataAction(action, { ...body, Service_Type: serviceType, Idempotency_Key: idempotencyKey }, user);

      if (action === "savePayment") {
        const paymentCode = text((data as Record<string, unknown>)?.Payment_ID, 160);
        if (!paymentCode) throw new Error("Payment was saved but its payment ID could not be resolved.");
        const paymentRows = await selectRows("payments", { filters: { payment_code: paymentCode }, limit: 1 });
        if (!paymentRows.length) throw new Error("Payment was saved but the database record could not be resolved.");
        const payment = paymentRows[0];
        const projectRows = projectCode ? await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 }) : [];
        const project = projectRows[0];

        if (serviceType) {
          const financeScope = serviceType === "Municipality File Pass" ? "municipality_file_pass" : "main";
          await updateRows("payments", { payment_code: paymentCode }, { service_type: serviceType, finance_scope: financeScope });
          data = { ...(data as Record<string, unknown>), Service_Type: serviceType, Finance_Scope: financeScope };
        }

        if (paymentCategory.includes("engineering") && project) {
          const rows = serviceAllocations
            .map((allocation) => {
              const allocatedAmount = Math.max(0, num(allocation.amount || allocation.allocatedAmount));
              if (!(allocatedAmount > 0)) return null;
              const serviceName = workflowServiceName(allocation.serviceName || allocation.service || "");
              return {
                payment_id: payment.id,
                payment_code: paymentCode,
                project_id: project.id,
                project_code: projectCode,
                billing_category: "Engineering Bill",
                bill_id: null,
                bill_code: null,
                service_name: serviceName,
                service_key: workflowServiceKey(serviceName),
                allocated_amount: allocatedAmount,
                discount_allocated: Math.max(0, num(allocation.discount)),
                created_by: actorOf(user),
                created_at: new Date().toISOString(),
              };
            })
            .filter(Boolean) as Array<Record<string, unknown>>;
          if (rows.length) await insertRows("payment_service_allocations", rows);
        }

        if (outsourcingAllocations.length) {
          let outsourcingResult: Record<string, unknown> | null = null;
          let automationError: unknown = null;
          for (let attempt = 0; attempt < 2 && !outsourcingResult; attempt += 1) {
            try {
              outsourcingResult = await callOutsourcingAutomation({
                action: "addJobsFromPayment",
                paymentCode,
                assignedDate: text(body.Payment_Date || body.Date, 20) || new Date().toISOString().slice(0, 10),
                items: outsourcingAllocations,
                actor: actorOf(user),
              }) as Record<string, unknown>;
            } catch (error) {
              automationError = error;
            }
          }
          if (!outsourcingResult) {
            const warning = automationError instanceof Error ? automationError.message : "Outsourcing automation failed.";
            console.error("LAND VIEW outsourcing automation failed after payment:", automationError);
            data = { ...(data as Record<string, unknown>), Outsourcing_Count: 0, Outsourcing_Warning: warning };
          } else {
            data = {
              ...(data as Record<string, unknown>),
              Outsourcing_Count: Number(outsourcingResult.count || 0),
              Outsourcing_Jobs: Array.isArray(outsourcingResult.jobs) ? outsourcingResult.jobs : [],
            };
          }
        }

        if (projectCode) {
          try { await syncPaidServiceWorkflows(projectCode, actorOf(user)); }
          catch (workflowError) { console.error("LAND VIEW paid-service workflow sync failed after payment:", workflowError); }
        }
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
    const status = /required|invalid|cannot exceed|must be greater|choose soil test|allocat|outsourc/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
