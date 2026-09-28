// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows, deleteRows, upsertRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const EXPENSE_CATEGORIES = ["Cash","Bricks","Brick Chips","Masonry","R.C.C Masonry","Finishing Masonry","Stone & Sand","Cement & Steel","Security","Other Expenses","Electric Contractor","Electrical Material","Plumbing Contractor","Plumbing Material","Tiles","Door","Grills"] as const;

function normalizeExpenseCategory(value: unknown) {
  const raw = clean(value, 120).toLowerCase().replace(/&/g, "and").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string,string> = {
    cash:"Cash",bricks:"Bricks",masonry:"Masonry","stone and sand":"Stone & Sand",stone:"Stone & Sand",sand:"Stone & Sand",
    "cement and steel":"Cement & Steel",cement:"Cement & Steel",steel:"Cement & Steel",security:"Security","r.c.c masonry":"R.C.C Masonry","finishing masonry":"Finishing Masonry",
    "other expenses":"Other Expenses",other:"Other Expenses","brick chips":"Brick Chips","electric contractor":"Electric Contractor",
    "electrical material":"Electrical Material",electrical:"Electrical Material","plumbing contractor":"Plumbing Contractor",
    "plumbing material":"Plumbing Material",plumbing:"Plumbing Material",tiles:"Tiles",door:"Door",doors:"Door",
    "door and woods":"Door",grill:"Grills",grills:"Grills","ss grill":"Grills"
  };
  return aliases[raw] || "Other Expenses";
}
function guessExpenseCategory(category: unknown, description: unknown) {
  const raw = `${clean(category,180)} ${clean(description,500)}`.toLowerCase();
  if (/security|guard/.test(raw)) return "Security";
  if (/brick\s*chips?/.test(raw)) return "Brick Chips";
  if (/brick/.test(raw)) return "Bricks";
  if (/r\.c\.c|rcc|reinforced concrete/.test(raw)) return "R.C.C Masonry";
  if (/finishing masonry|plaster|tiles|putty|paint|painting/.test(raw)) return "Finishing Masonry";
  if (/masonry|mason|worker|labour|labor|casting/.test(raw)) return "Masonry";
  if (/stone|sand|soil|syleth/.test(raw)) return "Stone & Sand";
  if (/cement|steel|rod|rebar|binding cable/.test(raw)) return "Cement & Steel";
  if (/electrical contractor|electric contractor|electrician|electrical work/.test(raw)) return "Electric Contractor";
  if (/electrical material|socket|cable|light|fan|switch|wire|electrical/.test(raw)) return "Electrical Material";
  if (/plumbing contractor|plumber/.test(raw)) return "Plumbing Contractor";
  if (/plumbing material|pipe|fitting|sanitary|sewerage/.test(raw)) return "Plumbing Material";
  if (/tile/.test(raw)) return "Tiles";
  if (/door|wood/.test(raw)) return "Door";
  if (/grill/.test(raw)) return "Grills";
  if (/cash|cash advance/.test(raw)) return "Cash";
  return "Other Expenses";
}
const clean = (v: unknown, max = 1000) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const roleOf = (u: Row | null) => clean(u?.role || u?.Role, 30).toLowerCase();
const userIdOf = (u: Row | null) => clean(u?.userId || u?.User_ID || u?.username || u?.Username, 120);
const isAdmin = (u: Row) => roleOf(u) === "admin";
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
  const message = error instanceof Error ? error.message : String(error || "Project Management request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "client") throw new Error("Project Management access is restricted to admin and client accounts.");
  return user;
}
async function projectsFor(user: Row) {
  if (isAdmin(user)) return selectRows("projects", { filters: { record_type: "project" }, order: "project_code:asc", limit: 5000 });
  const ids = projectIdsOf(user);
  return ids.length ? selectRows("projects", { inFilters: { project_code: ids }, limit: 5000 }) : [];
}
async function projectFor(user: Row, value: unknown) {
  const code = normalizeProjectCode(value);
  if (!code) throw new Error("Project is required.");
  if (!isAdmin(user) && !projectIdsOf(user).includes(code)) throw new Error("Access denied for this project.");
  const rows = await selectRows("projects", { filters: { project_code: code, record_type: "project" }, limit: 1 });
  if (!rows.length) throw new Error("Project not found.");
  return rows[0];
}
function calculate(rows: Row[]) {
  let balance = 0;
  return rows.slice().sort((a,b) => {
    const d = String(a.entry_date || "").localeCompare(String(b.entry_date || ""));
    if (d) return d;
    const c = String(a.created_at || "").localeCompare(String(b.created_at || ""));
    if (c) return c;
    return String(a.id || "").localeCompare(String(b.id || ""));
  }).map(row => {
    const debit = num(row.debit), credit = num(row.credit);
    balance += debit - credit;
    return { ...row, debit, credit, sft: num(row.sft), rate: num(row.rate), balance };
  });
}
async function projectSummaryFor(project: Row) {
  const rows = await selectRows("project_management_summary", { filters: { project_id: project.id }, limit: 1 });
  const row = rows[0] || {};
  return {
    supplierAdvance: num(row.supplier_advance),
    chequeOnHold: num(row.cheque_on_hold),
    notes: clean(row.notes, 2000)
  };
}


