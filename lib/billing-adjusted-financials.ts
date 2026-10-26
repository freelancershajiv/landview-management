import { selectRows } from "@/lib/supabase-data";
import { getProjectServiceFinancials, workflowServiceKey } from "@/lib/service-workflow";
import { getBillingV2Snapshot } from "@/lib/billing-v2";

type Row = Record<string, any>;
type CreditBreakdown = { total: number; serviceDiscount: number; otherCredit: number };

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money2(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }
function serviceDiscountAdjustment(row: Row) { return /^service discount\b/i.test(text(row.reason)); }

async function activeCredits(projectCode: string) {
  const rows = await selectRows("billing_adjustments", { filters: { project_code: projectCode }, order: "posted_at:asc", limit: 5000 });
  const credits = new Map<string, CreditBreakdown>();
  for (const row of rows) {
    if (text(row.status).toLowerCase() === "void") continue;
    if (text(row.adjustment_type) !== "Credit Note") continue;
    const key = text(row.service_key) || workflowServiceKey(row.service_name);
    if (!key) continue;
    const amount = Math.max(0, num(row.amount));
    const current = credits.get(key) || { total: 0, serviceDiscount: 0, otherCredit: 0 };
    current.total = money2(current.total + amount);
    if (serviceDiscountAdjustment(row)) current.serviceDiscount = money2(current.serviceDiscount + amount);
    else current.otherCredit = money2(current.otherCredit + amount);
    credits.set(key, current);
  }
  return credits;
}

export async function getAdjustedProjectServiceFinancials(projectCode: string) {
  const [base, credits] = await Promise.all([
    getProjectServiceFinancials(projectCode),
    activeCredits(projectCode),
  ]);
  const services = base.services.map((service) => {
    const credit = credits.get(service.serviceKey) || { total: 0, serviceDiscount: 0, otherCredit: 0 };
    const discount = money2(Math.max(0, service.discount) + credit.serviceDiscount);
    const net = money2(Math.max(0, service.net - credit.total));
    const paid = money2(Math.min(net, Math.max(0, service.paid)));
    const due = money2(Math.max(0, net - paid));
    return {
      ...service,
      discount,
      net,
      paid,
      due,
      fullyPaid: net > 0 && due <= 0.01,
      creditNotes: credit.total,
      serviceDiscounts: credit.serviceDiscount,
      otherCredits: credit.otherCredit,
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
    const credit = credits.get(text(service.serviceKey)) || { total: 0, serviceDiscount: 0, otherCredit: 0 };
    const contractGross = money2(Math.max(0, num(service.contractGross)));
    const contractDiscount = money2(Math.max(0, num(service.contractDiscount)) + credit.serviceDiscount);
    const contractNet = money2(Math.max(0, num(service.contractNet) - credit.serviceDiscount));
    const billedNet = money2(Math.max(0, num(service.billedNet) - credit.total));
    const paid = money2(Math.min(billedNet, Math.max(0, num(service.paid))));
    const due = money2(Math.max(0, billedNet - paid));
    // A true service discount reduces the commercial contract and the billed value together.
    // This keeps the discount from reappearing as future unbilled revenue.
    const unbilled = money2(Math.max(0, contractNet - billedNet));
    let financeStatus = text(service.financeStatus);
    if (billedNet <= 0 && num(service.readyToBill) > 0) financeStatus = "Ready to Bill";
    else if (billedNet > 0 && due > 0 && paid > 0) financeStatus = "Partially Paid";
    else if (billedNet > 0 && due > 0) financeStatus = "Invoiced";
    else if (billedNet > 0 && due <= 0 && unbilled > 0) financeStatus = "Partially Billed";
    else if (contractNet > 0 && billedNet >= contractNet - 0.01 && due <= 0) financeStatus = "Paid";
    return {
      ...service,
      contractGross,
      contractDiscount,
      contractNet,
      billedNet,
      paid,
      due,
      unbilled,
      financeStatus,
      creditNotes: credit.total,
      serviceDiscounts: credit.serviceDiscount,
      otherCredits: credit.otherCredit,
    };
  });
  const totals = services.reduce((sum: Row, service: Row) => ({
    contract: money2(sum.contract + num(service.contractNet)),
    billed: money2(sum.billed + num(service.billedNet)),
    paid: money2(sum.paid + num(service.paid)),
    due: money2(sum.due + num(service.due)),
    unbilled: money2(sum.unbilled + num(service.unbilled)),
    readyToBill: money2(sum.readyToBill + num(service.readyToBill)),
    creditNotes: money2(sum.creditNotes + num(service.creditNotes)),
    serviceDiscounts: money2(sum.serviceDiscounts + num(service.serviceDiscounts)),
  }), { contract: 0, billed: 0, paid: 0, due: 0, unbilled: 0, readyToBill: 0, creditNotes: 0, serviceDiscounts: 0 });
  return { ...snapshot, services, totals };
}