import type {
  ReceivableAuthority, ReceivableCategoryKey, ProjectReceivableState,
} from "@/lib/billing-receivable-authority";

type Row = Record<string, unknown>;
export type AgeBandV44 = "0_30" | "31_60" | "61_90" | "91_plus" | "undated";
export type AgeAmountsV44 = Record<AgeBandV44, number>;
export type ReportMonthV44 = {
  month: string; payments: number; operational: number; legacy: number;
  paymentCount: number; legacyCount: number; fallbackDateCount: number;
};
export type ReportProjectV44 = {
  projectId: string; projectCode: string; projectName: string; client: string;
  netBilled: number; creditedPayments: number; collectibleDue: number;
  openInvoicesBeforeOffsets: number; remainingAdvance: number;
  aging: AgeAmountsV44; agingDateFallbacks: number; undatedInvoiceCount: number;
  activeInvoiceCount: number; lastPaymentDate: string;
};
export type FinancialReportV44 = {
  version: "4.4"; snapshotAt: string; ageReferenceDate: string;
  methodology: { aging: string; collections: string; due: string };
  summary: {
    projectCount: number; projectsWithDue: number; netBilled: number;
    creditedPayments: number; operationalCollections: number; legacyCreditedPayments: number;
    collectibleDue: number; netWrittenOff: number; remainingAdvance: number;
    openInvoicesBeforeOffsets: number; invoiceAgeUnassigned: number;
    undatedPaymentAmount: number; undatedPaymentCount: number;
    invoiceDateFallbackCount: number; invoiceDueDatePresentCount: number;
  };
  aging: AgeAmountsV44;
  months: ReportMonthV44[];
  projects: ReportProjectV44[];
};
const bands: AgeBandV44[] = ["0_30", "31_60", "61_90", "91_plus", "undated"];
const number = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (value: unknown) => String(value ?? "").trim();
const cents = (value: number) => Math.round(value * 100) / 100;
const money = (value: unknown) => cents(Math.max(0, number(value)));
const empty = (): AgeAmountsV44 => ({ "0_30":0, "31_60":0, "61_90":0, "91_plus":0, undated:0 });
const validDate = (value: unknown) => {
  const raw = str(value).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const timestamp = Date.parse(raw + "T00:00:00Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0,10) !== raw) return "";
  return raw;
};
const keyOf = (date: string) => date.slice(0,7);
const day = (date: string) => Date.parse(date + "T00:00:00Z") / 86400000;
export function invoiceAgeBandV44(issued: unknown, today: string): AgeBandV44 {
  const date = validDate(issued);
  if (!date || !validDate(today)) return "undated";
  const age = Math.max(0, day(today) - day(date));
  return age <= 30 ? "0_30" : age <= 60 ? "31_60" : age <= 90 ? "61_90" : "91_plus";
}
export function getDhakaReportDateV44(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone:"Asia/Dhaka", year:"numeric", month:"2-digit", day:"2-digit",
  }).format(now);
}
const keyCategory = (key: ReceivableCategoryKey, state: ProjectReceivableState): number =>
  key === "engineering" ? state.engineeringDue
  : key === "supervision" ? state.supervisionDue : state.otherDue;

