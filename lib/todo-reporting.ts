import { selectRows, supabaseGateway } from "@/lib/supabase-data";

type Row = Record<string, any>;
export type ReportFilters = {
  search: string; status: string; priority: string; employeeId: string;
  referenceType: string; projectCode: string; workflow: string; deadline: string;
  dueFrom: string; dueTo: string; createdFrom: string; createdTo: string;
  sort: string;
};
export type ReportRow = {
  code: string; title: string; status: string; priority: string;
  employee: string; employeeId: string; reference: string; referenceType: string;
  projectCode: string; client: string; workflow: string; workflowStatus: string;
  dueDate: string; dueTime: string; createdAt: string; completedAt: string;
  overdueDays: number; description: string;
};

const VALUES = {
  status: new Set(["All", "To Do", "In Progress", "Done"]),
  priority: new Set(["All", "Low", "Normal", "High", "Urgent"]),
  employeeId: null,
  referenceType: new Set(["All", "None", "Project", "Proposal"]),
  workflow: new Set(["All", "Linked", "Unlinked"]),
  deadline: new Set(["All", "Overdue", "Due Today", "Next 7 Days", "No Deadline"]),
  sort: new Set(["Due Date", "Newest", "Oldest", "Priority", "Employee"]),
};
const PRIORITY: Record<string,number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const LIMIT = 6000;
const PAGE = 1000;
function text(value:unknown,max=320) { return String(value ?? "").trim().slice(0,max); }
function date(value:unknown) {
  const valueText = text(value,20);
  if (!valueText) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText)) throw new Error("Invalid filter date.");
  const t=Date.parse(valueText+"T00:00:00Z");
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==valueText) throw new Error("Invalid filter date.");
  return valueText;
}
export function normalizeReportFilters(input:unknown):ReportFilters {
  const a = input && typeof input === "object" && !Array.isArray(input) ? input as Row : {};
  const select=(key:keyof typeof VALUES, fallback:string) => {
    const x=text(a[key],100);
    const valid=VALUES[key] as Set<string> | null;
    return valid?.has(x) ? x : fallback;
  };
  const filters:ReportFilters = {
    search:text(a.search,160),
    status:select("status","All"),
    priority:select("priority","All"),
    employeeId:text(a.employeeId,80),
    referenceType:select("referenceType","All"),
    projectCode:text(a.projectCode,80).toUpperCase(),
    workflow:select("workflow","All"),
    deadline:select("deadline","All"),
    dueFrom:date(a.dueFrom),
    dueTo:date(a.dueTo),
    createdFrom:date(a.createdFrom),
    createdTo:date(a.createdTo),
    sort:select("sort","Due Date"),
  };
  if (filters.dueFrom && filters.dueTo && filters.dueFrom>filters.dueTo) throw new Error("Due date range is reversed.");
  if (filters.createdFrom && filters.createdTo && filters.createdFrom>filters.createdTo) throw new Error("Created date range is reversed.");
  if (filters.employeeId && filters.employeeId!=="unassigned" && !/^[a-f0-9-]{36}$/i.test(filters.employeeId)) throw new Error("Invalid employee filter.");
  return filters;
}
const dhakaNow = () => new Date(Date.now()+6*60*60*1000).toISOString().slice(0,10);
function afterDays(day:string,days:number){return new Date(Date.parse(day+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);}
function dueTimestamp(row:ReportRow){
  if(!row.dueDate)return 0;
  const time=/^([01]\d|2[0-3]):[0-5]\d/.test(row.dueTime)?row.dueTime.slice(0,5)+":00":"23:59:59";
  return Date.parse(row.dueDate+"T"+time+"+06:00")||0;
}
async function paged(table:string,select:string,order:string,max=LIMIT){
  const result:Row[]=[];
  while(result.length<max){
    const n=Math.min(PAGE,max-result.length);
    const batch=await selectRows(table,{select,order,limit:n,offset:result.length});
    result.push(...batch);
    if(batch.length<n)break;
  }
  return result;
}
export async function reportOptions() {
  const employees=await paged("employees","id,employee_code,name,status","employee_code:asc",500);
  return { employees:employees.filter(e=>text(e.status).toLowerCase()==="active").map(e=>({
    id:text(e.id,80),code:text(e.employee_code,80),name:text(e.name,160),
  })) };
}
export async function buildTodoReport(filtersInput:unknown) {
  const filters=normalizeReportFilters(filtersInput);
  const [taskTotal,tasks,staff,workflows,projects,proposals]=await Promise.all([
    supabaseGateway("countRows",{table:"todo_items"}) as Promise<{count:number}>,
    paged("todo_items","*", "created_at:desc"),
    paged("employees","id,employee_code,name","employee_code:asc",500),
    paged("project_service_workflows","id,service_name,status","updated_at:desc",6000),
    paged("projects","project_code,client_name_snapshot,project_name","project_code:desc",6000),
    paged("proposals","proposal_code,client_name,project_title","updated_at:desc",5000),
  ]);
  const count=Number(taskTotal.count||0);
  if(count>LIMIT)throw new Error("Too many To Dos for one report. Contact management to create a paginated archive.");
  const staffMap=new Map(staff.map(x=>[text(x.id,80),x]));
  const wfMap=new Map(workflows.map(x=>[text(x.id,80),x]));
  const projectMap=new Map(projects.map(x=>[text(x.project_code,80),x]));
  const proposalMap=new Map(proposals.map(x=>[text(x.proposal_code,100),x]));
  const today=dhakaNow(),seven=afterDays(today,7),now=Date.now();
  const rows:ReportRow[] = tasks.map(t=>{
    const code=text(t.project_code,80);
    const proposal=text(t.proposal_code,100);
    const staff=staffMap.get(text(t.assigned_employee_id,80));
    const wf=wfMap.get(text(t.workflow_id,80));
    const project=projectMap.get(code);
    const prop=proposalMap.get(proposal);
    const refType=text(t.reference_type,30)||(code?"Project":proposal?"Proposal":"None");
    const dueDate=text(t.due_date,20),dueTime=text(t.due_time,12);
    const due=dueDate?Date.parse(dueDate+"T"+(/^\d{2}:\d{2}/.test(dueTime)?dueTime.slice(0,5)+":00":"23:59:59")+"+06:00"):0;
    const late=text(t.status,40)!=="Done"&&due>0&&due<now?Math.ceil((now-due)/86400000):0;
    return {
      code:text(t.todo_code,90),title:text(t.title,280),status:text(t.status,40),
      priority:text(t.priority,30),employee:staff?text(staff.employee_code,40)+" · "+text(staff.name,160):text(t.assigned_to,180)||"Unassigned",
      employeeId:text(t.assigned_employee_id,80),reference:code||proposal||"General",
      referenceType:refType,projectCode:code,client:code?text(project?.client_name_snapshot||project?.project_name,180):text(prop?.client_name||prop?.project_title,180),
      workflow:text(wf?.service_name,160),workflowStatus:text(wf?.status,70),
      dueDate,dueTime,createdAt:text(t.created_at,80),completedAt:text(t.completed_at,80),
      overdueDays:late,description:text(t.description,1000),
    };
  }).filter(r=>{
    if(filters.status!=="All"&&r.status!==filters.status)return false;
    if(filters.priority!=="All"&&r.priority!==filters.priority)return false;
    if(filters.employeeId&&!(filters.employeeId==="unassigned"?!r.employeeId:r.employeeId===filters.employeeId))return false;
    if(filters.referenceType!=="All"&&r.referenceType!==filters.referenceType)return false;
    if(filters.projectCode&&!r.projectCode.toUpperCase().includes(filters.projectCode))return false;
    if(filters.workflow==="Linked"&&!r.workflow)return false;
    if(filters.workflow==="Unlinked"&&r.workflow)return false;
    if(filters.dueFrom&&(!r.dueDate||r.dueDate<filters.dueFrom))return false;
    if(filters.dueTo&&(!r.dueDate||r.dueDate>filters.dueTo))return false;
    const creationMs=Date.parse(r.createdAt);
    const created=Number.isFinite(creationMs)?new Date(creationMs+6*60*60*1000).toISOString().slice(0,10):"";
    if(filters.createdFrom&&created<filters.createdFrom)return false;
    if(filters.createdTo&&created>filters.createdTo)return false;
    if(filters.deadline==="Overdue"&&!(r.overdueDays>0))return false;
    if(filters.deadline==="Due Today"&&!(r.status!=="Done"&&r.dueDate===today))return false;
    if(filters.deadline==="Next 7 Days"&&!(r.status!=="Done"&&r.dueDate>=today&&r.dueDate<=seven))return false;
    if(filters.deadline==="No Deadline"&&r.dueDate)return false;
    if(filters.search) {
      const haystack=[r.code,r.title,r.description,r.employee,r.reference,r.client,r.workflow,r.workflowStatus].join(" ").toLowerCase();
      if(!haystack.includes(filters.search.toLowerCase()))return false;
    }
    return true;
  });
  rows.sort((a,b)=>{
    switch(filters.sort) {
      case "Newest": return b.createdAt.localeCompare(a.createdAt);
      case "Oldest": return a.createdAt.localeCompare(b.createdAt);
      case "Priority": return (PRIORITY[a.priority]??4)-(PRIORITY[b.priority]??4)||a.code.localeCompare(b.code);
      case "Employee": return a.employee.localeCompare(b.employee)||a.code.localeCompare(b.code);
      default: return (dueTimestamp(a)||Number.MAX_SAFE_INTEGER)-(dueTimestamp(b)||Number.MAX_SAFE_INTEGER)||a.code.localeCompare(b.code);
    }
  });
  const stats={
    total:rows.length,
    open:rows.filter(r=>r.status!=="Done").length,
    inProgress:rows.filter(r=>r.status==="In Progress").length,
    done:rows.filter(r=>r.status==="Done").length,
    overdue:rows.filter(r=>r.overdueDays>0).length,
    dueToday:rows.filter(r=>r.status!=="Done"&&r.dueDate===today).length,
  };
  return {rows,stats,filters,generatedAt:new Date().toISOString()};
}
