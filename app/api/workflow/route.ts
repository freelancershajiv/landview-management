import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { handleLandviewDataAction, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const WORKFLOW_SERVICES = [
  { title: "Architectural Design", aliases: ["architectural design", "architectural", "architect design", "architecture design"] },
  { title: "Structural Design", aliases: ["structural design", "structural"] },
  { title: "3D Design - Exterior", aliases: ["3d design exterior", "3d exterior", "exterior 3d", "3d exterior design"] },
  { title: "3D Design - Interior", aliases: ["3d design interior", "3d interior", "interior 3d", "3d interior design"] },
  { title: "Electrical Design", aliases: ["electrical design", "electrical"] },
  { title: "Fire Safety Design", aliases: ["fire safety design", "fire design", "fire safety"] },
  { title: "Plumbing Design", aliases: ["plumbing design", "plumbing"] },
  { title: "Plan Approval Design", aliases: ["plan approval design", "approval design"] },
  { title: "Estimate & Costing", aliases: ["estimate & costing", "estimate and costing", "estimate costing", "cost estimate", "estimation and costing", "estimation & costing"] },
  { title: "Design Books", aliases: ["design books", "design book"] },
  { title: "Re-Design Fees", aliases: ["re-design fees", "redesign fees", "re design fees"] },
  { title: "Municipality Land NOC", aliases: ["municipality land noc", "land noc"] },
  { title: "Fire Service Approval", aliases: ["fire service approval", "fire approval"] },
  { title: "Municipality Approval", aliases: ["municipality approval", "municipal approval"] },
  { title: "District Vetting Committee Approval", aliases: ["district vetting committee approval", "vetting committee approval", "district vetting"] },
  { title: "Consultancy Fees", aliases: ["consultancy fees", "consultancy fee"] },
  { title: "Submission Fees", aliases: ["submission fees", "submission fee"] },
  { title: "Soil Test", aliases: ["soil test", "soil testing", "soil investigation"] },
  { title: "Digital Survey", aliases: ["digital survey", "measurement / digital survey", "measurement digital survey", "land survey"] },
  { title: "Municipality File Pass", aliases: ["municipality file pass", "municipality pass", "municipality contract", "file pass", "plan pass"] },
  { title: "Site Supervision", aliases: ["site supervision", "supervision bill", "supervision"] },
] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase().replace(/[–—_-]+/g, " ").replace(/&/g, " and ").replace(/\s+/g, " ");
}

function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : raw;
}

function canonicalService(value: unknown, category: unknown = "") {
  const raw = normalize(value);
  const cat = normalize(category);
  if (!raw && /supervision/.test(cat)) return "Site Supervision";
  if (/supervision/.test(cat) && (!raw || /supervision/.test(raw))) return "Site Supervision";
  for (const service of WORKFLOW_SERVICES) {
    for (const candidate of [service.title, ...service.aliases]) {
      const alias = normalize(candidate);
      if (raw === alias || raw.includes(alias) || alias.includes(raw)) return service.title;
    }
  }
  if (/3d\s+design/.test(raw)) return "3D Design - Exterior";
  return "";
}

function effectiveBill(row: Row) {
  return !["void", "voided", "cancelled", "canceled", "rejected"].includes(normalize(row.status));
}

function taskId(task: Row) {
  return text(task.Task_ID || task["Task ID"] || task.TaskId);
}

function taskProject(task: Row) {
  return normalizeProjectId(task.Project_ID || task["Project ID"] || task.ProjectId);
}

function taskTitle(task: Row) {
  return text(task.Task_Title || task["Task Title"] || task.Title);
}

function makeAutoTaskId(projectId: string, title: string) {
  return `AUTO::${encodeURIComponent(projectId)}::${encodeURIComponent(title)}`;
}

function allowedOrigin(request: NextRequest) {
  const origin=request.headers.get("origin");
  if(!origin)return process.env.NODE_ENV!=="production"||request.headers.get("sec-fetch-site")==="same-origin";
  try{const host=new URL(origin).hostname.toLowerCase();return host==="app.landview.com.bd"||host==="www.landview.com.bd"||host==="landview.com.bd"||host==="localhost"||host==="127.0.0.1"||host.endsWith(".vercel.app");}catch{return false;}
}

