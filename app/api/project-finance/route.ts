// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const num = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const money = (value: unknown) => Math.round(num(value) * 100) / 100;
const roleOf = (user: Row | null) => clean(user?.role || user?.Role, 30).toLowerCase();
const userIdOf = (user: Row | null) => clean(user?.userId || user?.User_ID || user?.username || user?.Username, 120);
const isManagement = (user: Row) => ["admin", "manager"].includes(roleOf(user));

function projectIdsOf(user: Row) {
  const raw = clean(user.projectIds || user.Project_IDs || user.project_ids, 3000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
}
function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Project Finance request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function errorStatus(message: string) {
  if (/session expired/i.test(message)) return 401;
  if (/access denied|restricted|permission required/i.test(message)) return 403;
  if (/required|valid|greater than|not found|does not belong|select/i.test(message)) return 400;
  return 500;
}
async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (!["admin", "manager", "client"].includes(roleOf(user))) throw new Error("Project Finance access is restricted to management and client accounts.");
  return user;
}
async function projectsFor(user: Row) {
  if (isManagement(user)) return await selectRows("projects", { filters: { record_type: "project", project_management_enabled: true }, order: "project_code:asc", limit: 5000 });
  const ids = projectIdsOf(user);
  if (!ids.length) return [];
  const rows = await selectRows("projects", { inFilters: { project_code: ids }, limit: 5000 });
  return rows.filter((row:any) => row.project_management_enabled !== false && row.record_type === "project");
}
async function projectFor(user: Row, projectCode: unknown) {
  const code = normalizeProjectCode(projectCode);
  if (!code) throw new Error("Project is required.");
  const rows = await projectsFor(user);
  const project = rows.find((row:any) => normalizeProjectCode(row.project_code) === code);
  if (!project) throw new Error("Project not found or Project Management is not enabled.");
  return project;
}

function approved(row: Row) {
  const status = clean(row.approval_status, 40).toLowerCase();
  return !status || ["approved", "verified", "posted", "paid", "complete", "completed"].includes(status);
}
function isCheque(row: Row) {
  return clean(row.payment_method, 40).toLowerCase() === "cheque" || clean(row.category, 40).toLowerCase() === "cheque";
}
function isChequeOnHold(row: Row) {
  return isCheque(row) && clean(row.cheque_status, 40).toLowerCase() === "on_hold";
}
function supplierKey(value: unknown) { return clean(value, 200).toLowerCase().replace(/\s+/g, " "); }
function contractorKey(value: unknown) { return supplierKey(value).replace(/\bcontactor\b/g, "contractor").replace(/\bcontractor\b/g, " ").replace(/\s+/g, " ").trim(); }
function rowParty(row: Row) { return clean(row.paid_to || row.supplier || row.received_from, 180); }
function parseOpeningHeld(value: unknown): Array<{id:string;amount:number;details?:string;entry_date?:string}> {
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(raw)) return [];
    return raw.map((item:any) => ({ id:clean(item?.id,100), amount:money(item?.amount), details:clean(item?.details,300), entry_date:clean(item?.entry_date,20) })).filter((item:any)=>item.id&&item.amount>0);
  } catch { return []; }
}

function legacyCashSnapshot(rows: Row[]) {
  const live = rows.filter(approved);
  const debit = live.reduce((sum,row) => sum + num(row.debit), 0);
  let accountingCredit = 0;
  for (const row of live) {
    const party = supplierKey(row.paid_to || row.supplier);
    const sattapur = party.includes("sattapur brick field") || clean(row.details,500).toLowerCase().includes("sattapur brick");
    const historicalDirectPurchase = sattapur && ["2025-11-20","2025-11-23"].includes(String(row.entry_date || "").slice(0,10));
    const sattapurDelivery = sattapur && !historicalDirectPurchase && num(row.credit) > 0 && clean(row.category,120).toLowerCase() === "bricks";
    const sattapurAdvanceFunding = sattapur && num(row.debit) > 0;
    if (sattapurDelivery) continue;
    if (sattapurAdvanceFunding) accountingCredit += num(row.debit);
    else accountingCredit += num(row.credit);
  }
  const heldCheques = live.filter(isChequeOnHold).reduce((sum,row) => sum + num(row.debit), 0);
  return money(debit - accountingCredit - heldCheques);
}

