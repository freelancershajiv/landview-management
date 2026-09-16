import { NextRequest, NextResponse } from "next/server";
import {
  QUICK_USER_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  requireLocalSession,
  sessionMaxAge,
  signWorkspaceUser,
} from "@/lib/local-session";
import { supabaseAuthGateway } from "@/lib/supabase-auth";
import { insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (/did not match/.test(normalized)) return 401;
  return 500;
}
function roleOf(user:Row|null|undefined){return clean(user?.role||user?.Role,30).toLowerCase();}
function userIdOf(user:Row|null|undefined){return clean(user?.userId||user?.User_ID||user?.username||user?.Username,120);}
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
  Invoice_ID:row.invoice_code||row.invoice_no||row.id||"", Project_ID:projectCode, Invoice_Date:row.issue_date||"", Invoice_No:row.invoice_no||row.invoice_code||"",
  Total_Amount:row.total_bill_snapshot??row.amount??0, Paid_Amount:row.paid_amount_snapshot??0, Due_Amount:row.due_amount_snapshot??0,
  Status:row.status||"", PDF_URL:row.pdf_url||"", Drive_File_ID:row.drive_file_id||row.pdf_file_id||"", Download_URL:row.download_url||"",
};}
function mapRequest(row:Row){return {
  Request_ID:row.request_code, Requester_Role:row.requester_role||"", Requester_ID:row.requester_id||"", Project_ID:row.project_code||"",
  Employee_ID:row.employee_code||"", Client_Name:row.client_name||"", Mobile:row.mobile||"", Certificate_Type:row.certificate_type||"",
  Category:row.category||"", Subject:row.subject||"", Details:row.details||"", Status:row.status||"Pending", Certificate_ID:row.certificate_code||"",
  Requested_At:row.requested_at||"", Reviewed_At:row.reviewed_at||"", Reviewed_By:row.reviewed_by||"", Admin_Note:row.admin_note||"",
};}

async function buildWorkspace(user:Row){
  if(roleOf(user)!=="client") throw new Error("Client access required.");
  const allowed=projectIdsOf(user);
  if(!allowed.length) throw new Error("No project is linked to this client session.");
  const projects=await selectRows("projects",{inFilters:{project_code:allowed},limit:5000});
  const result=[];
  for(const project of projects){
    const code=clean(project.project_code,60);
    const [bills,payments,tasks,invoices,requests]=await Promise.all([
      selectRows("bills",{filters:{project_id:project.id},order:"bill_date:asc",limit:5000}),
      selectRows("payments",{filters:{project_id:project.id},order:"payment_date:asc",limit:5000}),
      selectRows("tasks",{filters:{project_id:project.id},order:"created_at:asc",limit:5000}),
      selectRows("invoices",{filters:{project_id:project.id},order:"issue_date:desc",limit:5000}),
      selectRows("certificate_requests",{filters:{project_code:code},order:"requested_at:desc",limit:1000}),
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
      invoices:invoices.map((row:Row)=>mapInvoice(row,code)),billing,certificateRequests:requests.map(mapRequest),
    });
  }
  return {projects:result,client:{name:user.name||user.Name||"Client",projectIds:allowed},updatedAt:new Date().toISOString(),source:"supabase"};
}

export async function GET(request:NextRequest){
  try{
    const mode=clean(request.nextUrl.searchParams.get("mode"),30).toLowerCase();
    if(mode==="admin-requests"){
      const user=await requireLocalSession(request) as Row|null;
      if(!user||!["admin","manager"].includes(roleOf(user))) return NextResponse.json({success:false,error:"Admin access required."},{status:403});
      const rows=await selectRows("certificate_requests",{order:"requested_at:desc",limit:5000});
      return NextResponse.json({success:true,data:rows.map(mapRequest)},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
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
      const data=await supabaseAuthGateway<{accessToken:string;refreshToken:string;user:Row}>("clientProjectLogin",{projectId:clean(input?.projectId,60).toUpperCase(),mobile:clean(input?.mobile,40)});
      if(!data?.accessToken||!data?.refreshToken||!data?.user)throw new Error("Client login session was not created.");
      const response=NextResponse.json({success:true,data:{user:data.user,backend:"supabase-auth"}},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Auth":"supabase"}});
      const maxAge=sessionMaxAge(false);
      response.cookies.set(SESSION_COOKIE,data.accessToken,cookieOptions(maxAge));
      response.cookies.set(REFRESH_COOKIE,data.refreshToken,cookieOptions(maxAge));
      response.cookies.set(QUICK_USER_COOKIE,signWorkspaceUser(data.user),cookieOptions(maxAge));
      return response;
    }
    const user=await requireLocalSession(request) as Row|null;
    if(!user)throw new Error("Session expired.");
    if(action==="request-certificate"){
      if(roleOf(user)!=="client")throw new Error("Client access required.");
      const projectId=normalizeProjectCode(input?.projectId);
      if(!projectIdsOf(user).includes(projectId))throw new Error("Access denied for this project.");
      const projectRows=await selectRows("projects",{filters:{project_code:projectId},limit:1});
      const project=projectRows[0];
      if(!project)throw new Error("Project not found.");
      const requestCode=`CR-${Date.now()}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
      const row={request_code:requestCode,requester_role:"client",requester_id:userIdOf(user),project_code:projectId,employee_code:null,client_name:project.client_name_snapshot||user.name||user.Name||"Client",mobile:project.phone_number_snapshot||null,certificate_type:clean(input?.certificateType,80)||"Project Certificate",category:clean(input?.category,80)||null,subject:clean(input?.subject,160)||null,details:clean(input?.details,800)||null,status:"Pending",certificate_code:null,requested_at:new Date().toISOString(),reviewed_at:null,reviewed_by:null,admin_note:null};
      const saved=await insertRows("certificate_requests",row);
      return NextResponse.json({success:true,data:mapRequest(saved[0]||row)},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
    }
    if(action==="review-request"){
      if(!["admin","manager"].includes(roleOf(user)))throw new Error("Admin access required.");
      const requestId=clean(input?.requestId,100); if(!requestId)throw new Error("Request ID is required.");
      const decision=clean(input?.decision,30)||"Reviewed";
      const rows=await updateRows("certificate_requests",{request_code:requestId},{status:decision,certificate_code:clean(input?.certificateId,100)||null,reviewed_at:new Date().toISOString(),reviewed_by:userIdOf(user),admin_note:clean(input?.note,400)||null});
      if(!rows.length)throw new Error("Certificate request not found.");
      return NextResponse.json({success:true,data:mapRequest(rows[0])},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
    }
    return NextResponse.json({success:false,error:"Unknown client action."},{status:400});
  }catch(error:any){const message=error?.message||"Client portal request failed.";return NextResponse.json({success:false,error:message},{status:statusForMessage(message)});}
}
