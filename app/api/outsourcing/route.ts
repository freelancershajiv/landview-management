import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { insertRows, normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";
import { auditFailure, recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 1600) {
  return String(value ?? "").trim().slice(0, max);
}

function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function code(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function validDate(value: unknown, fallback = "") {
  const raw = text(value, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function actorOf(user: Row) {
  return text(user?.User_ID || user?.userId || user?.Employee_ID || user?.employeeId || user?.username || user?.Username || "LAND VIEW", 160);
}

function activePayment(row: Row) {
  return text(row.status, 30).toUpperCase() !== "VOID";
}

async function requireFinanceUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required.");
  return user;
}

async function loadData() {
  const [parties, jobs, payments, projects] = await Promise.all([
    selectRows("outsourcing_parties", { order: "active:desc,name:asc,created_at:desc", limit: 5000 }),
    selectRows("outsourcing_jobs", { order: "assigned_date:desc,created_at:desc", limit: 5000 }),
    selectRows("outsourcing_payments", { order: "payment_date:desc,created_at:desc", limit: 5000 }),
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
  ]);

  const partyById = new Map(parties.map((row: Row) => [String(row.id), row]));
  const projectById = new Map(projects.map((row: Row) => [String(row.id), row]));
  const postedPayments = payments.filter(activePayment);
  const paidByJob = new Map<string, number>();
  for (const payment of postedPayments) {
    const key = String(payment.job_id || "");
    paidByJob.set(key, (paidByJob.get(key) || 0) + Number(payment.amount || 0));
  }

  const enrichedJobs = jobs.map((job: Row) => {
    const paid = paidByJob.get(String(job.id)) || 0;
    const agreed = Number(job.agreed_amount || 0);
    const cancelled = text(job.status).toLowerCase() === "cancelled";
    const due = cancelled ? 0 : Math.max(0, agreed - paid);
    const project = projectById.get(String(job.project_id || "")) || {};
    const party = partyById.get(String(job.party_id || "")) || {};
    return {
      ...job,
      paid_amount: paid,
      due_amount: due,
      project_code: project.project_code || "",
      project_name: project.project_name || "",
      client_name: project.client_name_snapshot || "",
      party_name: party.name || "",
      party_type: party.party_type || "",
    };
  });

  const jobById = new Map(enrichedJobs.map((row: Row) => [String(row.id), row]));
  const enrichedPayments = payments.map((payment: Row) => {
    const job = jobById.get(String(payment.job_id || "")) || {};
    return {
      ...payment,
      job_code: job.job_code || "",
      service_type: job.service_type || "",
      project_code: job.project_code || "",
      party_name: job.party_name || "",
    };
  });

  const partySummaries = parties.map((party: Row) => {
    const partyJobs = enrichedJobs.filter((job: Row) => String(job.party_id) === String(party.id));
    const agreed = partyJobs.filter((job: Row) => text(job.status).toLowerCase() !== "cancelled").reduce((sum: number, job: Row) => sum + Number(job.agreed_amount || 0), 0);
    const paid = partyJobs.reduce((sum: number, job: Row) => sum + Number(job.paid_amount || 0), 0);
    const due = partyJobs.reduce((sum: number, job: Row) => sum + Number(job.due_amount || 0), 0);
    const activeJobs = partyJobs.filter((job: Row) => !["completed", "cancelled"].includes(text(job.status).toLowerCase())).length;
    return { ...party, agreed_amount: agreed, paid_amount: paid, due_amount: due, active_jobs: activeJobs };
  });

  const effectiveJobs = enrichedJobs.filter((job: Row) => text(job.status).toLowerCase() !== "cancelled");
  const summary = {
    agreed: effectiveJobs.reduce((sum: number, job: Row) => sum + Number(job.agreed_amount || 0), 0),
    paid: postedPayments.reduce((sum: number, payment: Row) => sum + Number(payment.amount || 0), 0),
    due: effectiveJobs.reduce((sum: number, job: Row) => sum + Number(job.due_amount || 0), 0),
    activeJobs: effectiveJobs.filter((job: Row) => text(job.status).toLowerCase() !== "completed").length,
    parties: parties.filter((party: Row) => party.active !== false).length,
  };

  return {
    summary,
    parties: partySummaries,
    jobs: enrichedJobs,
    payments: enrichedPayments,
    projects: projects.map((project: Row) => ({
      id: project.id,
      project_code: project.project_code,
      project_name: project.project_name || "",
      client_name: project.client_name_snapshot || "",
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireFinanceUser(request);
    const data = await loadData();
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load outsourcing payments.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  let auditUser: Row | null = null;
  let auditAction = "outsourcing.unknown";
  let auditTarget = "";
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireFinanceUser(request);
    auditUser = user;
    const actor = actorOf(user);
    const body = await request.json() as Row;
    const action = text(body.action, 80);
    auditAction = `outsourcing.${action || "unknown"}`;

    if (action === "addParty") {
      const name = text(body.name, 250);
      if (!name) return NextResponse.json({ success: false, error: "Enter the outsource person or firm name." }, { status: 400 });
      const partyType = body.partyType === "Firm" ? "Firm" : "Individual";
      const partyCode = code("OUTP");
      auditTarget = partyCode;
      const inserted = await insertRows("outsourcing_parties", {
        party_code: partyCode,
        name,
        party_type: partyType,
        phone: text(body.phone, 80) || null,
        email: text(body.email, 180) || null,
        expertise: text(body.expertise, 500) || null,
        preferred_payment_method: text(body.preferredPaymentMethod, 120) || null,
        notes: text(body.notes, 1500) || null,
        active: true,
        created_by: actor,
      });
      await recordAuditEvent({ user: auditUser, request, action: auditAction, entityType: "outsourcing_party", entityId: partyCode, target: name, after: inserted[0] || undefined });
      return NextResponse.json({ success: true, data: inserted[0] || null });
    }

    if (action === "updateParty") {
      const id = text(body.id, 80);
      if (!id) return NextResponse.json({ success: false, error: "Outsource party ID is required." }, { status: 400 });
      const found = await selectRows("outsourcing_parties", { filters: { id }, limit: 1 });
      if (!found.length) return NextResponse.json({ success: false, error: "Outsource person or firm was not found." }, { status: 404 });
      auditTarget = found[0].party_code || id;
      const changes: Row = {};
      if (body.name !== undefined) changes.name = text(body.name, 250) || found[0].name;
      if (body.partyType !== undefined) changes.party_type = body.partyType === "Firm" ? "Firm" : "Individual";
      if (body.phone !== undefined) changes.phone = text(body.phone, 80) || null;
      if (body.email !== undefined) changes.email = text(body.email, 180) || null;
      if (body.expertise !== undefined) changes.expertise = text(body.expertise, 500) || null;
      if (body.preferredPaymentMethod !== undefined) changes.preferred_payment_method = text(body.preferredPaymentMethod, 120) || null;
      if (body.notes !== undefined) changes.notes = text(body.notes, 1500) || null;
      if (body.active !== undefined) changes.active = Boolean(body.active);
      const updated = await updateRows("outsourcing_parties", { id }, changes);
      await recordAuditEvent({ user: auditUser, request, action: auditAction, entityType: "outsourcing_party", entityId: auditTarget, target: auditTarget, before: found[0], after: updated[0] || changes });
      return NextResponse.json({ success: true, data: updated[0] || null });
    }

    if (action === "addJob") {
      const partyId = text(body.partyId, 80);
      const serviceType = text(body.serviceType, 250);
      const agreedAmount = number(body.agreedAmount);
      if (!partyId) return NextResponse.json({ success: false, error: "Choose an outsource person or firm." }, { status: 400 });
      if (!serviceType) return NextResponse.json({ success: false, error: "Enter the outsourced service." }, { status: 400 });
      if (!(agreedAmount >= 0)) return NextResponse.json({ success: false, error: "Enter a valid agreed amount." }, { status: 400 });
      const party = await selectRows("outsourcing_parties", { filters: { id: partyId }, limit: 1 });
      if (!party.length || party[0].active === false) return NextResponse.json({ success: false, error: "Choose an active outsource person or firm." }, { status: 400 });
      let projectId: string | null = null;
      const projectCode = normalizeProjectCode(body.projectCode || "");
      if (projectCode) {
        const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
        if (!projects.length) return NextResponse.json({ success: false, error: `Project ${projectCode} was not found.` }, { status: 400 });
        projectId = projects[0].id;
      }
      const jobCode = code("OUTJOB");
      auditTarget = jobCode;
      const inserted = await insertRows("outsourcing_jobs", {
        job_code: jobCode,
        project_id: projectId,
        party_id: partyId,
        service_type: serviceType,
        scope_description: text(body.scopeDescription, 1800) || null,
        assigned_date: validDate(body.assignedDate, today()),
        target_date: validDate(body.targetDate) || null,
        agreed_amount: agreedAmount,
        status: "Assigned",
        notes: text(body.notes, 1500) || null,
        created_by: actor,
      });
      await recordAuditEvent({ user: auditUser, request, action: auditAction, entityType: "outsourcing_job", entityId: jobCode, target: jobCode, after: inserted[0] || undefined, details: { projectCode, party: party[0].name, serviceType } });
      return NextResponse.json({ success: true, data: inserted[0] || null });
    }

    if (action === "updateJob") {
      const id = text(body.id, 80);
      const found = await selectRows("outsourcing_jobs", { filters: { id }, limit: 1 });
      if (!found.length) return NextResponse.json({ success: false, error: "Outsourcing work was not found." }, { status: 404 });
      const job = found[0];
      auditTarget = job.job_code || id;
      const changes: Row = {};
      if (body.status !== undefined) {
        const status = text(body.status, 40);
        if (!["Assigned", "In Progress", "Submitted", "Completed", "Cancelled"].includes(status)) return NextResponse.json({ success: false, error: "Invalid work status." }, { status: 400 });
        changes.status = status;
        changes.completed_date = status === "Completed" ? validDate(body.completedDate, today()) : null;
      }
      if (body.agreedAmount !== undefined) {
        const agreedAmount = number(body.agreedAmount);
        if (!(agreedAmount >= 0)) return NextResponse.json({ success: false, error: "Enter a valid agreed amount." }, { status: 400 });
        const payments = await selectRows("outsourcing_payments", { filters: { job_id: id }, limit: 5000 });
        const paid = payments.filter(activePayment).reduce((sum: number, row: Row) => sum + Number(row.amount || 0), 0);
        if (agreedAmount + 0.009 < paid) return NextResponse.json({ success: false, error: `Agreed amount cannot be below already paid amount (${paid.toFixed(2)}).` }, { status: 400 });
        changes.agreed_amount = agreedAmount;
      }
      if (body.targetDate !== undefined) changes.target_date = validDate(body.targetDate) || null;
      if (body.scopeDescription !== undefined) changes.scope_description = text(body.scopeDescription, 1800) || null;
      if (body.notes !== undefined) changes.notes = text(body.notes, 1500) || null;
      const updated = await updateRows("outsourcing_jobs", { id }, changes);
      await recordAuditEvent({ user: auditUser, request, action: auditAction, entityType: "outsourcing_job", entityId: auditTarget, target: auditTarget, before: job, after: updated[0] || changes });
      return NextResponse.json({ success: true, data: updated[0] || null });
    }

    if (action === "addPayment") {
      const jobId = text(body.jobId, 80);
      const amount = number(body.amount);
      if (!jobId) return NextResponse.json({ success: false, error: "Choose an outsourcing work item." }, { status: 400 });
      if (!(amount > 0)) return NextResponse.json({ success: false, error: "Enter a payment amount greater than zero." }, { status: 400 });
      const jobs = await selectRows("outsourcing_jobs", { filters: { id: jobId }, limit: 1 });
      if (!jobs.length) return NextResponse.json({ success: false, error: "Outsourcing work was not found." }, { status: 404 });
      const job = jobs[0];
      if (text(job.status).toLowerCase() === "cancelled") return NextResponse.json({ success: false, error: "Cancelled outsourcing work cannot receive a payment." }, { status: 400 });
      const existing = await selectRows("outsourcing_payments", { filters: { job_id: jobId }, limit: 5000 });
      const alreadyPaid = existing.filter(activePayment).reduce((sum: number, row: Row) => sum + Number(row.amount || 0), 0);
      const due = Math.max(0, Number(job.agreed_amount || 0) - alreadyPaid);
      if (amount > due + 0.009) return NextResponse.json({ success: false, error: `Payment exceeds the outstanding due of BDT ${due.toFixed(2)}.` }, { status: 400 });
      const paymentCode = code("OUTPAY");
      auditTarget = paymentCode;
      const inserted = await insertRows("outsourcing_payments", {
        payment_code: paymentCode,
        job_id: jobId,
        payment_date: validDate(body.paymentDate, today()),
        amount,
        payment_method: text(body.paymentMethod, 120) || "Cash",
        reference_no: text(body.referenceNo, 300) || null,
        notes: text(body.notes, 1500) || null,
        status: "POSTED",
        created_by: actor,
      });
      await recordAuditEvent({ user: auditUser, request, action: auditAction, entityType: "outsourcing_payment", entityId: paymentCode, target: job.job_code || jobId, after: inserted[0] || undefined, details: { amount, serviceType: job.service_type } });
      return NextResponse.json({ success: true, data: inserted[0] || null });
    }

    if (action === "voidPayment") {
      const id = text(body.id, 80);
      const found = await selectRows("outsourcing_payments", { filters: { id }, limit: 1 });
      if (!found.length) return NextResponse.json({ success: false, error: "Outsourcing payment was not found." }, { status: 404 });
      const payment = found[0];
      auditTarget = payment.payment_code || id;
      if (text(payment.status).toUpperCase() === "VOID") return NextResponse.json({ success: true, data: payment });
      const updated = await updateRows("outsourcing_payments", { id }, { status: "VOID" });
      await recordAuditEvent({ user: auditUser, request, action: auditAction, entityType: "outsourcing_payment", entityId: auditTarget, target: auditTarget, before: payment, after: updated[0] || { status: "VOID" }, details: { ledgerReversal: true } });
      return NextResponse.json({ success: true, data: updated[0] || null });
    }

    return NextResponse.json({ success: false, error: "Unsupported outsourcing action." }, { status: 400 });
  } catch (error) {
    await auditFailure({ user: auditUser, request, action: auditAction, entityType: "outsourcing", entityId: auditTarget, target: auditTarget, error });
    const message = error instanceof Error ? error.message : "Outsourcing payment request failed.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