function semanticEffects(row: Row) {
  const debit = num(row.debit), credit = num(row.credit);
  const movement = clean(row.supplier_movement_type, 60).toLowerCase();
  const advanceApplied = Math.min(credit, Math.max(0, num(row.supplier_advance_applied)));
  const hold = isChequeOnHold(row);
  const contractorLinked = Boolean(row.contractor_contract_id);
  const isIncome = clean(row.entry_type,40).toLowerCase() === "income" || (debit > 0 && credit === 0);
  const isExpense = clean(row.entry_type,40).toLowerCase() === "expense" || (credit > 0 && debit === 0);
  let type = "Adjustment";
  if (movement === "advance_fund") type = "Supplier Funding";
  else if (movement === "advance_cash") type = "Supplier Payment";
  else if (movement === "delivery") type = "Material Delivery";
  else if (movement === "direct_purchase") type = "Direct Purchase";
  else if (movement === "refund") type = "Supplier Refund";
  else if (contractorLinked && isExpense) type = "Contractor Payment";
  else if (isIncome) type = "Cash In";
  else if (isExpense) type = "Cash Out";

  let cashIn = 0, cashOut = 0, projectCost = 0, funding = 0;
  if (isIncome && movement !== "refund") funding = debit;
  if (movement === "refund" && debit > 0 && !hold) cashIn = debit;
  else if (isIncome && movement !== "advance_fund" && !hold) cashIn = debit;
  if (isExpense) {
    if (movement === "delivery") cashOut = 0;
    else if (movement === "direct_purchase") cashOut = hold ? 0 : Math.max(0, credit - advanceApplied);
    else cashOut = hold ? 0 : credit;
  }
  if (isExpense) {
    if (movement === "advance_cash") projectCost = 0;
    else if (contractorLinked && !movement) projectCost = 0;
    else projectCost = credit;
  }
  return { type, cashIn:money(cashIn), cashOut:money(cashOut), projectCost:money(projectCost), funding:money(funding), advanceApplied:money(advanceApplied) };
}

function supplierPosition(account: Row, rows: Row[]) {
  const linked = rows.filter((row:any) => String(row.supplier_account_id || "") === String(account.id) && approved(row));
  let funded = 0, delivered = 0, directPurchases = 0, refunded = 0, applied = 0, projectCashPaid = 0, unpaidDirect = 0;
  for (const row of linked) {
    const movement = clean(row.supplier_movement_type,60).toLowerCase();
    const hold = isChequeOnHold(row);
    const credit = num(row.credit), advanceApplied = Math.max(0,num(row.supplier_advance_applied));
    if (movement === "advance_fund" && !hold) funded += num(row.debit);
    if (movement === "advance_cash" && !hold) { funded += credit; projectCashPaid += credit; }
    if (movement === "delivery") delivered += credit;
    if (movement === "direct_purchase") {
      directPurchases += credit;
      if (hold) unpaidDirect += Math.max(0, credit - advanceApplied);
    }
    if (movement === "refund" && !hold) refunded += num(row.debit);
    applied += advanceApplied;
  }
  const net = money(funded - delivered - applied - refunded - unpaidDirect);
  return {
    id:account.id, name:account.supplier_name, category:account.primary_category || "", unit:account.billing_unit || "", active:account.active !== false,
    funded:money(funded), projectCashPaid:money(projectCashPaid), deliveries:money(delivered), directPurchases:money(directPurchases), advanceApplied:money(applied),
    cost:money(delivered + directPurchases), advance:Math.max(0, net), payable:Math.max(0, -net), transactionCount:linked.length,
  };
}
function contractorPosition(contract: Row, bills: Row[], ledger: Row[]) {
  const contractBills = bills.filter((bill:any) => String(bill.contract_id) === String(contract.id));
  const certified = contractBills.filter((bill:any) => clean(bill.status,40).toLowerCase() === "certified").reduce((sum,bill) => sum + num(bill.net_amount ?? bill.gross_amount), 0);
  const nameKey = contractorKey(contract.contractor_name);
  const paymentRows = ledger.filter((row:any) => {
    if (!approved(row) || num(row.credit) <= 0 || isChequeOnHold(row)) return false;
    if (String(row.contractor_contract_id || "") === String(contract.id)) return true;
    return !row.contractor_contract_id && contractorKey(row.paid_to || row.supplier) === nameKey;
  });
  const paid = paymentRows.reduce((sum,row) => sum + num(row.credit), 0);
  const pricingType = clean(contract.pricing_type,30) || "rate";
  const contractValue = pricingType === "lump_sum" ? num(contract.contract_amount) : (num(contract.contract_amount) > 0 ? num(contract.contract_amount) : num(contract.contract_quantity) * num(contract.agreed_rate));
  return {
    id:contract.id, name:contract.contractor_name, category:contract.category || "", pricingType, contractValue:money(contractValue), certified:money(certified), paid:money(paid),
    advance:money(Math.max(0, paid-certified)), payable:money(Math.max(0, certified-paid)), remainingContract:money(Math.max(0, contractValue-certified)), billCount:contractBills.length, paymentCount:paymentRows.length,
  };
}

