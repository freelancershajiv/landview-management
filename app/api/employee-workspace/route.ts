import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { handleLandviewDataAction, selectRows, upsertRows, employeeCodeOf } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
function text(v:unknown){return String(v??"").trim();}
function roleOf(user:any){return text(user?.role||user?.Role).toLowerCase();}
function projectIdOf(row:any){return text(row?.Project_ID||row?.["Project ID"]||row?.FILE_ID||row?.["FILE ID"]);}
function assignedEmployeeOf(row:any){return text(row?.Assigned_Employee_ID||row?.["Assigned Employee ID"]);}
function projectCodesOf(user:Row){
  const raw=text(user?.projectIds||user?.Project_IDs||user?.project_ids);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(v=>v.trim().toUpperCase()).filter(v=>/^LV-?\d+$/.test(v)).map(v=>`LV-${Number(v.replace(/\D/g,""))}`)));
}
function ok(data:any){return NextResponse.json({success:true,data},{status:200,headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});}

async function seedAssignmentsFromSession(user:Row, employeeCode:string){
  const projectCodes=projectCodesOf(user);
  if(!projectCodes.length)return [];
  const [employees,projects]=await Promise.all([
    selectRows("employees",{filters:{employee_code:employeeCode},limit:1}),
    selectRows("projects",{inFilters:{project_code:projectCodes},limit:5000}),
  ]);
  const employee=employees[0];
  if(!employee||!projects.length)return [];
  const now=new Date().toISOString();
  const links=projects.map((project:any)=>({project_id:project.id,employee_id:employee.id,assignment_role:"Employee Workspace",active:true,assigned_at:now}));
  await upsertRows("project_employees",links,"project_id,employee_id");
  return links;
}

export async function GET(request:NextRequest){
  try{
    const user=await requireLocalSession(request) as Row|null;
    if(!user)return NextResponse.json({success:false,error:"Employee session expired."},{status:401});
    if(roleOf(user)!=="employee")return NextResponse.json({success:false,error:"Employee access is required."},{status:403});

    const employeeCode=employeeCodeOf(user);
    const employees=await selectRows("employees",{filters:{employee_code:employeeCode},limit:1});
    const me=employees[0];
    if(!me)return ok({workflow:[],assignedWorkflow:[],unassignedWorkflow:[],allowedProjectIds:[],employeeId:employeeCode,source:"supabase",degraded:false,updatedAt:new Date().toISOString()});

    let links=await selectRows("project_employees",{filters:{employee_id:me.id,active:true},limit:5000});
    if(!links.length){
      await seedAssignmentsFromSession(user,employeeCode);
      links=await selectRows("project_employees",{filters:{employee_id:me.id,active:true},limit:5000});
    }

    const allowedProjectUuid=new Set(links.map((link:any)=>text(link.project_id)).filter(Boolean));
    const allProjects=await selectRows("projects",{limit:5000});
    const allowedProjectIds=allProjects.filter((p:any)=>allowedProjectUuid.has(text(p.id))).map((p:any)=>text(p.project_code)).filter(Boolean);
    const allowed=new Set(allowedProjectIds);
    const tasks=await handleLandviewDataAction("getErpRecords",{module:"tasks"},user) as any[];
    const workflow=tasks.filter(row=>allowed.has(projectIdOf(row))&&(!assignedEmployeeOf(row)||assignedEmployeeOf(row)===employeeCode));
    return ok({workflow,assignedWorkflow:workflow.filter(r=>assignedEmployeeOf(r)===employeeCode),unassignedWorkflow:workflow.filter(r=>!assignedEmployeeOf(r)),allowedProjectIds,employeeId:employeeCode,source:"supabase",degraded:false,updatedAt:new Date().toISOString()});
  }catch(error){const message=error instanceof Error?error.message:"Employee workspace request failed.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:502,headers:{"Cache-Control":"no-store"}});}
}
