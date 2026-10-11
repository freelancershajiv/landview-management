import { NextRequest, NextResponse } from "next/server";
import { GET as coreGET, POST as corePOST, PUT as corePUT, DELETE as coreDELETE } from "../project-management/route";
import { selectRows } from "@/lib/supabase-data";
import { supplierAdvanceApplied, supplierHeldCheque, supplierMovement, supplierNum, supplierWorkspaceForProject } from "@/lib/project-supplier-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const INCOME_SUFFIX = "::supplier-income";
const sourceId = (value: unknown) => String(value || "").endsWith(INCOME_SUFFIX) ? String(value).slice(0, -INCOME_SUFFIX.length) : String(value || "");
const createdBefore = (value: unknown) => { const parsed=Date.parse(String(value||"")); return Number.isFinite(parsed)?new Date(parsed-1).toISOString():String(value||""); };
const effectiveDebit = (row: Row) => row?.effective_debit !== undefined && row?.effective_debit !== null ? supplierNum(row.effective_debit) : (supplierHeldCheque(row) ? 0 : supplierNum(row.debit));

async function rawProjectRows(projectId: string) {
  return selectRows("project_management_ledger", { filters: { project_id: projectId }, order: "entry_date:asc", limit: 20000 });
}

function cashLedgerRows(sourceRows: Row[]) {
  const expanded: Row[] = [];
  for (const raw of sourceRows) {
    const row = { ...raw };
    const movement = supplierMovement(row);

    if (movement === "delivery") continue;

    if (movement === "advance_fund" && supplierNum(row.debit) > 0) {
      if (supplierHeldCheque(row)) {
        expanded.push({ ...row, effective_debit: 0 });
        continue;
      }
      const amount = supplierNum(row.debit);
      expanded.push({
        ...row,
        id: `${row.id}${INCOME_SUFFIX}`,
        source_entry_id: row.id,
        virtual_entry_side: "income",
        created_at: createdBefore(row.created_at),
        debit: amount,
        effective_debit: amount,
        credit: 0,
      });
      expanded.push({
        ...row,
        source_entry_id: row.id,
        virtual_entry_side: "supplier_advance",
        supplier_funding_category: row.category,
        debit: 0,
        effective_debit: 0,
        credit: amount,
        category: "Supplier Advance",
        memo: [row.memo, "SUPPLIER_ADVANCE_FUND"].filter(Boolean).join("\n"),
      });
      continue;
    }

    if (movement === "direct_purchase" && supplierNum(row.credit) > 0) {
      const rawValue = supplierNum(row.credit);
      const applied = supplierAdvanceApplied(row);
      const cashValue = Math.max(0, rawValue - applied);
      if (cashValue <= 0) continue;
      expanded.push({
        ...row,
        supplier_value: rawValue,
        supplier_advance_applied: applied,
        credit: cashValue,
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
  return expanded;
}

async function transformData(data: Row) {
  const projectId=String(data?.selectedProject?.id||"");
  if(!projectId)return data;
  const rawRows=await rawProjectRows(projectId);
  const expanded=cashLedgerRows(rawRows);
  const categories=Array.from(new Set(expanded.map((r:Row)=>String(r.category||"Other Expenses").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)).map(category=>{
    const matching=expanded.filter((r:Row)=>String(r.category||"Other Expenses").trim()===category);
    return {category,total:matching.reduce((s:number,r:Row)=>s+effectiveDebit(r)+supplierNum(r.credit),0),count:matching.length};
  });
  const workspace=await supplierWorkspaceForProject(projectId,String(data?.selectedProject?.projectCode||""));
  const summary=workspace.summary;
  return {
    ...data,
    entries:expanded,
    categories,
    totals:{
      ...(data?.totals||{}),
      debit:summary.recordedFunds,
      credit:summary.cashOutflow,
      cashIncome:summary.cashIncome,
      recognizedExpense:summary.recognizedExpense,
      cashOutflow:summary.cashOutflow,
      balance:summary.cashBalance,
    },
    summary:{
      ...(data?.summary||{}),
      supplierAdvance:summary.supplierAdvance,
      supplierPayable:summary.supplierPayable,
      engShajivBalance:summary.cashBalance,
      liquidPosition:summary.liquidPosition,
    },
    supplierAccountsSummary:summary,
  };
}

async function jsonResponse(response: Response, transform=false){
  const text=await response.text(); let payload:any;
  try{payload=text?JSON.parse(text):null}catch{return new Response(text,{status:response.status,headers:response.headers})}
  if(transform&&response.ok&&payload?.success&&payload?.data?.selectedProject)payload={...payload,data:await transformData(payload.data)};
  const headers=new Headers(response.headers);headers.set("Cache-Control","no-store, max-age=0");headers.delete("content-length");
  return NextResponse.json(payload,{status:response.status,headers});
}

export async function GET(request:NextRequest){return jsonResponse(await coreGET(request),true)}
export async function POST(request:NextRequest){return corePOST(request)}

export async function PUT(request:NextRequest){
  const body=await request.json() as Row;
  const originalId=body?.id;
  body.id=sourceId(originalId);
  if(body.id){
    const rows=await selectRows("project_management_ledger",{filters:{id:body.id},limit:1});
    const original=rows[0];
    if(original){
      const movement=supplierMovement(original);
      if(movement==="advance_fund"&&String(originalId||"")===String(body.id)&&supplierNum(body.credit)>0&&supplierNum(body.debit)===0){
        body.debit=supplierNum(body.credit);body.credit=0;body.category=original.category;body.supplier_movement_type="advance_fund";
      }
      if(movement==="direct_purchase"&&supplierAdvanceApplied(original)>0&&supplierNum(body.credit)>=0){
        body.credit=supplierNum(body.credit)+supplierAdvanceApplied(original);
        body.supplier_advance_applied=supplierAdvanceApplied(original);
      }
    }
  }
  const forwarded=new NextRequest(request.url,{method:"PUT",headers:request.headers,body:JSON.stringify(body)});
  return corePUT(forwarded);
}

export async function DELETE(request:NextRequest){
  const url=new URL(request.url);const id=url.searchParams.get("id");if(id)url.searchParams.set("id",sourceId(id));
  return coreDELETE(new NextRequest(url,{method:"DELETE",headers:request.headers}));
}