async function financeWorkspace(user: Row, requested?: string) {
  const projectRows = await projectsFor(user);
  const projects = projectRows.map((row:any) => ({ id:row.id, projectCode:row.project_code, projectName:row.project_name || row.project_code, clientName:row.client_name_snapshot || "", location:row.location || "", lifecyclePhase:row.lifecycle_phase || "" }));
  if (!requested) return { projects, selectedProject:null, totals:null, entries:[], suppliers:[], contractors:[], heldCheques:[], readOnly:!isManagement(user) };
  const project = await projectFor(user, requested);
  const [ledger, summaries, supplierAccounts, contracts, bills] = await Promise.all([
    selectRows("project_management_ledger", { filters:{project_id:project.id}, order:"entry_date:asc,serial_no:asc", limit:5000 }),
    selectRows("project_management_summary", { filters:{project_id:project.id}, limit:1 }),
    selectRows("project_supplier_accounts", { filters:{project_id:project.id,active:true}, order:"supplier_name:asc", limit:1000 }),
    selectRows("project_contractor_contracts", { filters:{project_id:project.id,active:true}, order:"contractor_name:asc", limit:1000 }),
    selectRows("project_contractor_bills", { filters:{project_id:project.id}, order:"bill_date:asc", limit:5000 }),
  ]);
  const live = ledger.filter(approved), summary = summaries[0] || {};
  const hasStoredOpening = summary.finance_v2_opening_cash !== undefined && summary.finance_v2_opening_cash !== null && String(summary.finance_v2_opening_cash) !== "";
  const openingCash = hasStoredOpening ? money(summary.finance_v2_opening_cash) : legacyCashSnapshot(live);
  const cutoverAt = summary.finance_v2_cutover_at ? new Date(summary.finance_v2_cutover_at).getTime() : Number.POSITIVE_INFINITY;
  const openingHeld = parseOpeningHeld(summary.finance_v2_opening_held_cheques);
  const liveById = new Map(live.map((row:any)=>[String(row.id),row]));
  const legacyChequeRealized = money(openingHeld.reduce((sum,item)=>{
    const row=liveById.get(item.id); return sum + (row && clean(row.cheque_status,40).toLowerCase()==="cashed" ? item.amount : 0);
  },0));

  let v2CashDelta=0, projectFunding=0, chequeOnHold=0, directSupplierFunding=0;
  const sorted=live.slice().sort((a:any,b:any)=>String(a.entry_date||"").localeCompare(String(b.entry_date||"")) || num(a.serial_no)-num(b.serial_no) || String(a.created_at||"").localeCompare(String(b.created_at||"")));
  const projected=sorted.map((row:any)=>{
    const effect=semanticEffects(row); projectFunding+=effect.funding;
    if(isChequeOnHold(row) && num(row.debit)>0) chequeOnHold+=num(row.debit);
    if(clean(row.supplier_movement_type,60).toLowerCase()==="advance_fund") directSupplierFunding+=num(row.debit);
    const created=row.created_at?new Date(row.created_at).getTime():0;
    if(created>cutoverAt && clean(row.source,80)==="project_finance_v2") v2CashDelta+=effect.cashIn-effect.cashOut;
    return { id:row.id,serialNo:num(row.serial_no),date:row.entry_date,createdAt:row.created_at,type:effect.type,party:rowParty(row),details:row.details||"",category:row.category||"",paymentMethod:row.payment_method||"",referenceNo:row.reference_no||"",cashIn:effect.cashIn,cashOut:effect.cashOut,projectCost:effect.projectCost,debit:money(row.debit),credit:money(row.credit),source:row.source||"",supplierMovementType:row.supplier_movement_type||"",approvalStatus:row.approval_status||"approved",chequeStatus:row.cheque_status||"" };
  });

  const suppliers=supplierAccounts.map((account:any)=>supplierPosition(account,live));
  const contractorContracts=contracts.filter((row:any)=>clean(row.party_type||"Contractor",30).toLowerCase()!=="supplier");
  const contractors=contractorContracts.map((contract:any)=>contractorPosition(contract,bills,live));
  const contractorCertified=contractors.reduce((sum:number,row:any)=>sum+num(row.certified),0);
  const supplierAdvance=suppliers.reduce((sum:number,row:any)=>sum+num(row.advance),0), supplierPayable=suppliers.reduce((sum:number,row:any)=>sum+num(row.payable),0);
  const contractorAdvance=contractors.reduce((sum:number,row:any)=>sum+num(row.advance),0), contractorPayable=contractors.reduce((sum:number,row:any)=>sum+num(row.payable),0);
  const supplierCost=suppliers.reduce((sum:number,row:any)=>sum+num(row.cost),0);
  const generalCost=projected.reduce((sum:number,row:any)=>{
    if(row.supplierMovementType) return sum;
    const original=liveById.get(String(row.id)); if(original?.contractor_contract_id) return sum;
    return sum+num(row.projectCost);
  },0);
  const recognizedProjectCost=money(supplierCost+contractorCertified+generalCost);
  const postCutover=projected.filter((row:any)=>{const created=row.createdAt?new Date(row.createdAt).getTime():0;return created>cutoverAt&&row.source==="project_finance_v2";});
  const postCutoverCashIn=postCutover.reduce((sum:number,row:any)=>sum+num(row.cashIn),0), postCutoverCashOut=postCutover.reduce((sum:number,row:any)=>sum+num(row.cashOut),0);
  const heldCheques=live.filter(isChequeOnHold).map((row:any)=>({id:row.id,serialNo:num(row.serial_no),date:row.entry_date,details:row.details||"",amount:money(row.debit||row.credit),direction:num(row.debit)>0?"in":"out",party:rowParty(row),referenceNo:row.reference_no||"",source:row.source||""})).reverse();

  return {
    projects,
    selectedProject:{id:project.id,projectCode:project.project_code,projectName:project.project_name||project.project_code,clientName:project.client_name_snapshot||"",location:project.location||"",lifecyclePhase:project.lifecycle_phase||""},
    totals:{projectFunding:money(projectFunding),openingCash,cashInSinceCutover:money(postCutoverCashIn+legacyChequeRealized),cashOutSinceCutover:money(postCutoverCashOut),availableCash:money(openingCash+legacyChequeRealized+v2CashDelta),recognizedProjectCost,supplierAdvance:money(supplierAdvance),supplierPayable:money(supplierPayable),contractorAdvance:money(contractorAdvance),contractorPayable:money(contractorPayable),chequeOnHold:money(chequeOnHold),directSupplierFunding:money(directSupplierFunding),contractorCertified:money(contractorCertified),legacyChequeRealized},
    cutover:{at:summary.finance_v2_cutover_at||null,stored:hasStoredOpening,openingCash,openingHeldTotal:money(openingHeld.reduce((s,x)=>s+x.amount,0))},
    entries:projected.slice().reverse(),suppliers,contractors,heldCheques,readOnly:!isManagement(user),
  };
}

