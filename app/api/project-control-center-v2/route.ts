import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../project-control-center/route";
import { supplierNum, supplierWorkspaceForProject } from "@/lib/project-supplier-accounts";
import { contractorNum, contractorWorkspaceForProject } from "@/lib/project-contractor-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

async function jsonResponse(response: Response, transform=false){
  const text=await response.text();let payload:any;
  try{payload=text?JSON.parse(text):null}catch{return new Response(text,{status:response.status,headers:response.headers})}
  if(transform&&response.ok&&payload?.success&&payload?.data?.selectedProject?.id){
    const selected=payload.data.selectedProject;
    const [supplierWorkspace,contractorWorkspace]=await Promise.all([
      supplierWorkspaceForProject(String(selected.id),String(selected.projectCode||"")),
      contractorWorkspaceForProject(String(selected.id),String(selected.projectCode||"")),
    ]);
    const summary=supplierWorkspace.summary||{};
    const contractorSummary=contractorWorkspace.summary||{};
    const legacySupplier=payload.data.supplier||{};
    const attention:Array<Row>=Array.isArray(payload.data.attention)
      ? payload.data.attention.filter((item:Row)=>{
          const title=String(item?.title||"");
          return !/supplier advance still held with sattapur/i.test(title) && !/contractor/i.test(title);
        })
      : [];
    const projectCode=String(selected.projectCode||"");
    if(supplierNum(summary.supplierAdvance)>0)attention.push({level:"info",title:"Supplier advances still held",amount:supplierNum(summary.supplierAdvance),href:`/projectmanagement/suppliers?projectId=${encodeURIComponent(projectCode)}`});
    if(supplierNum(summary.supplierPayable)>0)attention.push({level:"warning",title:"Supplier deliveries currently payable",amount:supplierNum(summary.supplierPayable),href:`/projectmanagement/suppliers?projectId=${encodeURIComponent(projectCode)}`});
    if(contractorNum(contractorSummary.contractorPayable)>0)attention.push({level:"warning",title:"Certified contractor work is payable",amount:contractorNum(contractorSummary.contractorPayable),href:`/projectmanagement/contractors?projectId=${encodeURIComponent(projectCode)}`});
    if(contractorNum(contractorSummary.contractorAdvance)>0)attention.push({level:"info",title:"Contractor payments exceed certified work",amount:contractorNum(contractorSummary.contractorAdvance),href:`/projectmanagement/contractors?projectId=${encodeURIComponent(projectCode)}`});
    if(contractorNum(contractorSummary.unconfiguredContractCount)>0)attention.push({level:"info",title:`${contractorNum(contractorSummary.unconfiguredContractCount)} contractor contract(s) need financial setup`,amount:0,href:`/projectmanagement/contractors?projectId=${encodeURIComponent(projectCode)}`});
    if(supplierNum(summary.cashBalance)<0)attention.push({level:"warning",title:"Project cash balance is negative",amount:Math.abs(supplierNum(summary.cashBalance)),href:`/projectmanagement?projectId=${encodeURIComponent(projectCode)}`});
    if(!attention.length)attention.push({level:"good",title:"No immediate finance control warnings",amount:0,href:""});

    const contractorRows=contractorWorkspace.accounts.map((account:Row)=>({
      id:account.id,
      name:account.contractorName,
      partyType:"Contractor",
      category:account.category,
      contractValue:contractorNum(account.contractValue),
      certified:contractorNum(account.certifiedAmount),
      paid:contractorNum(account.paidAmount),
      payable:contractorNum(account.payable),
      advance:contractorNum(account.advance),
      physicalProgress:account.physicalProgress,
      certifiedProgress:account.certifiedProgress,
      paymentProgress:account.paymentProgress,
      latestProgress:account.latestProgress,
      contractConfigured:Boolean(account.contractConfigured),
    }));
    const certifiedBillCount=contractorWorkspace.accounts.reduce((sum:number,account:Row)=>sum+(account.bills||[]).filter((bill:Row)=>String(bill.status||"").toLowerCase()==="certified").length,0);

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
        contractorAdvance:contractorNum(contractorSummary.contractorAdvance),
        contractorPayable:contractorNum(contractorSummary.contractorPayable),
        contractorContractValue:contractorNum(contractorSummary.contractValue),
        contractorCertified:contractorNum(contractorSummary.certifiedAmount),
        contractorPaid:contractorNum(contractorSummary.paidAmount),
      },
      counts:{
        ...(payload.data.counts||{}),
        supplierAccounts:supplierNum(summary.accountCount),
        contractorAccounts:contractorNum(contractorSummary.contractorCount),
        configuredContracts:contractorNum(contractorSummary.configuredContractCount),
        unconfiguredContracts:contractorNum(contractorSummary.unconfiguredContractCount),
        certifiedBills:certifiedBillCount,
        progressUpdates:contractorNum(contractorSummary.progressUpdateCount),
        suppliersAndContractors:supplierNum(summary.accountCount)+contractorNum(contractorSummary.contractorCount),
      },
      supplier:{
        ...legacySupplier,
        accountCount:supplierNum(summary.accountCount),
        totalPayments:supplierNum(summary.totalPayments),
        totalDeliveredValue:supplierNum(summary.totalDeliveredValue),
        supplierAdvance:supplierNum(summary.supplierAdvance),
        supplierPayable:supplierNum(summary.supplierPayable),
      },
      contractor:{
        contractorCount:contractorNum(contractorSummary.contractorCount),
        contractValue:contractorNum(contractorSummary.contractValue),
        certifiedAmount:contractorNum(contractorSummary.certifiedAmount),
        paidAmount:contractorNum(contractorSummary.paidAmount),
        contractorAdvance:contractorNum(contractorSummary.contractorAdvance),
        contractorPayable:contractorNum(contractorSummary.contractorPayable),
        certifiedProgress:contractorSummary.certifiedProgress,
        paymentProgress:contractorSummary.paymentProgress,
        physicalProgress:contractorSummary.overallPhysicalProgress,
        physicalProgressReportedCount:contractorNum(contractorSummary.physicalProgressReportedCount),
      },
      contractors:contractorRows,
      attention,
    };
  }
  const headers=new Headers(response.headers);headers.set("Cache-Control","no-store, max-age=0");headers.delete("content-length");
  return NextResponse.json(payload,{status:response.status,headers});
}

export async function GET(request:NextRequest){return jsonResponse(await legacyGET(request),true)}
export async function POST(request:NextRequest){return legacyPOST(request)}