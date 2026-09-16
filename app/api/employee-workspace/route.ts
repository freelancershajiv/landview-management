import { NextRequest, NextResponse } from "next/server";
import { handleLandviewDataAction, selectRows, upsertRows, employeeCodeOf } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const SESSION_COOKIE = "landview_session";

type BackendJson={success?:boolean;data?:any;error?:string;message?:string};
function text(v:unknown){return String(v??"").trim();}
function roleOf(user:any){return text(user?.role||user?.Role).toLowerCase();}
function projectIdOf(row:any){return text(row?.Project_ID||row?.["Project ID"]||row?.FILE_ID||row?.["FILE ID"]);}
function assignedEmployeeOf(row:any){return text(row?.Assigned_Employee_ID||row?.["Assigned Employee ID"]);}
async function callBackend(payload:Record<string,unknown>):Promise<BackendJson>{
  const response=await fetch(APPS_SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload),cache:"no-store",redirect:"follow",signal:AbortSignal.timeout(12000)});
  const raw=await response.text();let json:any;try{json=JSON.parse(raw);}catch{throw new Error(/^\s*</.test(raw)?"Apps Script returned HTML instead of JSON.":"Apps Script returned invalid JSON.");}return json;
}
function ok(data:any){return NextResponse.json({success:true,data},{status:200,headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":data?.source==="supabase"?"supabase":"migration"}});}

async function importLegacyWorkspace(base:Record<string,unknown>,user:Record<string,unknown>){
  const legacy=await callBackend({...base,action:"getPublicProjects",_employeeWorkspace:"1"});
  if(!legacy?.success)throw new Error(String(legacy?.error||legacy?.message||"Could not load employee workspace."));
  const data=legacy.data||{};const employeeCode=employeeCodeOf(user);const allowedProjectIds=Array.from(new Set((Array.isArray(data.allowedProjectIds)?data.allowedProjectIds:[]).map((v:any)=>text(v)).filter(Boolean)));
  const [employees,projects]=await Promise.all([selectRows("employees",{limit:1000}),selectRows("projects",{limit:5000})]);
  const empByCode=new Map(employees.map(e=>[text(e.employee_code),e]));const projectByCode=new Map(projects.map(p=>[text(p.project_code),p]));const me=empByCode.get(employeeCode);
  if(me&&allowedProjectIds.length){const links=allowedProjectIds.map((pid:any)=>projectByCode.get(text(pid))).filter(Boolean).map((p:any)=>({project_id:p.id,employee_id:me.id,assignment_role:"Employee Workspace",active:true,assigned_at:new Date().toISOString()}));if(links.length)await upsertRows("project_employees",links,"project_id,employee_id");}
  const workflow=Array.isArray(data.workflow)?data.workflow:[];const taskRows=workflow.map((row:any)=>{const p=projectByCode.get(projectIdOf(row));const assignee=empByCode.get(assignedEmployeeOf(row));const taskCode=text(row.Task_ID||row["Task ID"]);if(!taskCode||!p)return null;return{task_code:taskCode,project_id:p.id,task_title:text(row.Task_Title||row["Task Title"]||row.Title)||"Project Task",description:text(row.Description)||null,assigned_employee_id:assignee?.id||null,priority:text(row.Priority)||"Normal",status:text(row.Status)||"Pending",start_date:text(row.Start_Date)||null,due_date:text(row.Due_Date)||null,progress:Number(row.Progress||0)||0,project_name_snapshot:p.project_name||null,source_created_at:text(row.Created_At)||new Date().toISOString(),source_updated_at:new Date().toISOString(),source_created_by:employeeCode||null};}).filter(Boolean) as Record<string,unknown>[];
  if(taskRows.length)await upsertRows("tasks",taskRows,"task_code");
  return {...data,source:"legacy-imported-to-supabase",migrated:true,updatedAt:new Date().toISOString()};
}

export async function GET(request:NextRequest){
  try{
    if(!APPS_SCRIPT_URL||!PROXY_SECRET)return NextResponse.json({success:false,error:"LAND VIEW backend is not configured."},{status:503});
    const token=request.cookies.get(SESSION_COOKIE)?.value||"";if(!token)return NextResponse.json({success:false,error:"Session expired."},{status:401});
    const base={token,proxySecret:PROXY_SECRET};const session=await callBackend({...base,action:"getSession"});const user=session?.data?.user as Record<string,unknown>|undefined;
    if(!session?.success||!session?.data?.authenticated||!user)return NextResponse.json({success:false,error:"Employee session expired."},{status:401});
    if(roleOf(user)!=="employee")return NextResponse.json({success:false,error:"Employee access is required."},{status:403});

    const employeeCode=employeeCodeOf(user);const employees=await selectRows("employees",{filters:{employee_code:employeeCode},limit:1});const me=employees[0];
    const links=me?await selectRows("project_employees",{filters:{employee_id:me.id,active:true},limit:5000}):[];
    if(!me||links.length===0)return ok(await importLegacyWorkspace(base,user));

    const projects=await handleLandviewDataAction("getProjects",{},user) as any[];const allowedProjectIds=projects.map(projectIdOf).filter(Boolean);const allowed=new Set(allowedProjectIds);
    const tasks=await handleLandviewDataAction("getErpRecords",{module:"tasks"},user) as any[];const workflow=tasks.filter(row=>allowed.has(projectIdOf(row))&&(!assignedEmployeeOf(row)||assignedEmployeeOf(row)===employeeCode));
    return ok({workflow,assignedWorkflow:workflow.filter(r=>assignedEmployeeOf(r)===employeeCode),unassignedWorkflow:workflow.filter(r=>!assignedEmployeeOf(r)),allowedProjectIds,employeeId:employeeCode,source:"supabase",degraded:false,updatedAt:new Date().toISOString()});
  }catch(error){const message=error instanceof Error?error.message:"Employee workspace request failed.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:502,headers:{"Cache-Control":"no-store"}});}
}