function validDate(value: unknown) { const date=clean(value,20)||new Date().toISOString().slice(0,10); if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a valid date."); return date; }
function positive(value: unknown,label="Amount") { const amount=money(value); if(!(amount>0)) throw new Error(`${label} must be greater than zero.`); return amount; }
function paymentMethod(value: unknown) { const method=clean(value,40).toLowerCase(); return ["cash","bank_transfer","cheque","mobile_banking","other","unspecified"].includes(method)?method:"cash"; }
async function supplierFor(project:Row,id:unknown) { const supplierId=clean(id,100); if(!supplierId) throw new Error("Supplier is required."); const rows=await selectRows("project_supplier_accounts",{filters:{id:supplierId,project_id:project.id,active:true},limit:1}); if(!rows.length) throw new Error("Supplier not found or does not belong to this project."); return rows[0]; }
async function contractorFor(project:Row,id:unknown) { const contractId=clean(id,100); if(!contractId) throw new Error("Contractor is required."); const rows=await selectRows("project_contractor_contracts",{filters:{id:contractId,project_id:project.id,active:true},limit:1}); if(!rows.length||clean(rows[0].party_type||"Contractor",30).toLowerCase()==="supplier") throw new Error("Contractor not found or does not belong to this project."); return rows[0]; }
function baseLedger(project:Row,user:Row,body:Row) {
  const method=paymentMethod(body.paymentMethod);
  return {project_id:project.id,project_code_snapshot:project.project_code,entry_date:validDate(body.date||body.entryDate),details:clean(body.details,1000)||"Project finance transaction",sft:Math.max(0,num(body.quantity||body.sft)),rate:Math.max(0,num(body.rate)),category:clean(body.category,120)||null,memo:clean(body.memo,1000)||null,payment_method:method,cheque_status:method==="cheque"?(clean(body.chequeStatus,30).toLowerCase()==="on_hold"?"on_hold":"cashed"):null,reference_no:clean(body.referenceNo,160)||null,bank_name:clean(body.bankName,160)||null,approval_status:"approved",source:"project_finance_v2",source_type:"project_finance_v2",created_by:employeeCodeOf(user)||userIdOf(user)||"LAND VIEW",updated_by:employeeCodeOf(user)||userIdOf(user)||"LAND VIEW"};
}

export async function GET(request:NextRequest) {
  try { const user=await requireUser(request); return ok(await financeWorkspace(user,request.nextUrl.searchParams.get("projectId")||"")); }
  catch(error){const message=error instanceof Error?error.message:String(error);return fail(message,errorStatus(message));}
}
export async function POST(request:NextRequest) {
  try {
    if(!sameOrigin(request)) return fail("Invalid request origin.",403);
    const user=await requireUser(request); if(!isManagement(user)) return fail("Management permission required.",403);
    const body=await request.json() as Row, project=await projectFor(user,body.projectId), action=clean(body.action,60).toLowerCase();

    if(action==="cash_held_cheque") {
      const id=clean(body.ledgerId,100); if(!id) throw new Error("Held cheque is required.");
      const rows=await selectRows("project_management_ledger",{filters:{id,project_id:project.id},limit:1});
      const row=rows[0]; if(!row||!isChequeOnHold(row)) throw new Error("Held cheque not found or it is already cashed.");
      const oldMemo=clean(row.memo,1000);
      const memo=/^CHEQUE_STATUS:ON_HOLD/i.test(oldMemo)?oldMemo.replace(/^CHEQUE_STATUS:ON_HOLD/i,"CHEQUE_STATUS:CASHED"):(oldMemo||"CHEQUE_STATUS:CASHED");
      const saved=await updateRows("project_management_ledger",{id},{cheque_status:"cashed",memo,updated_by:employeeCodeOf(user)||userIdOf(user)||"LAND VIEW",updated_at:new Date().toISOString()});
      return ok(saved[0]||{id,cheque_status:"cashed"});
    }

    const base=baseLedger(project,user,body);
    if(action==="cash_in") {
      const amount=positive(body.amount),receivedFrom=clean(body.receivedFrom,160); if(!receivedFrom) throw new Error("Received From is required.");
      const row={...base,debit:amount,credit:0,received_from:receivedFrom,paid_to:clean(body.heldBy,160)||"Eng Shajiv",supplier:null,supplier_account_id:null,supplier_movement_type:null,supplier_advance_applied:0};
      const saved=await insertRows("project_management_ledger",row); return ok(saved[0]||row,201);
    }
    if(action==="cash_out") {
      const amount=positive(body.amount),paidTo=clean(body.paidTo,160); if(!paidTo) throw new Error("Paid To is required.");
      const row={...base,debit:0,credit:amount,received_from:null,paid_to:paidTo,supplier:paidTo,supplier_account_id:null,supplier_movement_type:null,supplier_advance_applied:0};
      const saved=await insertRows("project_management_ledger",row); return ok(saved[0]||row,201);
    }
    if(action==="supplier_funding") {
      const supplier=await supplierFor(project,body.supplierId),amount=positive(body.amount),mode=clean(body.fundingMode,40).toLowerCase(); if(!["owner_direct","project_cash"].includes(mode)) throw new Error("Select how the supplier was funded.");
      const direct=mode==="owner_direct";
      const row={...base,details:clean(body.details,1000)||`${direct?"Direct funding to":"Payment to"} ${supplier.supplier_name}`,debit:direct?amount:0,credit:direct?0:amount,received_from:direct?(clean(body.receivedFrom,160)||"Mr. Mahi Bhai"):null,paid_to:supplier.supplier_name,supplier:supplier.supplier_name,supplier_account_id:supplier.id,supplier_movement_type:direct?"advance_fund":"advance_cash",supplier_advance_applied:0,category:clean(body.category,120)||supplier.primary_category||"Supplier Advance"};
      const saved=await insertRows("project_management_ledger",row); return ok(saved[0]||row,201);
    }
    if(action==="supplier_delivery") {
      const supplier=await supplierFor(project,body.supplierId),quantity=Math.max(0,num(body.quantity)),rate=Math.max(0,num(body.rate)),calculated=quantity>0&&rate>0?quantity*rate:0,amount=positive(body.amount||calculated,"Delivery value");
      const row={...base,details:clean(body.details,1000)||`${supplier.supplier_name} material delivery`,debit:0,credit:amount,received_from:null,paid_to:supplier.supplier_name,supplier:supplier.supplier_name,supplier_account_id:supplier.id,supplier_movement_type:"delivery",supplier_advance_applied:0,sft:quantity,rate,category:clean(body.category,120)||supplier.primary_category||"Materials",payment_method:"unspecified",cheque_status:null};
      const saved=await insertRows("project_management_ledger",row); return ok(saved[0]||row,201);
    }
    if(action==="supplier_direct_purchase") {
      const supplier=await supplierFor(project,body.supplierId),amount=positive(body.amount);
      const existing=await selectRows("project_management_ledger",{filters:{project_id:project.id,supplier_account_id:supplier.id},order:"entry_date:asc",limit:5000});
      const position=supplierPosition(supplier,existing),advanceApplied=body.applyAdvance===false?0:money(Math.min(position.advance,amount));
      const row={...base,details:clean(body.details,1000)||`${supplier.supplier_name} direct purchase`,debit:0,credit:amount,received_from:null,paid_to:supplier.supplier_name,supplier:supplier.supplier_name,supplier_account_id:supplier.id,supplier_movement_type:"direct_purchase",supplier_advance_applied:advanceApplied,category:clean(body.category,120)||supplier.primary_category||"Materials"};
      const saved=await insertRows("project_management_ledger",row); return ok({...saved[0],cash_due_now:money(amount-advanceApplied),advance_applied:advanceApplied},201);
    }
    if(action==="supplier_refund") {
      const supplier=await supplierFor(project,body.supplierId),amount=positive(body.amount);
      const row={...base,details:clean(body.details,1000)||`${supplier.supplier_name} advance refund`,debit:amount,credit:0,received_from:supplier.supplier_name,paid_to:null,supplier:supplier.supplier_name,supplier_account_id:supplier.id,supplier_movement_type:"refund",supplier_advance_applied:0,category:clean(body.category,120)||"Supplier Refund"};
      const saved=await insertRows("project_management_ledger",row); return ok(saved[0]||row,201);
    }
    if(action==="contractor_payment") {
      const contractor=await contractorFor(project,body.contractorId),amount=positive(body.amount);
      const row={...base,details:clean(body.details,1000)||`Payment to ${contractor.contractor_name}`,debit:0,credit:amount,received_from:null,paid_to:contractor.contractor_name,supplier:contractor.contractor_name,supplier_account_id:null,supplier_movement_type:null,supplier_advance_applied:0,contractor_contract_id:contractor.id,category:clean(body.category,120)||contractor.category||"Contractor Payment"};
      const saved=await insertRows("project_management_ledger",row); return ok(saved[0]||row,201);
    }
    if(action==="contractor_bill") {
      const contractor=await contractorFor(project,body.contractorId),quantity=Math.max(0,num(body.quantity))||1,gross=positive(body.amount||quantity*num(body.rate),"Certified amount"),deduction=Math.max(0,money(body.deduction)); if(deduction>gross) throw new Error("Deduction cannot exceed the certified amount.");
      const rate=num(body.rate)>0?money(body.rate):money(gross/quantity);
      const row={project_id:project.id,contract_id:contractor.id,bill_code:`CB-${crypto.randomUUID().replace(/-/g,"").slice(0,10).toUpperCase()}`,bill_date:validDate(body.date),description:clean(body.details,1000)||`${contractor.contractor_name} certified work`,quantity,rate,gross_amount:gross,deduction,net_amount:money(gross-deduction),status:"Certified",notes:clean(body.memo,2000)||null,created_by:employeeCodeOf(user)||userIdOf(user)||"LAND VIEW",updated_at:new Date().toISOString()};
      const saved=await insertRows("project_contractor_bills",row); return ok(saved[0]||row,201);
    }
    if(action==="create_supplier") {
      const name=clean(body.name,160); if(!name) throw new Error("Supplier name is required.");
      const row={project_id:project.id,supplier_name:name,supplier_key:supplierKey(name),primary_category:clean(body.category,120)||null,billing_unit:clean(body.unit,40)||null,notes:clean(body.memo,1000)||null,active:true};
      const saved=await insertRows("project_supplier_accounts",row); return ok(saved[0]||row,201);
    }
    if(action==="create_contractor") {
      const name=clean(body.name,160),category=clean(body.category,120); if(!name||!category) throw new Error("Contractor name and category are required."); const pricing=clean(body.pricingType,30)==="lump_sum"?"lump_sum":"rate";
      const row={project_id:project.id,contractor_name:name,category,billing_unit:clean(body.unit,40)||"SFT",contract_quantity:Math.max(0,num(body.quantity)),agreed_rate:Math.max(0,num(body.rate)),notes:clean(body.memo,2000)||null,party_type:"Contractor",active:true,pricing_type:pricing,contract_amount:Math.max(0,num(body.contractAmount)),scope_description:clean(body.scope,2000)||null,updated_at:new Date().toISOString()};
      const saved=await insertRows("project_contractor_contracts",row); return ok(saved[0]||row,201);
    }
    return fail("Unknown Project Finance action.",400);
  } catch(error) { const message=error instanceof Error?error.message:String(error); return fail(message,errorStatus(message)); }
}