function contractorCategoryKey(value: unknown) {
  return clean(value,120).toLowerCase().replace(/&/g,"and").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
}
function ledgerCategoriesForContract(contract:any) {
  const key=contractorCategoryKey(contract?.category);
  if (key==="masonry") return ["masonry","r.c.c masonry","finishing masonry"];
  return [key];
}
function contractorPaymentNameKey(value: unknown) {
  // Normalize contractor/supplier naming variants so the ledger and billing
  // stay connected even when one side uses a business suffix.
  return contractorCategoryKey(value)
    .replace(/\bcontactor\b/g,"contractor")
    .replace(/\b(contractor|supplier|brick\s*field|brickfield|bf)\b/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function contractorBillCode() {
  return "CB-" + crypto.randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();
}
function validContractorBill(row: Row) {
  return clean(row.status,30).toLowerCase() === "certified";
}
async function contractorWorkspaceFor(project: Row, entries: Row[]) {
  const contracts = await selectRows("project_contractor_contracts", { filters:{ project_id:project.id, active:true }, order:"category:asc", limit:500 });
  const bills = await selectRows("project_contractor_bills", { filters:{ project_id:project.id }, order:"bill_date:asc", limit:5000 });
  const validBills = bills.filter(validContractorBill);
  const contractorRows = contracts.map((contract:any) => {
    const contractBills = validBills.filter((b:any)=>String(b.contract_id)===String(contract.id));
    const ledgerCategories=ledgerCategoriesForContract(contract);
    const contractorNameKey=contractorPaymentNameKey(contract.contractor_name);
    const paidEntries = entries.filter((e:any) => {
      if (num(e.credit) <= 0) return false;
      if (!ledgerCategories.includes(contractorCategoryKey(e.category))) return false;
      const supplierKey=contractorPaymentNameKey(e.paid_to || e.supplier);
      if (supplierKey) return supplierKey===contractorNameKey;
      const candidates=contracts.filter((candidate:any)=>
        ledgerCategoriesForContract(candidate).includes(contractorCategoryKey(e.category))
      );
      return candidates.length===1 && String(candidates[0].id)===String(contract.id);
    });
    const contractValue = num(contract.contract_quantity) * num(contract.agreed_rate);
    const contractConfigured = num(contract.contract_quantity)>0 && num(contract.agreed_rate)>0;
    const certified = contractBills.reduce((sum:number,b:any)=>sum+num(b.net_amount ?? b.gross_amount),0);
    const billedQuantity = contractBills.reduce((sum:number,b:any)=>sum+num(b.quantity),0);
    const paid = paidEntries.reduce((sum:number,e:any)=>sum+num(e.credit),0);
    const partyLedger = entries
      .filter((e:any)=>{
        const entryParty=contractorPaymentNameKey(e.paid_to || e.supplier || e.received_from);
        return entryParty && entryParty===contractorNameKey;
      })
      .sort((a:any,b:any)=>{
        const d=String(a.entry_date||"").localeCompare(String(b.entry_date||""));
        if(d) return d;
        return String(a.created_at||"").localeCompare(String(b.created_at||""));
      })
      .reduce((acc:any[],e:any)=>{
        const prev=acc.length ? num(acc[acc.length-1].balance) : 0;
        const debit=num(e.debit), credit=num(e.credit);
        acc.push({
          id:e.id,
          date:e.entry_date,
          details:e.details,
          category:e.category,
          debit,
          credit,
          balance:prev+debit-credit,
          memo:e.memo||""
        });
        return acc;
      },[]);
    const advance = Math.max(0, paid-certified);
    const balancePayable = Math.max(0, certified-paid);
    const remainingContract = contractConfigured ? Math.max(0, contractValue-certified) : 0;
    const overCertified = contractConfigured ? Math.max(0, certified-contractValue) : 0;
    return {
      ...contract,
      contract_quantity:num(contract.contract_quantity),
      agreed_rate:num(contract.agreed_rate),
      contractValue,
      contractConfigured,
      certifiedAmount:certified,
      billedQuantity,
      paidAmount:paid,
      advance,
      balancePayable,
      remainingContract,
      overCertified,
      paymentCount:paidEntries.length,
      payments:paidEntries.map((e:any)=>({id:e.id,date:e.entry_date,details:e.details,amount:num(e.credit),category:e.category,supplier:e.supplier,memo:e.memo||""})),
      partyLedger
    };
  });
  const configuredContracts=contractorRows.filter((c:any)=>c.contractConfigured);

  return {
    contracts:contractorRows,
    bills:bills.map((b:any)=>({...b,quantity:num(b.quantity),rate:num(b.rate),gross_amount:num(b.gross_amount),deduction:num(b.deduction),net_amount:num(b.net_amount),status:b.status||"Certified"})),
    totals:{
      contractValue:contractorRows.reduce((s:number,c:any)=>s+c.contractValue,0),
      certifiedAmount:contractorRows.reduce((s:number,c:any)=>s+c.certifiedAmount,0),
      paidAmount:contractorRows.reduce((s:number,c:any)=>s+c.paidAmount,0),
      advance:contractorRows.reduce((s:number,c:any)=>s+c.advance,0),
      balancePayable:contractorRows.reduce((s:number,c:any)=>s+c.balancePayable,0),
      remainingContract:configuredContracts.reduce((s:number,c:any)=>s+c.remainingContract,0),
      overCertified:configuredContracts.reduce((s:number,c:any)=>s+c.overCertified,0),
      configuredContractCount:configuredContracts.length,
      unconfiguredContractCount:contractorRows.length-configuredContracts.length
    }
  };
}

async function masterLedgerFor(user: Row, project: Row) {
  if (!isAdmin(user)) return [];
  const [transactions, expenses] = await Promise.all([
    selectRows("transactions", { filters: { project_id: project.id }, order: "transaction_date:asc", limit: 5000 }),
    selectRows("expenses", { filters: { project_id: project.id }, order: "expense_date:asc", limit: 5000 })
  ]);
  const txRows = transactions.filter((r:any) => num(r.debit) > 0 || String(r.transaction_type || "").toLowerCase() === "expense").map((r:any) => ({
    sourceType:"transaction", sourceId:r.id, sourceCode:r.transaction_code || r.id,
    entryDate:r.transaction_date || "", details:r.description || r.category || "Master ledger expense",
    amount:num(r.debit || r.amount), masterCategory:r.category || "", suggestedCategory:guessExpenseCategory(r.category,r.description)
  })).filter((r:any)=>r.amount>0 && (num(r.amount)>0));
  const expenseRows = expenses.map((r:any) => ({
    sourceType:"expense", sourceId:r.id, sourceCode:r.expense_code || r.id,
    entryDate:r.expense_date || "", details:r.description || r.category || "Master expense",
    amount:num(r.amount), masterCategory:r.category || "", suggestedCategory:guessExpenseCategory(r.category,r.description)
  })).filter((r:any)=>r.amount>0);
  const existing = await selectRows("project_management_ledger", { filters: { project_id: project.id }, limit: 10000 });
  const used = new Set(existing.map((r:any)=>String(r.memo||"").match(/^MASTER_LEDGER:(transaction|expense):(.+)$/)?.[0]).filter(Boolean));
  return [...txRows,...expenseRows].map((r:any)=>({...r,pulled:used.has(`MASTER_LEDGER:${r.sourceType}:${r.sourceId}`)}));
}

async function workspace(user: Row, requested?: string) {
  const allProjects = await projectsFor(user);
  if (!allProjects.length) return { projects: [], selectedProject: null, entries: [], totals: { debit: 0, credit: 0, balance: 0 }, readOnly: !isAdmin(user) };

  let projects = allProjects;
  if (isAdmin(user)) {
    const pmRows = await selectRows("project_management_ledger", { limit: 20000 });
    const configuredIds = new Set(pmRows.map((r:any) => String(r.project_id || "")).filter(Boolean));
    // Project Management is intentionally limited to projects that have
    // actually been initialized with at least one Project Management ledger row.
    // Project status alone must not make a project appear in this workspace.
    projects = allProjects.filter((p:any) => configuredIds.has(String(p.id)));
  }

  const selected = requested
    ? projects.find(p => normalizeProjectCode(p.project_code) === normalizeProjectCode(requested))
    : (isAdmin(user) ? null : projects[0]);

  if (requested && !selected) throw new Error("The selected project is not available for Project Management.");
  const projectList = projects.map(p => ({ id:p.id, projectCode:p.project_code, projectName:p.project_name || p.project_code, clientName:p.client_name_snapshot || "", location:p.location || "", status:p.status || "" }));

  if (!selected) {
    return {
      projects: projectList,
      selectedProject: null,
      entries: [],
      totals: { debit: 0, credit: 0, balance: 0 },
      summary: { supplierAdvance: 0, chequeOnHold: 0, engShajivBalance: 0, notes: "" },
      categories: [],
      masterLedger: [],
      readOnly: !isAdmin(user),
    };
  }

  const rows = await selectRows("project_management_ledger", { filters: { project_id: selected.id }, order: "entry_date:asc", limit: 10000 });
  const entries = calculate(rows).map((row:any) => ({
    ...row,
    paid_to: clean(row.paid_to || (num(row.credit)>0 ? row.supplier : ""),160),
    received_from: clean(row.received_from,160),
  }));
  const debit = entries.reduce((s,r) => s + num(r.debit), 0);
  const credit = entries.reduce((s,r) => s + num(r.credit), 0);
  const categoryNames = Array.from(new Set(entries.map(r => clean(r.category || "Other Expenses", 120)).filter(Boolean))).sort((a,b) => String(a).localeCompare(String(b)));
  const categories = categoryNames.map(category => ({ category, total: entries.filter(r => String(r.category || "") === category).reduce((s,r) => s + num(r.credit) + num(r.debit), 0), count: entries.filter(r => String(r.category || "") === category).length }));
  const masterLedger = await masterLedgerFor(user, selected);
  const summary = await projectSummaryFor(selected);
  const contractorBills = await contractorWorkspaceFor(selected, entries);
  const linkedSupplierAdvance = contractorBills.contracts
    .filter((c:any) =>
      String(c.party_type || "").trim().toLowerCase() === "supplier" &&
      contractorCategoryKey(c.category) === "bricks" &&
      contractorPaymentNameKey(c.contractor_name) === "sattapur"
    )
    .reduce((sum:number,c:any) => sum + num(c.balancePayable), 0);
  const engShajivBalance = debit - credit - linkedSupplierAdvance - summary.chequeOnHold;
  return {
    projects: projectList,
    selectedProject: { id:selected.id, projectCode:selected.project_code, projectName:selected.project_name || selected.project_code, clientName:selected.client_name_snapshot || "", location:selected.location || "", status:selected.status || "" },
    entries,
    totals: { debit, credit, balance: debit - credit },
    summary: { ...summary, supplierAdvance: linkedSupplierAdvance, supplierAdvanceSource:"sattapur_bricks_balance_payable", engShajivBalance },
    categories,
    masterLedger,
    contractorBills,
    readOnly: !isAdmin(user),
  };
}
function errorStatus(message: string) {
  if (/session expired/i.test(message)) return 401;
  if (/access denied|restricted|not available|permission required/i.test(message)) return 403;
  if (/required|valid|either/i.test(message)) return 400;
  return 500;
}

export async function GET(request: NextRequest) {
  try { const user = await requireUser(request); return ok(await workspace(user, request.nextUrl.searchParams.get("projectId") || "")); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return fail(m, errorStatus(m)); }
}

async function validateEntry(body: Row) {
  const debit = Math.max(0, num(body.debit ?? body.Debit));
  const credit = Math.max(0, num(body.credit ?? body.Credit));
  if ((debit > 0) === (credit > 0)) throw new Error("Enter either a Debit or a Credit amount, not both.");
  const details = clean(body.details ?? body.Details, 1000);
  if (!details) throw new Error("Details are required.");
  const entryDate = clean(body.entryDate ?? body.Date, 20) || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error("Enter a valid entry date.");
  const receivedFromRaw = clean(body.receivedFrom ?? body.received_from ?? body.Received_From,160);
  const allowedReceivedFrom = ["Mr. Mahi Bhai","Scrap Selling","Mr. Jamaluddin"];
  const receivedFrom = debit > 0 && !allowedReceivedFrom.includes(receivedFromRaw)
    ? (()=>{ throw new Error("Select a valid Received From option."); })()
    : (receivedFromRaw || null);
  const paidTo = clean(body.paidTo ?? body.paid_to ?? body.Paid_To ?? body.supplier ?? body.Supplier,160) || null;
  return {
    debit, credit, details, entryDate,
    sft:Math.max(0,num(body.sft ?? body.SFT)),
    rate:Math.max(0,num(body.rate ?? body.Rate)),
    supplier:paidTo,
    receivedFrom,
    paidTo,
    category:clean(body.category ?? body.Category,120) || null,
    memo:clean(body.memo ?? body.Memo,1000) || null
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.",403);
    const user = await requireUser(request);
    if (!isAdmin(user)) return fail("Admin permission required.",403);
    const body = await request.json() as Row;
    const project = await projectFor(user, body.projectId || body.Project_ID);
    if (body.action === "updateSummary") {
      const existingSummary = await projectSummaryFor(project);
      const chequeOnHold = Math.max(0, num(body.chequeOnHold));
      const notes = clean(body.notes, 2000) || null;
      const saved = await upsertRows("project_management_summary", {
        project_id: project.id,
        supplier_advance: existingSummary.supplierAdvance,
        cheque_on_hold: chequeOnHold,
        notes,
        updated_at: new Date().toISOString(),
      }, "project_id");
      const row = saved[0] || {
        project_id: project.id,
        supplier_advance: existingSummary.supplierAdvance,
        cheque_on_hold: chequeOnHold,
        notes
      };
      return ok({
        supplierAdvance: num(row.supplier_advance),
        chequeOnHold: num(row.cheque_on_hold),
        notes: clean(row.notes, 2000),
      });
    }
    if (body.action === "saveContractorContract") {
      const id = clean(body.id,100);
      const contractorName = clean(body.contractorName,160);
      const category = clean(body.category,120);
      const billingUnit = clean(body.billingUnit,40) || "SFT";
      const contractQuantity = Math.max(0,num(body.contractQuantity));
      const agreedRate = Math.max(0,num(body.agreedRate));
      const notes = clean(body.notes,2000) || null;
      const partyType = ["Supplier","Contractor"].includes(clean(body.partyType,30)) ? clean(body.partyType,30) : "Contractor";
      if (!contractorName || !category) return fail("Supplier / contractor name and category are required.",400);
      const sameCategoryParties = await selectRows("project_contractor_contracts",{
        filters:{project_id:project.id,category},
        limit:500
      });
      const partyKey = contractorName.trim().toLowerCase();
      const duplicate = sameCategoryParties.find((row:any)=>String(row.id)!==id && String(row.contractor_name||"").trim().toLowerCase()===partyKey);
      if (duplicate) {
        if (!duplicate.active && !id) {
          const reactivated = await updateRows("project_contractor_contracts",{id:duplicate.id},{
            contractor_name:contractorName,category,billing_unit:billingUnit,
            contract_quantity:contractQuantity,agreed_rate:agreedRate,notes,party_type:partyType,active:true,
            updated_at:new Date().toISOString()
          });
          if (!reactivated.length) return fail("Supplier / contractor could not be reactivated.",404);
          return ok(reactivated[0]);
        }
        if (!duplicate.active && id && String(duplicate.id)!==String(id)) {
          return fail("Another inactive party with the same name already exists in this category.",409);
        }
        return fail("A supplier / contractor with this name already exists in this category and project.",409);
      }
      const row = {project_id:project.id,contractor_name:contractorName,category,billing_unit:billingUnit,contract_quantity:contractQuantity,agreed_rate:agreedRate,notes,party_type:partyType,active:true,updated_at:new Date().toISOString()};
      const saved = id ? await updateRows("project_contractor_contracts",{id},row) : await insertRows("project_contractor_contracts",row);
      if (!saved.length) return fail("Supplier / contractor could not be saved.",404);
      return ok(saved[0]);
    }
    if (body.action === "removeContractorContract") {
      const id = clean(body.id,100);
      if (!id) return fail("Supplier / contractor ID is required.",400);
      const rows = await selectRows("project_contractor_contracts",{filters:{id,project_id:project.id},limit:1});
      if (!rows.length) return fail("Supplier / contractor not found.",404);
      const saved = await updateRows("project_contractor_contracts",{id},{
        active:false,
        updated_at:new Date().toISOString()
      });
      if (!saved.length) return fail("Supplier / contractor could not be removed.",404);
      return ok({removed:true,id});
    }
    if (body.action === "saveContractorBill") {
      const id = clean(body.id,100);
      const contractId = clean(body.contractId,100);
      const description = clean(body.description,1000);
      const billDate = clean(body.billDate,20) || new Date().toISOString().slice(0,10);
      const quantity = Math.max(0,num(body.quantity));
      const rate = Math.max(0,num(body.rate));
      const deduction = Math.max(0,num(body.deduction));
      const grossAmount = quantity * rate;
      const netAmount = grossAmount - deduction;
      const status = ["Draft","Certified","Void"].includes(clean(body.status,20)) ? clean(body.status,20) : "Certified";
      if(!contractId || !description) return fail("Contractor contract and bill description are required.",400);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) return fail("Enter a valid bill date.",400);
      if(netAmount < 0) return fail("Deduction cannot exceed the gross bill amount.",400);
      const contracts = await selectRows("project_contractor_contracts",{filters:{id:contractId,project_id:project.id},limit:1});
      if(!contracts.length) return fail("Contractor contract not found.",404);
      const row = {project_id:project.id,contract_id:contractId,bill_code:id ? clean(body.billCode,80) : contractorBillCode(),bill_date:billDate,description,quantity,rate,gross_amount:grossAmount,deduction,net_amount:netAmount,status,notes:clean(body.notes,2000)||null,created_by:employeeCodeOf(user)||userIdOf(user)||"LAND VIEW",updated_at:new Date().toISOString()};
      const saved = id ? await updateRows("project_contractor_bills",{id},row) : await insertRows("project_contractor_bills",row);
      if(!saved.length) return fail("Contractor bill could not be saved.",404);
      return ok(saved[0]);
    }
    if (body.action === "pullMaster") {
      const sourceType = clean(body.sourceType, 30).toLowerCase();
      const sourceId = clean(body.sourceId, 100);
      if (sourceType !== "transaction" && sourceType !== "expense" || !sourceId) return fail("Master ledger source is required.",400);
      const category = normalizeExpenseCategory(body.category);
      const duplicate = await selectRows("project_management_ledger", { filters: { project_id: project.id, memo: `MASTER_LEDGER:${sourceType}:${sourceId}` }, limit: 1 });
      if (duplicate.length) return fail("This master ledger entry has already been pulled into Project Management.",409);
      let source:any = null;
      if (sourceType === "transaction") {
        const rows = await selectRows("transactions", { filters: { id: sourceId, project_id: project.id }, limit: 1 });
        source = rows[0] || null;
      } else {
        const rows = await selectRows("expenses", { filters: { id: sourceId, project_id: project.id }, limit: 1 });
        source = rows[0] || null;
      }
      if (!source) return fail("Master ledger entry not found for this project.",404);
      const amount = sourceType === "transaction" ? num(source.debit || source.amount) : num(source.amount);
      if (!(amount > 0)) return fail("Only debit/expense master-ledger entries can be pulled.",400);
      const row = {
        project_id:project.id, project_code_snapshot:project.project_code,
        supplier:clean(source.supplier || source.vendor || source.vendor_name || source.payee || source.supplier_name,160) || null,
        paid_to:clean(source.supplier || source.vendor || source.vendor_name || source.payee || source.supplier_name,160) || null,
        received_from:null,
        entry_date:source.transaction_date || source.expense_date || new Date().toISOString().slice(0,10),
        details:source.description || source.category || "Master ledger expense",
        sft:0, rate:0, debit:amount, credit:0, category,
        memo:`MASTER_LEDGER:${sourceType}:${sourceId}`, source:"master_ledger",
        created_by:employeeCodeOf(user) || "LAND VIEW"
      };
      const saved = await insertRows("project_management_ledger", row);
      return ok(saved[0] || row);
    }
    const v = await validateEntry(body);
    const row = {
      project_id:project.id,
      project_code_snapshot:project.project_code,
      supplier:v.paidTo,
      paid_to:v.paidTo,
      received_from:v.receivedFrom,
      entry_date:v.entryDate,
      details:v.details,
      sft:v.sft,
      rate:v.rate,
      debit:v.debit,
      credit:v.credit,
      category:v.category,
      memo:v.memo,
      source:"project_management",
      created_by:employeeCodeOf(user) || userIdOf(user) || "LAND VIEW"
    };
    const saved = await insertRows("project_management_ledger", row);
    return ok(saved[0] || row);
  } catch (e) { return fail(e, errorStatus(e instanceof Error ? e.message : String(e))); }
}

export async function PUT(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.",403);
    const user = await requireUser(request);
    if (!isAdmin(user)) return fail("Admin permission required.",403);
    const body = await request.json() as Row;
    const id = clean(body.id,100);
    if (!id) return fail("Ledger entry ID is required.",400);
    const v = await validateEntry(body);
    const saved = await updateRows("project_management_ledger", { id }, {
      supplier:v.paidTo,
      paid_to:v.paidTo,
      received_from:v.receivedFrom,
      entry_date:v.entryDate,
      details:v.details,
      sft:v.sft,
      rate:v.rate,
      debit:v.debit,
      credit:v.credit,
      category:v.category,
      memo:v.memo,
      updated_at:new Date().toISOString()
    });
    if (!saved.length) return fail("Ledger entry not found.",404);
    return ok(saved[0]);
  } catch (e) { return fail(e, errorStatus(e instanceof Error ? e.message : String(e))); }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.",403);
    const user = await requireUser(request);
    if (!isAdmin(user)) return fail("Admin permission required.",403);
    const id = clean(request.nextUrl.searchParams.get("id"),100);
    const type = clean(request.nextUrl.searchParams.get("type"),40);
    if (!id) return fail("Record ID is required.",400);
    if (type === "contractor-bill") {
      const deleted = await deleteRows("project_contractor_bills",{id});
      if (!deleted.length) return fail("Contractor bill not found.",404);
      return ok({deleted:true,id,type});
    }
    if (type === "contractor-contract") {
      const deleted = await deleteRows("project_contractor_contracts",{id});
      if (!deleted.length) return fail("Contractor contract not found.",404);
      return ok({deleted:true,id,type});
    }
    const deleted = await deleteRows("project_management_ledger", { id });
    if (!deleted.length) return fail("Ledger entry not found.",404);
    return ok({ deleted:true, id });
  } catch (e) { return fail(e, errorStatus(e instanceof Error ? e.message : String(e))); }
}
