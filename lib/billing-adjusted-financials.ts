import { selectRows } from "@/lib/supabase-data";
import { getProjectServiceFinancials, workflowServiceKey } from "@/lib/service-workflow";
import { getBillingV2Snapshot } from "@/lib/billing-v2";

type Row = Record<string, any>;

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money2(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }

async function activeCredits(projectCode: string) {
  const rows = await selectRows("billing_adjustments", { filters: { project_code: projectCode }, order: "posted_at:asc", limit: 5000 });
  const credits = new Map<string, number>();
  for (const row of rows) {
    if (text(row.status).toLowerCase() === "void") continue;
    if (text(row.adjustment_type) !== "Credit Note") continue;
    const key = text(row.service_key) || workflowServiceKey(row.service_name);
    if (!key) continue;
    credits.set(key, money2((credits.get(key) || 0) + Math.max(0, num(row.amount))));
  }
  return credits;
}

export async function getAdjustedProjectServiceFinancials(projectCode: string) {
  const [base, credits] = await Promise.all([
    getProjectServiceFinancials(projectCode),
    activeCredits(projectCode),
  ]);
  const services = base.services.map((service) => {
    const credit = credits.get(service.serviceKey) || 0;
    const net = money2(Math.max(0, service.net - credit));
    const paid = money2(Math.min(net, Math.max(0, service.paid)));
    const due = money2(Math.max(0, net - paid));
    return {
      ...service,
      net,
      paid,
      due,
      fullyPaid: net > 0 && due <= 0.01,
      creditNotes: credit,
    };
  });
  const categoryTotals = services.reduce((acc: Record<string, { gross: number; discount: number; net: number; paid: number; due: number }>, row) => {
    const current = acc[row.billingCategory] || { gross: 0, discount: 0, net: 0, paid: 0, due: 0 };
    current.gross = money2(current.gross + row.gross);
    current.discount = money2(current.discount + row.discount);
    current.net = money2(current.net + row.net);
    current.paid = money2(current.paid + row.paid);
    current.due = money2(current.due + row.due);
    acc[row.billingCategory] = current;
    return acc;
  }, {});
  return { ...base, services, categoryTotals };
}

export async function getAdjustedBillingV2Snapshot(projectCode: string, actor = "LAND VIEW") {
  const [snapshot, credits] = await Promise.all([
    getBillingV2Snapshot(projectCode, actor),
    activeCredits(projectCode),
  ]);
  const services = (snapshot.services || []).map((service: Row) => {
    const credit = credits.get(text(service.serviceKey)) || 0;
    if (!credit) return { ...service, creditNotes: 0 };
    const billedNet = money2(Math.max(0, num(service.billedNet) - credit));
    const paid = money2(Math.min(billedNet, Math.max(0, num(service.paid))));
    const due = money2(Math.max(0, billedNet - paid));
    const unbilled = money2(Math.max(0, num(service.contractNet) - billedNet));
    let financeStatus = text(service.financeStatus);
    if (billedNet <= 0 && num(service.readyToBill) > 0) financeStatus = "Ready to Bill";
    else if (billedNet > 0 && due > 0 && paid > 0) financeStatus = "Partially Paid";
    else if (billedNet > 0 && due > 0) financeStatus = "Invoiced";
    else if (billedNet > 0 && due <= 0 && unbilled > 0) financeStatus = "Partially Billed";
    else if (num(service.contractNet) > 0 && billedNet >= num(service.contractNet) - 0.01 && due <= 0) financeStatus = "Paid";
    return { ...service, billedNet, paid, due, unbilled, financeStatus, creditNotes: credit };
  });
  const totals = services.reduce((sum: Row, service: Row) => ({
    contract: money2(sum.contract + num(service.contractNet)),
    billed: money2(sum.billed + num(service.billedNet)),
    paid: money2(sum.paid + num(service.paid)),
    due: money2(sum.due + num(service.due)),
    unbilled: money2(sum.unbilled + num(service.unbilled)),
    readyToBill: money2(sum.readyToBill + num(service.readyToBill)),
    creditNotes: money2(sum.creditNotes + num(service.creditNotes)),
  }), { contract: 0, billed: 0, paid: 0, due: 0, unbilled: 0, readyToBill: 0, creditNotes: 0 });
  return { ...snapshot, services, totals };
}
