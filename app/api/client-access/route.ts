import { NextRequest, NextResponse } from "next/server";
import {
  QUICK_USER_COOKIE,
  SESSION_COOKIE,
  registerSupabaseSession,
  requireLocalSession,
  sessionMaxAge,
  signWorkspaceUser,
} from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
const BACKEND_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [0, 250, 700];

type Row = Record<string, any>;

function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function cookieOptions(maxAge: number) {
  return { httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"lax" as const, path:"/", maxAge, priority:"high" as const };
}
function statusForMessage(message: string) {
  const normalized=String(message||"").trim().toLowerCase();
  if (["unauthorized","session expired","session expired.","invalid session","invalid session.","authentication required","authentication required."].includes(normalized)) return 401;
  if (/^access denied\b|permission required|access is required/.test(normalized)) return 403;
  return 502;
}
function roleOf(user:Row|null|undefined){return clean(user?.role||user?.Role,30).toLowerCase();}
function num(value:unknown){const n=Number(String(value??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;}
function projectIdsOf(user:Row){
  const raw=clean(user.projectIds||user.Project_IDs||user.project_ids,3000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
function categoryOf(row:Row){
  const source=clean(row.billing_category||row.category||row.payment_for||row.income_category||row.description,200).toLowerCase();
  if(source.includes("supervision")) return "supervision";
  if(/other|soil|survey|municipality|file pass/.test(source)) return "others";
  return "engineering";
}
function mapTask(row:Row, projectCode:string){return {
  Task_ID:row.task_code||row.Task_ID||"", Project_ID:projectCode, Task_Title:row.title||row.task_title||"Project service",
  Description:row.description||"", Assigned_Employee_ID:row.assigned_employee_code||"", Priority:row.priority||"Normal",
  Status:row.status||"Pending", Start_Date:row.start_date||"", Due_Date:row.due_date||"", Completed_At:row.completed_at||"",
  Created_At:row.source_created_at||row.created_at||"", Created_By:row.source_created_by||"", Progress:row.progress??0,
};}
function mapInvoice(row:Row, projectCode:string){return {
  Invoice_ID:row.invoice_code||"", Project_ID:projectCode, Invoice_Date:row.issue_date||"", Invoice_No:row.invoice_no||row.invoice_code||"",
  Total_Amount:row.total_bill_snapshot??row.amount??0, Paid_Amount:row.paid_amount_snapshot??0, Due_Amount:row.due_amount_snapshot??0,
  Status:row.status||"", PDF_URL:row.pdf_url||"", Drive_File_ID:row.drive_file_id||row.pdf_file_id||"", Download_URL:row.download_url||"",
};}

async function fetchBackend(payload:Record<string,unknown>){
  let lastError:Error|null=null;
  for(let attempt=0;attempt<RETRY_DELAYS_MS.length;attempt+=1){
    const delay=RETRY_DELAYS_MS[attempt]; if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    try{
      const response=await fetch(APPS_SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload),cache:"no-store",redirect:"follow",signal:AbortSignal.timeout(BACKEND_TIMEOUT_MS)});
      const raw=await response.text(); let json:any;
      try{json=JSON.parse(raw);}catch{lastError=new Error(/^\s*</.test(raw)?"Apps Script returned HTML instead of JSON.":"Client backend returned invalid JSON.");if(attempt<RETRY_DELAYS_MS.length-1)continue;throw lastError;}
      if(response.status>=500&&attempt<RETRY_DELAYS_MS.length-1){lastError=new Error(`Apps Script returned HTTP ${response.status}.`);continue;}
      return json;
    }catch(error:any){lastError=error instanceof Error?error:new Error(String(error||"Client backend request failed."));if(attempt>=RETRY_DELAYS_MS.length-1)throw lastError;}
  }
  throw lastError||new Error("Client backend request failed.");
}
async function callLegacy(request:NextRequest,clientOp:string,payload:Record<string,unknown>={},includeSession=true){
  if(!APPS_SCRIPT_URL||!PROXY_SECRET)throw new Error("LAND VIEW client backend is not configured.");
  const token=request.cookies.get(SESSION_COOKIE)?.value||"";
  const json=await fetchBackend({action:"getPublicProjects",_clientPortal:"1",clientOp,proxySecret:PROXY_SECRET,...(includeSession&&token?{token}:{}),...payload});
  if(!json?.success)throw new Error(String(json?.error||json?.message||"Client portal request failed."));
  return json.data||{};
}

async function buildWorkspace(user:Row){
  if(roleOf(user)!=="client") throw new Error("Client access required.");
  const allowed=projectIdsOf(user);
  if(!allowed.length) throw new Error("No project is linked to this client session.");
  const projects=await selectRows("projects",{inFilters:{project_code:allowed},limit:5000});
  const result=[];
  for(const project of projects){
    const code=clean(project.project_code,60);
    const [bills,payments,tasks,invoices]=await Promise.all([
      selectRows("bills",{filters:{project_id:project.id},order:"bill_date:asc",limit:5000}),
      selectRows("payments",{filters:{project_id:project.id},order:"payment_date:asc",limit:5000}),
      selectRows("tasks",{filters:{project_id:project.id},order:"created_at:asc",limit:5000}),
      selectRows("invoices",{filters:{project_id:project.id},order:"issue_date:desc",limit:5000}),
    ]);
    const groups={engineering:{bill:0,paid:0},supervision:{bill:0,paid:0},others:{bill:0,paid:0}};
    for(const row of bills){const key=categoryOf(row) as keyof typeof groups;groups[key].bill+=Math.max(0,num(row.net_amount??(num(row.amount)-num(row.discount))));}
    for(const row of payments){if(clean(row.approval_status||row.status,40).toLowerCase()==="rejected")continue;const key=categoryOf(row) as keyof typeof groups;groups[key].paid+=Math.max(0,num(row.amount));}
    const bill=groups.engineering.bill+groups.supervision.bill+groups.others.bill;
    const paid=groups.engineering.paid+groups.supervision.paid+groups.others.paid;
    const mappedTasks=tasks.map((row:Row)=>mapTask(row,code));
    const completed=mappedTasks.filter((row:Row)=>clean(row.Status,30).toLowerCase()==="completed").length;
    const billing:Record<string,Row[]>={
      "Design Bill":bills.filter((row:Row)=>categoryOf(row)==="engineering"),
      "Design Deposit":payments.filter((row:Row)=>categoryOf(row)==="engineering"),
      "Supervision Bill":bills.filter((row:Row)=>categoryOf(row)==="supervision"),
      "S Deposit":payments.filter((row:Row)=>categoryOf(row)==="supervision"),
      "Others Bill":bills.filter((row:Row)=>categoryOf(row)==="others"),
      "Others Bill Deposit":payments.filter((row:Row)=>categoryOf(row)==="others"),
    };
    result.push({
      projectId:code, clientName:project.client_name_snapshot||user.name||user.Name||code, projectName:project.project_name||code,
      location:project.location||"", mobile:project.phone_number_snapshot||"", status:project.status||"Active",
      finance:{totalBill:bill,totalPaid:paid,due:Math.max(0,bill-paid),engineeringBill:groups.engineering.bill,engineeringPaid:groups.engineering.paid,engineeringDue:Math.max(0,groups.engineering.bill-groups.engineering.paid),supervisionBill:groups.supervision.bill,supervisionPaid:groups.supervision.paid,supervisionDue:Math.max(0,groups.supervision.bill-groups.supervision.paid),othersBill:groups.others.bill,othersPaid:groups.others.paid,othersDue:Math.max(0,groups.others.bill-groups.others.paid)},
      workflow:mappedTasks,progress:mappedTasks.length?Math.round(completed*100/mappedTasks.length):0,completedServices:completed,totalServices:mappedTasks.length,
      invoices:invoices.map((row:Row)=>mapInvoice(row,code)),billing,certificateRequests:[],
    });
  }
  return {projects:result,client:{name:user.name||user.Name||"Client",projectIds:allowed},updatedAt:new Date().toISOString(),source:"supabase"};
}

export async function GET(request:NextRequest){
  try{
    const mode=clean(request.nextUrl.searchParams.get("mode"),30).toLowerCase();
    if(mode==="admin-requests"){
      const data=await callLegacy(request,"adminRequests");
      return NextResponse.json({success:true,data},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"google-certificate-service"}});
    }
    const user=await requireLocalSession(request) as Row|null;
    if(!user)return NextResponse.json({success:false,error:"Session expired."},{status:401});
    return NextResponse.json({success:true,data:await buildWorkspace(user)},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
  }catch(error:any){const message=error?.message||"Could not load client portal.";return NextResponse.json({success:false,error:message},{status:statusForMessage(message)});}
}

export async function POST(request:NextRequest){
  try{
    if(!sameOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const input=await request.json(); const action=clean(input?.action,40).toLowerCase();
    if(action==="login"){
      const data=await callLegacy(request,"login",{projectId:clean(input?.projectId,60).toUpperCase(),mobile:clean(input?.mobile,40)},false);
      const token=String(data?.token||""); const user=data?.user as Row|undefined;
      if(!token||!user)throw new Error("Client login session was not created.");
      await registerSupabaseSession(token,user,false,"");
      const {_token,...safe}=data;
      const response=NextResponse.json({success:true,data:safe},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Auth":"legacy-credential-check+supabase-session"}});
      const maxAge=sessionMaxAge(false)||COOKIE_MAX_AGE_SECONDS;
      response.cookies.set(SESSION_COOKIE,token,cookieOptions(maxAge));
      response.cookies.set(QUICK_USER_COOKIE,signWorkspaceUser(user),cookieOptions(maxAge));
      return response;
    }
    if(action==="request-certificate"){
      const data=await callLegacy(request,"requestCertificate",{projectId:clean(input?.projectId,60).toUpperCase(),certificateType:clean(input?.certificateType,30),subject:clean(input?.subject,160),details:clean(input?.details,800)});
      return NextResponse.json({success:true,data},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"google-certificate-service"}});
    }
    if(action==="review-request"){
      const data=await callLegacy(request,"reviewRequest",{requestId:clean(input?.requestId,80),decision:clean(input?.decision,20),note:clean(input?.note,400),certificateId:clean(input?.certificateId,80)});
      return NextResponse.json({success:true,data},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"google-certificate-service"}});
    }
    return NextResponse.json({success:false,error:"Unknown client action."},{status:400});
  }catch(error:any){const message=error?.message||"Client portal request failed.";return NextResponse.json({success:false,error:message},{status:statusForMessage(message)});}
}
