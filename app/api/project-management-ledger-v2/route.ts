import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST, PUT as legacyPUT, DELETE as legacyDELETE } from "../project-management-ledger/route";
import { selectRows } from "@/lib/supabase-data";
import { supplierHeldCheque, supplierMovement, supplierNum, supplierWorkspaceForProject } from "@/lib/project-supplier-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const suffix = "::supplier-income";
const isVirtual = (value: unknown) => String(value || "").endsWith(suffix);
const sourceId = (value: unknown) => isVirtual(value) ? String(value).slice(0, -suffix.length) : String(value || "");
const isLegacyVirtual = (value: unknown) => String(value || "").endsWith("::sattapur-income");
const effectiveDebit = (row: Row) => row?.effective_debit !== undefined && row?.effective_debit !== null ? supplierNum(row.effective_debit) : (supplierHeldCheque(row) ? 0 : supplierNum(row.debit));
const createdBefore = (value: unknown) => { const parsed=Date.parse(String(value||"")); return Number.isFinite(parsed)?new Date(parsed-1).toISOString():String(value||""); };

async function transformData(data: Row) {
  const sourceEntries: Row[] = Array.isArray(data?.entries) ? data.entries : [];
  const expanded: Row[] = [];

  for (const row of sourceEntries) {
    const movement = supplierMovement(row);
    if (movement === "delivery") continue;

    if (movement === "advance_fund" && supplierNum(row.debit) > 0 && !supplierHeldCheque(row)) {
      const amount = supplierNum(row.debit);
      expanded.push({
        ...row,
        id: `${row.id}${suffix}`,
        source_entry_id: row.id,
        virtual_entry_side: "income",
        created_at: createdBefore(row.created_at),
        debit: amount,
        effective_debit: amount,
        credit: 0,
      });
      expanded.push({
        ...row,
        supplier_funding_category: row.category,
        debit: 0,
        effective_debit: 0,
        credit: amount,
        category: "Supplier Advance",
        memo: [row.memo, "SUPPLIER_ADVANCE_FUND"].filter(Boolean).join("\n"),
      });
      continue;
    }

    expanded.push(row);
  }

  expanded.sort((a: Row,b: Row)=>{
    const d=String(a.entry_date||"").localeCompare(String(b.entry_date||"")); if(d)return d;
    const c=String(a.created_at||"").localeCompare(String(b.created_at||"")); if(c)return c;
    if(a.virtual_entry_side==="income"&&b.virtual_entry_side!=="income")return -1;
    if(b.virtual_entry_side==="income"&&a.virtual_entry_side!=="income")return 1;
    return String(a.id||"").localeCompare(String(b.id||""));
  });

  let balance=0,incomeBalance=0,expenseBalance=0;
  for(const row of expanded){
    const debit=supplierNum(row.debit),income=effectiveDebit(row),credit=supplierNum(row.credit);
    incomeBalance+=income;expenseBalance+=credit;balance+=income-credit;
    row.debit=debit;row.effective_debit=income;row.credit=credit;row.income_balance=incomeBalance;row.expense_balance=expenseBalance;row.balance=balance;
  }

  const categories=Array.from(new Set(expanded.map((r:Row)=>String(r.category||"Other Expenses").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)).map(category=>{
    const matching=expanded.filter((r:Row)=>String(r.category||"Other Expenses").trim()===category);
    return {category,total:matching.reduce((s:number,r:Row)=>s+effectiveDebit(r)+supplierNum(r.credit),0),count:matching.length};
  });
  const cashIncome=expanded.reduce((s:number,r:Row)=>s+effectiveDebit(r),0);
  const cashExpense=expanded.reduce((s:number,r:Row)=>s+supplierNum(r.credit),0);

  let supplierSummary: Row = {};
  if(data?.selectedProject?.id){
    try { supplierSummary=(await supplierWorkspaceForProject(String(data.selectedProject.id),String(data.selectedProject.projectCode||""))).summary; } catch {}
  }

  return {
    ...data,
    entries:expanded,
    categories,
    totals:{...(data?.totals||{}),cashIncome,credit:cashExpense,balance:cashIncome-cashExpense},
    summary:{...(data?.summary||{}),supplierAdvance:supplierSummary.supplierAdvance??data?.summary?.supplierAdvance??0,supplierPayable:supplierSummary.supplierPayable??0,engShajivBalance:cashIncome-cashExpense},
    supplierAccountsSummary:supplierSummary,
  };
}

async function jsonResponse(response: Response, transform=false){
  const text=await response.text(); let payload:any;
  try{payload=text?JSON.parse(text):null}catch{return new Response(text,{status:response.status,headers:response.headers})}
  if(transform&&response.ok&&payload?.success&&payload?.data?.selectedProject)payload={...payload,data:await transformData(payload.data)};
  const headers=new Headers(response.headers);headers.set("Cache-Control","no-store, max-age=0");headers.delete("content-length");
  return NextResponse.json(payload,{status:response.status,headers});
}

export async function GET(request:NextRequest){return jsonResponse(await legacyGET(request),true)}
export async function POST(request:NextRequest){return legacyPOST(request)}
export async function PUT(request:NextRequest){
  const body=await request.json() as Row; const originalId=body?.id; body.id=sourceId(originalId);
  if(!isVirtual(originalId)&&!isLegacyVirtual(originalId)&&String(body?.category||"").trim().toLowerCase()==="supplier advance"&&supplierNum(body?.credit)>0&&supplierNum(body?.debit)===0){
    const rows=await selectRows("project_management_ledger",{filters:{id:body.id},limit:1}); const original=rows[0];
    body.debit=supplierNum(body.credit);body.credit=0;
    if(original?.category)body.category=original.category;
    body.supplier_movement_type="advance_fund";
  }
  const forwarded=new NextRequest(request.url,{method:"PUT",headers:request.headers,body:JSON.stringify(body)});
  return legacyPUT(forwarded);
}
export async function DELETE(request:NextRequest){
  const url=new URL(request.url);const id=url.searchParams.get("id");if(id)url.searchParams.set("id",sourceId(id));
  return legacyDELETE(new NextRequest(url,{method:"DELETE",headers:request.headers}));
}