export async function GET(request: NextRequest){
  try{
    const user=await requireLocalSession(request);
    if(!user)return NextResponse.json({success:false,error:"Session expired."},{status:401});
    if(!["admin","manager"].includes(roleOf(user)))return NextResponse.json({success:false,error:"Admin or manager access is required."},{status:403});

    const [projects,bills,savedTasks]=await Promise.all([
      selectRows("projects",{select:"id,project_code,project_name,client_name_snapshot",order:"project_code:asc",limit:5000}),
      selectRows("bills",{select:"project_id,billing_category,category,description,status",limit:5000}),
      handleLandviewDataAction("getErpRecords",{module:"tasks"},user) as Promise<Row[]>,
    ]);

    const projectById=new Map(projects.map(project=>[text(project.id),normalizeProjectId(project.project_code)]));
    const projectNames:Record<string,string>={};
    for(const project of projects){
      const code=normalizeProjectId(project.project_code);
      if(code)projectNames[code]=text(project.project_name)||text(project.client_name_snapshot)||code;
    }

    const requirements=new Map<string,Set<string>>();
    for(const bill of bills){
      if(!effectiveBill(bill))continue;
      const projectId=projectById.get(text(bill.project_id))||"";
      if(!projectId)continue;
      const service=canonicalService(bill.description,bill.billing_category||bill.category);
      if(!service)continue;
      if(!requirements.has(projectId))requirements.set(projectId,new Set());
      requirements.get(projectId)!.add(service);
    }

    const stored=new Map<string,Row>();
    for(const task of savedTasks||[]){
      const projectId=taskProject(task);
      const title=canonicalService(taskTitle(task));
      if(!projectId||!title)continue;
      const required=requirements.get(projectId);
      if(!required?.has(title))continue;
      stored.set(`${projectId}\n${title}`,{...task,Project_ID:projectId,Task_Title:title});
    }

    const tasks:Row[]=[];
    for(const [projectId,services] of requirements){
      for(const title of services){
        const saved=stored.get(`${projectId}\n${title}`);
        tasks.push(saved||{
          Task_ID:makeAutoTaskId(projectId,title),
          Project_ID:projectId,
          Project_Name:projectNames[projectId]||"",
          Task_Title:title,
          Assigned_Employee_ID:"",
          Priority:"Normal",
          Start_Date:"",
          Due_Date:"",
          Status:"Pending",
          Progress:0,
          Description:"Auto-created from Supabase billing service",
          Completed_At:"",
        });
      }
    }

    return NextResponse.json({success:true,data:{tasks,projects:projectNames,source:"supabase",billingServices:tasks.length,savedTasks:savedTasks.length}},{status:200,headers:{"Cache-Control":"private, no-store, max-age=0","X-Landview-Data":"supabase","X-Landview-Module":"workflow"}});
  }catch(error){const message=error instanceof Error?error.message:"Workflow load failed.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:502,headers:{"Cache-Control":"no-store"}});}
}

export async function POST(request:NextRequest){
  try{
    if(!allowedOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const user=await requireLocalSession(request);if(!user)return NextResponse.json({success:false,error:"Session expired."},{status:401});
    const body=await request.json() as Record<string,unknown>;const op=String(body.workflowOp||"").trim().toLowerCase();
    if(op!=="create"&&op!=="update")return NextResponse.json({success:false,error:"Unsupported workflow operation."},{status:400});
    const id=String(body.id||body.Task_ID||"").trim();
    const data=await handleLandviewDataAction(op==="create"?"createErpRecord":"updateErpRecord",{module:"tasks",...(op==="update"?{id}:{}),...body},user);
    return NextResponse.json({success:true,data},{status:200,headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase","X-Landview-Module":"workflow"}});
  }catch(error){const message=error instanceof Error?error.message:"Workflow save failed.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:502,headers:{"Cache-Control":"no-store"}});}
}
