import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { handleLandviewDataAction, normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { getProjectServiceFinancials } from "@/lib/service-workflow";
import { loadReceivableAuthority, type PaymentReceivableState, type ReceivableAuthority } from "@/lib/billing-receivable-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type Category = "Engineering Bill" | "Design Books" | "Supervision Bill" | "Other Services Bill";
type Group = { bills: Row[]; payments: PaymentReceivableState[]; gross: number; discount: number; paid: number; due: number; preDue: number };
const TABS = ["Summary", "File List", "Design Bill", "Design Deposit", "Design Books Bill", "Design Books Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"];

function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown) { const n = Number(text(v).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function category(row: Row): Category {
  const source = text(
    row.Billing_Category || row.billing_category ||
    row.Income_Category || row.income_category ||
    row.Category || row.category ||
    row.Payment_For || row.payment_for ||
    row.Description || row.description,
  ).toLowerCase();
  if (/design\s*books?/.test(source)) return "Design Books";
  if (/supervision/.test(source)) return "Supervision Bill";
  if (/other|soil|survey|municipality|file pass/.test(source)) return "Other Services Bill";
  return "Engineering Bill";
}
function effectiveBill(row: Row) {
  return !["draft", "void", "voided", "cancelled", "canceled", "rejected", "returned"].includes(text(row.Status || row.status).toLowerCase());
}
function adjustmentKind(row: Row) {
  const createdVia = text(row.Created_Via || row.created_via).toLowerCase();
  if (createdVia.includes("credit note")) return "credit";
  if (createdVia.includes("debit note")) return "debit";
  return "";
}
function serviceDescription(row: Row, fallback: string) {
  const description = text(row.Description || row.description || fallback);
  const clean = description.replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
  return clean || fallback;
}
function sheet(tab: string, headers: string[], rows: unknown[][], totals: Row = { gross: 0, discount: 0, billed: 0, paid: 0, due: 0, projects: 1 }) {
  return { tab, tabs: [...TABS], headers, rows: rows.map((r) => r.map((v) => String(v ?? ""))), totals, url: "", updatedAt: new Date().toISOString() };
}
function reduceGroupDue(groups: Record<Category, Group>, categories: Category[], target: number) {
  let reduction = Math.max(0, categories.reduce((sum, key) => sum + groups[key].due, 0) - Math.max(0, target));
  for (const key of [...categories].sort((a, b) => groups[b].due - groups[a].due)) {
    if (reduction <= 0.009) break;
    const applied = Math.min(groups[key].due, reduction);
    groups[key].due -= applied;
    reduction -= applied;
  }
}

async function billingV2CommercialSummary(projectCode: string) {
  const projectRows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  const project = projectRows[0];
  if (!project) return null;
  const contracts = await selectRows("project_contracts", { filters: { project_id: project.id }, limit: 1 });
  const contract = contracts[0];
  if (!contract) return null;

  const [services, milestones, workflows, financials] = await Promise.all([
    selectRows("project_contract_services", { filters: { contract_id: contract.id }, order: "created_at:asc", limit: 500 }),
    selectRows("billing_milestones", { filters: { contract_id: contract.id }, order: "sequence_no:asc,created_at:asc", limit: 2000 }),
    selectRows("project_service_workflows", { filters: { project_id: project.id }, order: "updated_at:desc", limit: 500 }),
    getProjectServiceFinancials(projectCode),
  ]);

  const financeByKey = new Map(financials.services.map((row) => [text(row.serviceKey), row]));
  const workflowByKey = new Map(workflows.map((row: Row) => [text(row.service_key), row]));
  const milestonesByKey = new Map<string, Row[]>();
  for (const milestone of milestones) {
    const key = text(milestone.service_key);
    const list = milestonesByKey.get(key) || [];
    list.push(milestone);
    milestonesByKey.set(key, list);
  }

  const serviceRows = services.map((service: Row) => {
    const key = text(service.service_key);
    const finance = financeByKey.get(key);
    const serviceMilestones = milestonesByKey.get(key) || [];
    const contractNet = Math.max(0, num(service.contract_net));
    const billed = Math.max(0, num(finance?.net));
    const paid = Math.max(0, num(finance?.paid));
    const due = Math.max(0, num(finance?.due));
    const unbilled = Math.max(0, contractNet - billed);
    const next = serviceMilestones.find((row) => ["ready_to_bill", "scheduled"].includes(text(row.status).toLowerCase())) || null;
    return {
      serviceName: service.service_name,
      billingCategory: service.billing_category,
      workflowStatus: workflowByKey.get(key)?.status || "Not Started",
      contractNet,
      billed,
      paid,
      due,
      unbilled,
      nextBilling: next ? { milestone: next.milestone_name, trigger: next.trigger_status, amount: Math.max(0, num(next.net_amount)), status: next.status } : null,
    };
  });

  const totals = serviceRows.reduce((sum, row) => ({
    contract: sum.contract + row.contractNet,
    billed: sum.billed + row.billed,
    paid: sum.paid + row.paid,
    due: sum.due + row.due,
    unbilled: sum.unbilled + row.unbilled,
  }), { contract: 0, billed: 0, paid: 0, due: 0, unbilled: 0 });

  return { contractStatus: contract.status || "Active", proposalCode: contract.proposal_code || "", totals, services: serviceRows };
}

function billingLifecycle(authority: ReceivableAuthority) {
  const receipts = authority.payments
    .filter((row) => row.effective && text(row.row.receipt_url))
    .sort((a, b) => new Date(text(b.row.payment_date || b.row.created_at)).getTime() - new Date(text(a.row.payment_date || a.row.created_at)).getTime());
  return {
    invoices: authority.invoices.map((row) => ({
      invoiceCode: row.invoiceCode,
      billCode: row.billCode,
      issueDate: row.row.issue_date || "",
      dueDate: row.row.due_date || "",
      category: row.row.category || "",
      amount: row.amount,
      paid: row.allocated,
      due: row.dueBeforeRelief,
      status: row.settledByBill || row.dueBeforeRelief <= 0.009 ? "PAID" : row.allocated > 0.009 ? "PARTIALLY PAID" : "ISSUED",
    })),
    receipts: receipts.map((row) => ({
      receiptCode: `RCPT-${row.paymentCode}`,
      paymentCode: row.paymentCode,
      date: row.row.payment_date || "",
      amount: row.amount,
      allocated: row.allocated,
      unallocated: row.unallocated,
      allocationStatus: row.unallocated > 0.009 ? (row.allocated > 0.009 ? "Partially Allocated" : "Unallocated") : "Allocated",
      method: row.row.payment_method || "",
      reference: row.row.reference_no || "",
      receiptUrl: row.row.receipt_url || "",
    })),
    unallocated: authority.payments.filter((row) => row.effective).reduce((sum, row) => sum + row.unallocated, 0),
  };
}

export async function GET(request: NextRequest) {
  try {
    const projectId = normalizeProjectCode(request.nextUrl.searchParams.get("fileId"));
    if (!projectId) return NextResponse.json({ success: false, error: "Enter a valid File ID such as LV-209." }, { status: 400 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (roleOf(user as Row) === "client") {
      const rawIds = String((user as Row).projectIds || (user as Row).Project_IDs || (user as Row).project_ids || "");
      const allowedIds = new Set(rawIds.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean));
      if (!allowedIds.has(projectId)) return NextResponse.json({ success: false, error: "Access denied for this project." }, { status: 403 });
    }

    const projectRows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    const projectRow = projectRows[0];
    if (!projectRow) return NextResponse.json({ success: false, error: `Project ${projectId} was not found.` }, { status: 404 });

    const [project, billing, commercial, authority] = await Promise.all([
      handleLandviewDataAction("getProject", { projectId }, user) as Promise<Row>,
      handleLandviewDataAction("getProjectBilling", { projectId }, user) as Promise<Row>,
      billingV2CommercialSummary(projectId).catch(() => null),
      loadReceivableAuthority({ projectId: text(projectRow.id) }),
    ]);

    const gatewayBills = ((Array.isArray(billing.bills) ? billing.bills : []) as Row[]).filter(effectiveBill);
    const groups: Record<Category, Group> = {
      "Engineering Bill": { bills: [], payments: [], gross: 0, discount: 0, paid: 0, due: 0, preDue: 0 },
      "Design Books": { bills: [], payments: [], gross: 0, discount: 0, paid: 0, due: 0, preDue: 0 },
      "Supervision Bill": { bills: [], payments: [], gross: 0, discount: 0, paid: 0, due: 0, preDue: 0 },
      "Other Services Bill": { bills: [], payments: [], gross: 0, discount: 0, paid: 0, due: 0, preDue: 0 },
    };

    for (const bill of gatewayBills) groups[category(bill)].bills.push(bill);
    for (const bill of authority.bills) {
      const group = groups[category(bill.row)];
      group.gross += bill.gross + bill.debitAdjustment;
      group.discount += bill.effectiveDiscount;
      group.preDue += bill.dueBeforeRelief;
      group.due += bill.dueBeforeRelief;
    }
    for (const payment of authority.payments.filter((row) => row.effective)) {
      const group = groups[category(payment.row)];
      group.payments.push(payment);
      group.paid += payment.amount;
    }

    const projectReceivable = authority.projects.get(text(projectRow.id));
    if (projectReceivable) {
      reduceGroupDue(groups, ["Engineering Bill", "Design Books"], projectReceivable.engineeringDue);
      reduceGroupDue(groups, ["Supervision Bill"], projectReceivable.supervisionDue);
      reduceGroupDue(groups, ["Other Services Bill"], projectReceivable.otherDue);
    }

    const eng = groups["Engineering Bill"], books = groups["Design Books"], sup = groups["Supervision Bill"], oth = groups["Other Services Bill"];
    const totalDue = eng.due + books.due + sup.due + oth.due;
    const totalBilled = eng.gross - eng.discount + books.gross - books.discount + sup.gross - sup.discount + oth.gross - oth.discount;

    const receivableByRef = new Map<string, (typeof authority.bills)[number]>();
    for (const state of authority.bills) {
      for (const ref of [state.billId, state.billCode]) {
        const key = text(ref).toLowerCase();
        if (key) receivableByRef.set(key, state);
      }
    }

    const billRows = (c: Category) => groups[c].bills
      .filter((b) => adjustmentKind(b) !== "credit")
      .map((b) => {
        const kind = adjustmentKind(b);
        const description = kind === "debit" ? `Debit Note — ${serviceDescription(b, c)}` : (b.Description || b.description || c);
        const refs = [b.Bill_ID, b.Bill_Code, b.bill_id, b.bill_code, b.ID, b.id].map((value) => text(value).toLowerCase()).filter(Boolean);
        const state = refs.map((ref) => receivableByRef.get(ref)).find(Boolean);
        const fallbackDiscount = Math.max(0, num(b.Discount || b.discount));
        const fallbackNet = Math.max(0, num(b.Net_Amount || b.net_amount || b.Amount || b.amount) - (b.Net_Amount || b.net_amount ? 0 : fallbackDiscount));
        const effectiveDiscount = state ? state.effectiveDiscount : fallbackDiscount;
        const effectiveNet = state ? state.effectiveAmount : fallbackNet;
        const paid = state ? state.paidForReceivable : (["paid", "full paid", "fully paid"].includes(text(b.Status || b.status).toLowerCase()) ? effectiveNet : 0);
        const due = state ? state.dueBeforeRelief : Math.max(0, effectiveNet - paid);
        return [
          projectId,
          description,
          b.Unit_Price || b.unit_price || "",
          b.Quantity || b.quantity || "",
          b.Amount || b.amount || 0,
          b.Bill_ID || b.Bill_Code || b.bill_code || b.id || "",
          b.Status || b.status || "",
          effectiveNet,
          effectiveDiscount,
          paid,
          due,
        ];
      });

    const payRows = (c: Category) => groups[c].payments.map((p) => [
      projectId,
      p.row.payment_date || "",
      [p.row.payment_method, p.row.reference_no].filter(Boolean).join(" · ") || "Client Payment",
      p.amount,
      "Verified",
      p.paymentCode,
    ]);

    const billHeaders = ["FILE ID", "Service Name", "Rate (BDT)", "QTY", "Amount (BDT)", "Bill ID", "Status", "Net Amount (BDT)", "Discount (BDT)", "Paid (BDT)", "Due (BDT)"];
    const sheets = [
      sheet("Summary", ["FILE ID", "Client Name", "Project Name", "Engineering Bill", "Engineering Discount", "Engineering Deposit", "Engineering Due", "Supervision Bill", "Supervision Discount", "Supervision Deposit", "Supervision Due", "Other Services Bill", "Other Services Discount", "Other Services Deposit", "Other Services Due", "Design Books Bill", "Design Books Discount", "Design Books Deposit", "Design Books Due", "Total Due", "Status"], [[projectId, project.Client_Name || "", project.Project_Name || "", eng.gross, eng.discount, eng.paid, eng.due, sup.gross, sup.discount, sup.paid, sup.due, oth.gross, oth.discount, oth.paid, oth.due, books.gross, books.discount, books.paid, books.due, totalDue, totalDue > .009 ? "DUE" : totalBilled > 0 ? "FULL PAID" : ""]]),
      sheet("File List", ["FILE ID", "Client Name", "Address", "Phone", "Floor/Story", "Build Type", "Land Area", "Referred By", "Ref. Contact"], [[projectId, project.Client_Name || "", project.Location || "", project.Phone_Number || "", project.Floors || "", project.Project_Type || "", project.Plot_Area || "", project.Referred_By || "", project.Ref_Contact || ""]]),
      sheet("Design Bill", billHeaders, billRows("Engineering Bill")),
      sheet("Design Deposit", ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"], payRows("Engineering Bill")),
      sheet("Design Books Bill", billHeaders, billRows("Design Books")),
      sheet("Design Books Deposit", ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"], payRows("Design Books")),
      sheet("Supervision Bill", billHeaders, billRows("Supervision Bill")),
      sheet("S Deposit", ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"], payRows("Supervision Bill")),
      sheet("Others Bill", billHeaders, billRows("Other Services Bill")),
      sheet("Others Bill Deposit", ["FILE ID", "Date", "Details", "Amount", "Verification", "Income ID"], payRows("Other Services Bill")),
    ];

    const lifecycle = billingLifecycle(authority);
    const payments = authority.payments.filter((row) => row.effective).map((row) => row.row);
    return NextResponse.json({ success: true, data: { projectId, sheets, payments, commercial, lifecycle, updatedAt: new Date().toISOString(), source: "supabase" } }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "canonical-receivable-authority" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project billing request failed.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : /not found/i.test(message) ? 404 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
