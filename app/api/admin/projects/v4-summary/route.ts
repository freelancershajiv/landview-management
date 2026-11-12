import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { getAdjustedProjectServiceFinancials } from "@/lib/billing-adjusted-financials";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only composition. NEVER replace with getBillingV2Snapshot:
// its GET path may create billing contracts and milestones.
type Row = Record<string, unknown>;
type Settled = PromiseSettledResult<unknown>;

const REQUIREMENTS = [
  { key: "photo", name: "Photo", match: /photo|photograph|picture/i },
  { key: "identity", name: "NID / Passport / Birth Certificate", match: /nid|national id|identity|passport|birth certificate/i },
  { key: "ownership", name: "Ownership Registry Paper", match: /ownership|registry|registered deed|land deed/i },
  { key: "khotian", name: "Khotian", match: /khotian|khatian|record of rights/i },
  { key: "tax", name: "Land Tax Slip", match: /land tax|land development tax|tax slip|tax receipt|dakhila/i },
] as const;

function text(value: unknown, limit = 300) {
  return String(value ?? "").trim().slice(0, limit);
}
function num(value: unknown): number {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
function available(result: Settled): result is PromiseFulfilledResult<unknown> {
  return result.status === "fulfilled";
}
function collected(row: Row) {
  const status = text(row.collection_status).toLowerCase();
  return Boolean(row.received_date || ["received", "collected", "verified", "held", "returned"].includes(status));
}
function projectDetails(row: Row) {
  return {
    id: text(row.id, 80),
    code: text(row.project_code, 80),
    name: text(row.project_name) || text(row.project_code, 80),
    owner: text(row.client_name_snapshot),
    phone: text(row.phone_number_snapshot, 80),
    location: text(row.location),
    phase: text(row.lifecycle_phase) || "Not set",
    proposalCode: text(row.reclassified_proposal_code),
    category: text(row.project_category || row.project_type),
    floors: row.floors == null ? null : num(row.floors),
    plotArea: row.plot_area == null ? null : num(row.plot_area),
    district: text(row.district),
    upazila: text(row.upazila_thana),
    localBody: text(row.local_body_name),
    ward: text(row.ward_no),
    mouza: text(row.mouza),
    jl: text(row.jl_no),
    dag: text(row.dag_no),
    khatian: text(row.khatian_no),
    designStage: text(row.design_stage_status),
    approvalStage: text(row.approval_stage_status),
    supervisionStage: text(row.supervision_stage_status),
    referral: text(row.referred_by),
    startDate: text(row.start_date, 25),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return json({ success: false, error: "Session expired." }, 401);
    if (!["admin", "manager"].includes(roleOf(user))) {
      return json({ success: false, error: "Management permission required." }, 403);
    }

    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (!projectCode) return json({ success: false, error: "Project ID is required." }, 400);

    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    const project = projects[0] as Row | undefined;
    if (!project) return json({ success: false, error: "Project not found." }, 404);
    const projectId = text(project.id, 80);

    const sourceNames = ["To-Do", "Service workflows", "Client document receipts", "Site visits", "Financial authority", "Service finances", "Project files", "Design submissions", "Approvals", "Design books", "Project ledger", "Proposal history"];
    const results = await Promise.allSettled([
      selectRows("todo_items", { filters: { project_code: projectCode }, order: "created_at:desc", limit: 1500 }),
      selectRows("project_service_workflows", { filters: { project_id: projectId }, order: "updated_at:desc", limit: 1500 }),
      selectRows("client_document_register", { filters: { project_id: projectId }, order: "created_at:desc", limit: 1500 }),
      selectRows("site_visits", { filters: { project_id: projectId }, order: "visit_date:desc", limit: 500 }),
      loadReceivableAuthority({ projectId }),
      getAdjustedProjectServiceFinancials(projectCode),
      selectRows("documents", { filters: { project_id: projectId }, order: "created_at:desc", limit: 500 }),
      selectRows("drawing_submissions", { filters: { project_id: projectId }, order: "created_at:desc", limit: 500 }),
      selectRows("approvals", { filters: { project_id: projectId }, order: "created_at:desc", limit: 500 }),
      selectRows("design_book_register", { filters: { project_id: projectId }, order: "created_at:desc", limit: 500 }),
      selectRows("project_management_ledger", { filters: { project_id: projectId }, order: "created_at:desc", limit: 1500 }),
      selectRows("proposals", { filters: { converted_project_code: projectCode }, limit: 2 }),
    ]);

    const warnings: string[] = [];
    const loaded: boolean[] = [];
    function rows(index: number, limit: number): Row[] {
      const result = results[index];
      if (!available(result) || !Array.isArray(result.value)) {
        warnings.push(sourceNames[index] + " are unavailable.");
        loaded[index] = false;
        return [];
      }
      loaded[index] = true;
      const value = result.value as Row[];
      if (value.length >= limit) warnings.push(sourceNames[index] + " reached its reading limit; counts may be incomplete.");
      return value;
    }

    const todos = rows(0, 1500);
    const workflows = rows(1, 1500);
    const receipts = rows(2, 1500);
    const visits = rows(3, 500);
    const storedFiles = rows(6, 500);
    const designs = rows(7, 500);
    const approvals = rows(8, 500);
    const designBooks = rows(9, 500);
    const ledger = rows(10, 1500);
    const proposals = rows(11, 2);
    const financeResult = results[4];
    const financeServicesResult = results[5];

    let financial: { billed: number; paid: number; due: number; openInvoiceCount: number; remainingUnallocated: number; writeoffs: number } | null = null;
    let billItems: Row[] = [];
    let invoiceItems: Row[] = [];
    let paymentItems: Row[] = [];
    let reviewCount = 0;
    if (available(financeResult)) {
      const auth = financeResult.value as Awaited<ReturnType<typeof loadReceivableAuthority>>;
      if (auth.complete) {
        const balance = auth.projects.get(projectId);
        financial = balance ? {
          billed: balance.billed, paid: balance.paid, due: balance.totalDue,
          openInvoiceCount: balance.openInvoiceCount,
          remainingUnallocated: balance.remainingUnallocated,
          writeoffs: balance.writeoffTotal,
        } : { billed: 0, paid: 0, due: 0, openInvoiceCount: 0, remainingUnallocated: 0, writeoffs: 0 };
        billItems = auth.bills.filter((bill) => bill.projectId === projectId).map((bill) => ({
          id: bill.billId, code: bill.billCode, description: text(bill.row.description),
          category: text(bill.row.billing_category || bill.row.category),
          status: text(bill.row.status),
          net: bill.effectiveAmount, allocated: bill.allocated,
          due: bill.dueBeforeRelief, settled: bill.settled,
          date: text(bill.row.bill_date, 30),
        }));
        invoiceItems = auth.invoices.filter((invoice) => invoice.projectId === projectId).map((invoice) => {
          const historicalReview = invoice.settledByBill && invoice.dueBeforeRelief > 0.01;
          if (historicalReview) reviewCount++;
          return {
            id: invoice.invoiceId, code: invoice.invoiceCode, billCode: invoice.billCode,
            status: invoice.status, amount: invoice.amount, allocated: invoice.allocated,
            dueBeforeRelief: invoice.dueBeforeRelief, historicalReview,
          };
        });
        paymentItems = auth.payments.filter((payment) => payment.projectId === projectId).map((payment) => ({
          id: payment.paymentId, code: payment.paymentCode,
          date: text(payment.row.payment_date, 30), amount: payment.amount,
          allocated: payment.allocated, unallocated: payment.unallocated,
          effective: payment.effective, method: text(payment.row.payment_method, 100),
        }));
      } else warnings.push("Financial authority returned incomplete records; monetary amounts have been withheld.");
    } else warnings.push("Financial authority could not be loaded; monetary amounts have been withheld.");

    const serviceFinances = available(financeServicesResult)
      ? ((financeServicesResult.value as Awaited<ReturnType<typeof getAdjustedProjectServiceFinancials>>).services)
      : [];
    if (!available(financeServicesResult)) warnings.push("Service-level financial balances are unavailable.");
    const serviceByKey = new Map(serviceFinances.map((row) => [text(row.serviceKey), row]));
    const services = workflows.map((row) => {
      const key = text(row.service_key);
      const finance = serviceByKey.get(key);
      return {
        id: text(row.id, 80), key, name: text(row.service_name),
        status: text(row.status), type: text(row.workflow_type),
        billed: finance ? num(finance.net) : null,
        paid: finance ? num(finance.paid) : null,
        due: finance ? num(finance.due) : null,
        paymentPolicy: finance ? (text(row.workflow_type).toLowerCase() === "engineering"
          ? (finance.due > 0.01 ? "Work allowed • delivery payment pending" : "Payment gate clear • review required")
          : (finance.due > 0.01 ? "Action awaits payment" : "Payment gate clear • requirements pending")) : "Financial gate unknown",
      };
    });

    const documents = REQUIREMENTS.map((requirement) => {
      const matches = receipts.filter((row) =>
        text(row.requirement_key) === requirement.key ||
        (!text(row.requirement_key) && requirement.match.test(text(row.document_name, 300)))
      );
      const registered = matches.filter(collected).length;
      const inCustody = matches.filter((row) =>
        ["Received", "Partial"].includes(text(row.collection_status)) &&
        text(row.return_status) !== "Returned"
      );
      const verified = inCustody.filter((row) => text(row.verification_status) === "Verified").length;
      const returned = matches.filter((row) => text(row.return_status) === "Returned").length;
      return {
        key: requirement.key, name: requirement.name,
        receiptCount: registered, onHandCount: inCustody.length,
        verifiedCount: verified, returnedCount: returned,
        status: !loaded[2] ? "Unavailable" : verified ? "Verified" :
          inCustody.length ? "On record" : returned ? "Returned" : "Not recorded",
        // Older receipts without an explicit verification status are not verified.
      };
    });
    const documentReceipts = receipts.map((row) => ({
      id: text(row.id, 80), code: text(row.register_code, 100),
      name: text(row.document_name), type: text(row.document_type),
      form: text(row.document_form, 100), collectionStatus: text(row.collection_status, 80),
      receivedDate: text(row.received_date, 25), receivedBy: text(row.received_by, 160),
      returnStatus: text(row.return_status, 80), returnedDate: text(row.returned_date, 25),
      quantity: num(row.quantity),
    }));

    const openTodos = todos.filter((row) => !["done", "completed", "cancelled", "canceled"].includes(text(row.status).toLowerCase()));
    const todoItems = todos.map((row) => ({
      id: text(row.id, 80), code: text(row.todo_code, 100),
      title: text(row.title), status: text(row.status),
      priority: text(row.priority, 50), dueDate: text(row.due_date, 25),
      assignee: text(row.assigned_to, 160),
      serviceKey: text(row.service_key, 140),
      isDelivery: row.is_delivery_step === true,
    }));
    const late = openTodos.filter((row) => {
      const due = text(row.due_date, 25);
      return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < new Date().toISOString().slice(0, 10);
    }).length;
    const timeline = [
      ...todos.map((row) => ({ at: text(row.updated_at || row.created_at, 40), kind: "To-Do", title: text(row.title), status: text(row.status) })),
      ...visits.map((row) => ({ at: text(row.visit_date || row.created_at, 40), kind: "Site Visit", title: text(row.purpose || row.visit_purpose) || text(row.visit_code), status: text(row.status) })),
      ...designs.map((row) => ({ at: text(row.submitted_at || row.created_at, 40), kind: "Design", title: text(row.drawing_title), status: text(row.status) })),
      ...approvals.map((row) => ({ at: text(row.created_at, 40), kind: "Approval", title: text(row.approval_type), status: text(row.status || row.approval_status) })),
      ...receipts.map((row) => ({ at: text(row.received_date || row.created_at, 40), kind: "Document", title: text(row.document_name), status: text(row.collection_status) })),
    ].filter((row) => row.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);

    if (reviewCount) warnings.push(String(reviewCount) + " historical paid/allocated invoice differences need financial review; these are not new dues.");

    return json({
      success: true,
      data: {
        project: projectDetails(project),
        proposal: proposals.length ? { code: text(proposals[0].proposal_code, 90), status: text(proposals[0].status) } : null,
        financial, invoices: invoiceItems, bills: billItems, payments: paymentItems,
        todos: { count: loaded[0] ? todos.length : null, open: loaded[0] ? openTodos.length : null, overdue: loaded[0] ? late : null, items: todoItems },
        services: { count: loaded[1] ? services.length : null, items: services },
        documents, documentReceipts,
        projectFiles: storedFiles.filter((row) => !row.archived_at).map((row) => ({
          id: text(row.id, 80), title: text(row.title), type: text(row.document_type),
          status: text(row.workflow_status), revision: text(row.revision_no, 35),
          date: text(row.document_date || row.created_at, 40),
        })),
        designs: designs.map((row) => ({
          id: text(row.drawing_code, 100), title: text(row.drawing_title),
          discipline: text(row.discipline), revision: text(row.revision, 50),
          status: text(row.status), date: text(row.submitted_at || row.created_at, 40),
        })),
        approvals: approvals.map((row) => ({
          id: text(row.approval_code, 100), type: text(row.approval_type),
          status: text(row.status || row.approval_status), authority: text(row.requested_from),
          date: text(row.decided_at || row.created_at, 40),
        })),
        designBooks: designBooks.map((row) => ({
          id: text(row.book_code, 100), type: text(row.book_type),
          status: text(row.delivery_status || row.preparation_status),
          revision: text(row.revision, 40),
        })),
        siteVisits: { count: loaded[3] ? visits.length : null, items: visits.map((row) => ({
          code: text(row.visit_code, 100), date: text(row.visit_date || row.created_at, 40),
          purpose: text(row.visit_purpose || row.purpose), status: text(row.status),
          notes: text(row.observations || row.notes, 400),
        })) },
        projectLedger: {
          count: loaded[10] ? ledger.length : null,
          debit: loaded[10] ? ledger.reduce((sum, row) => sum + num(row.debit), 0) : null,
          credit: loaded[10] ? ledger.reduce((sum, row) => sum + num(row.credit), 0) : null,
        },
        activity: timeline,
        alerts: {
          overdueTodos: loaded[0] ? late : null,
          missingDocuments: loaded[2] ? documents.filter((row) => row.status === "Not recorded" || row.status === "Returned").length : null,
          invoiceReview: financial ? reviewCount : null,
        },
        warnings,
        refreshedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    // Never return source/internal gateway error details to authenticated clients.
    console.error("LAND VIEW v4 project preview failed:", error);
    return json({ success: false, error: "Could not load the project workspace." }, 500);
  }
}