export function compileFinancialReportV44(
  authority: ReceivableAuthority, projects: Row[], now = new Date(),
): FinancialReportV44 {
  if (!authority.complete || projects.length >= 5000)
    throw new Error("The financial register is incomplete; reporting is disabled until all source rows can be read.");
  const date = getDhakaReportDateV44(now);
  const aging = empty();
  const projectMap = new Map(projects.map(row => [str(row.id), row]));
  const invoicesByBill = new Map(authority.invoices.map(item => [item.billCode, item]));
  const monthly = new Map<string, ReportMonthV44>();
  const paymentsByProject = new Map<string, number>();
  let operational = 0, legacy = 0, undatedPaymentAmount = 0, undatedPaymentCount = 0;
  let invoiceDateFallbackCount = 0, invoiceDueDatePresentCount = 0;
  for (const payment of authority.payments) {
    if (!payment.effective) continue;
    const amount = money(payment.amount);
    const raw = payment.row as Row;
    const historical = raw.is_legacy_manual === true || raw.affects_business_balance === false;
    if (historical) legacy += amount; else operational += amount;
    paymentsByProject.set(payment.projectId, (paymentsByProject.get(payment.projectId) || 0) + amount);
    const paymentDate = validDate(raw.payment_date);
    const backup = paymentDate ? "" : validDate(raw.created_at);
    const stamped = paymentDate || backup;
    if (!stamped) { undatedPaymentAmount += amount; undatedPaymentCount++; continue; }
    const key = keyOf(stamped);
    const row = monthly.get(key) || {
      month: key, payments: 0, operational: 0, legacy: 0,
      paymentCount: 0, legacyCount: 0, fallbackDateCount: 0,
    };
    row.payments += amount;
    if (historical) { row.legacy += amount; row.legacyCount++; }
    else row.operational += amount;
    row.paymentCount++;
    if (backup) row.fallbackDateCount++;
    monthly.set(key,row);
  }
  const billByProject = new Map<string, typeof authority.bills>();
  for (const bill of authority.bills) {
    const lines = billByProject.get(bill.projectId) || [];
    lines.push(bill);
    billByProject.set(bill.projectId,lines);
  }
  const reportProjects: ReportProjectV44[] = [];
  for (const [id,state] of authority.projects) {
    const project = projectMap.get(id);
    const projectAging = empty();
    let fallback = 0, undatedInvoiceCount = 0, activeInvoiceCount = 0;
    for (const bill of billByProject.get(id) || []) {
      const open = money(bill.dueBeforeRelief);
      if (open <= 0.009) continue;
      activeInvoiceCount++;
      const invoice = invoicesByBill.get(bill.billCode);
      if (validDate(invoice?.row.due_date)) invoiceDueDatePresentCount++;
      const invoiceIssued = validDate(invoice?.row.issue_date);
      const billDate = validDate(bill.row.bill_date);
      const dated = invoiceIssued || billDate;
      if (!invoiceIssued && billDate) { fallback++; invoiceDateFallbackCount++; }
      if (!dated) undatedInvoiceCount++;
      const band = invoiceAgeBandV44(dated, date);
      projectAging[band] += open;
      aging[band] += open;
    }
    const rawSum = cents(bands.reduce((sum, key) => sum + projectAging[key], 0));
    if (Math.abs(rawSum - state.invoiceDueTotal) > 0.02)
      throw new Error("Invoice aging did not reconcile with canonical open invoice totals for project "+id+".");
    const received = money(paymentsByProject.get(id) || 0);
    if (Math.abs(received - state.paid) > 0.02)
      throw new Error("Monthly payment register does not reconcile to the project payment balance for "+id+".");
    const byCategory = (["engineering","supervision","other"] as ReceivableCategoryKey[])
      .reduce((sum,key) => sum + keyCategory(key,state),0);
    if (Math.abs(byCategory-state.totalDue) > 0.02)
      throw new Error("Project category due did not reconcile for "+id+".");
    reportProjects.push({
      projectId:id, projectCode:str(project?.project_code)||"Unknown project",
      projectName:str(project?.project_name),client:str(project?.client_name_snapshot),
      netBilled:money(state.billed),creditedPayments:received,
      collectibleDue:money(state.totalDue),openInvoicesBeforeOffsets:money(state.invoiceDueTotal),
      remainingAdvance:money(state.remainingUnallocated),
      aging:Object.fromEntries(bands.map(key => [key,cents(projectAging[key])])) as AgeAmountsV44,
      agingDateFallbacks:fallback, undatedInvoiceCount, activeInvoiceCount,
      lastPaymentDate:str(state.lastPaymentDate).slice(0,10),
    });
  }
  reportProjects.sort((a,b) => b.collectibleDue-a.collectibleDue ||
    a.projectCode.localeCompare(b.projectCode,undefined,{numeric:true}));
  // Preserve zero-collection calendar months instead of hiding quiet months.
  const firstMonth = [...monthly.keys()].sort()[0] || "";
  if (firstMonth && firstMonth <= date.slice(0,7)) {
    const cursor = new Date(firstMonth + "-01T00:00:00Z");
    const through = new Date(date.slice(0,7) + "-01T00:00:00Z");
    for (let i = 0; i < 240 && cursor <= through; i++) {
      const key = cursor.toISOString().slice(0,7);
      if (!monthly.has(key)) monthly.set(key, {
        month:key,payments:0,operational:0,legacy:0,
        paymentCount:0,legacyCount:0,fallbackDateCount:0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth()+1);
    }
  }
  const months = [...monthly.values()].map(row => ({
    ...row, payments:cents(row.payments),operational:cents(row.operational),legacy:cents(row.legacy),
  })).sort((a,b) => a.month.localeCompare(b.month));
  const sumAging = cents(bands.reduce((sum,key) => sum + aging[key],0));
  const canonicalOpen = cents([...authority.projects.values()].reduce((sum,row) => sum + row.invoiceDueTotal,0));
  if (Math.abs(sumAging-canonicalOpen)>0.02)
    throw new Error("Report aging totals do not reconcile to open invoices.");
  if (Math.abs(cents(operational+legacy)-authority.totals.paid)>0.02)
    throw new Error("Collections totals do not reconcile with canonical effective payments.");
  const assigned = cents(months.reduce((sum,row) => sum + row.payments,0));
  if (Math.abs(cents(assigned+undatedPaymentAmount)-authority.totals.paid)>0.02)
    throw new Error("Monthly and undated payments did not reconcile with the billing ledger.");

  return {
    version:"4.4",snapshotAt:now.toISOString(),ageReferenceDate:date,
    methodology:{
      aging:"Age since invoice issue date (bill date fallback). It is NOT contractual overdue aging; missing dates are classified as undated. Buckets are before project-level advances and write-off relief.",
      collections:"Monthly effective client payment credits. 'Operational' excludes legacy/manual non-ledger credits. Payment date is used when present; recorded creation date is fallback, and undated payments remain separately identified.",
      due:"Collectible receivables, write-offs and remaining advances come exclusively from the existing billing-receivable-authority. Raw invoice aging is not an additional debt figure.",
    },
    summary:{
      projectCount:projectMap.size,projectsWithDue:reportProjects.filter(row => row.collectibleDue > .009).length,
      netBilled:money(authority.totals.billed),creditedPayments:money(authority.totals.paid),
      operationalCollections:cents(operational),legacyCreditedPayments:cents(legacy),
      collectibleDue:money(authority.totals.due),netWrittenOff:money(authority.totals.writeoff),
      remainingAdvance:money(authority.totals.remainingUnallocated),
      openInvoicesBeforeOffsets:canonicalOpen,invoiceAgeUnassigned:cents(aging.undated),
      undatedPaymentAmount:cents(undatedPaymentAmount),undatedPaymentCount,
      invoiceDateFallbackCount,invoiceDueDatePresentCount,
    },
    aging:Object.fromEntries(bands.map(key=>[key,cents(aging[key])])) as AgeAmountsV44,
    months,projects:reportProjects,
  };
}
