import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../project-control-center/route";
import { supplierNum, supplierWorkspaceForProject } from "@/lib/project-supplier-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

async function jsonResponse(response: Response, transform=false){
  const text=await response.text();let payload:any;
  try{payload=text?JSON.parse(text):null}catch{return new Response(text,{status:response.status,headers:response.headers})}
  if(transform&&response.ok&&payload?.success&&payload?.data?.selectedProject?.id){
    const selected=payload.data.selectedProject;
    const workspace=await supplierWorkspaceForProject(String(selected.id),String(selected.projectCode||""));
    const summary=workspace.summary||{};
    const legacySupplier=payload.data.supplier||{};
    const attention:Array<Row>=Array.isArray(payload.data.attention)
      ? payload.data.attention.filter((item:Row)=>!/supplier advance still held with sattapur/i.test(String(item?.title||"")))
      : [];
    if(supplierNum(summary.supplierAdvance)>0)attention.push({level:"info",title:"Supplier advances still held",amount:supplierNum(summary.supplierAdvance),href:`/projectmanagement/suppliers?projectId=${encodeURIComponent(String(selected.projectCode||""))}`});
    if(supplierNum(summary.supplierPayable)>0)attention.push({level:"warning",title:"Supplier deliveries currently payable",amount:supplierNum(summary.supplierPayable),href:`/projectmanagement/suppliers?projectId=${encodeURIComponent(String(selected.projectCode||""))}`});
    if(supplierNum(summary.cashBalance)<0)attention.push({level:"warning",title:"Project cash balance is negative",amount:Math.abs(supplierNum(summary.cashBalance)),href:`/projectmanagement?projectId=${encodeURIComponent(String(selected.projectCode||""))}`});
    if(!attention.length)attention.push({level:"good",title:"No immediate finance control warnings",amount:0,href:""});
    payload.data={
      ...payload.data,
      totals:{
        ...(payload.data.totals||{}),
        recordedFunds:supplierNum(summary.recordedFunds),
        cashIncome:supplierNum(summary.cashIncome),
        expense:supplierNum(summary.recognizedExpense),
        recognizedExpense:supplierNum(summary.recognizedExpense),
        cashOutflow:supplierNum(summary.cashOutflow),
        cashBalance:supplierNum(summary.cashBalance),
        chequeOnHold:supplierNum(summary.chequeOnHold),
        supplierAdvance:supplierNum(summary.supplierAdvance),
        supplierPayable:supplierNum(summary.supplierPayable),
        liquidPosition:supplierNum(summary.liquidPosition),
      },
      counts:{...(payload.data.counts||{}),supplierAccounts:supplierNum(summary.accountCount)},
      supplier:{
        ...legacySupplier,
        accountCount:supplierNum(summary.accountCount),
        totalPayments:supplierNum(summary.totalPayments),
        totalDeliveredValue:supplierNum(summary.totalDeliveredValue),
        supplierAdvance:supplierNum(summary.supplierAdvance),
        supplierPayable:supplierNum(summary.supplierPayable),
      },
      attention,
    };
  }
  const headers=new Headers(response.headers);headers.set("Cache-Control","no-store, max-age=0");headers.delete("content-length");
  return NextResponse.json(payload,{status:response.status,headers});
}

export async function GET(request:NextRequest){return jsonResponse(await legacyGET(request),true)}
export async function POST(request:NextRequest){return legacyPOST(request)}
