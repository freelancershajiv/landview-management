import { selectRows, insertRows, updateRows } from "@/lib/supabase-data";
import { recordAuditEvent } from "@/lib/audit-log";

type Row = Record<string, any>;
type Level = 1 | 2;
const DAY = 86_400_000;
const LIMIT = 5000;
function text(v: unknown, limit=400) { return String(v ?? "").trim().slice(0,limit); }
function timestamp(v: unknown) { const parsed = Date.parse(text(v,100)); return Number.isFinite(parsed) ? parsed : 0; }
function dateKey(task: Row) {
  const day = text(task.due_date,20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const time = /^([01]\d|2[0-3]):([0-5]\d)/.test(text(task.due_time,16)) ? text(task.due_time,16).slice(0,5)+":00" : "23:59:59";
  return day + "T" + time + "+06:00";
}
function dueAt(task: Row) { return timestamp(dateKey(task)); }
function overdueDays(task: Row, now=Date.now()) {
  if (text(task.status)==="Done") return 0;
  const due=dueAt(task);
  return due && now>due ? (now-due)/DAY : 0;
}
function score(task: Row, now: number) {
  if (text(task.status)==="Done") return 0;
  let weight=1;
  if (text(task.status)==="In Progress") weight+=0.5;
  if (text(task.priority)==="High") weight+=1;
  if (text(task.priority)==="Urgent") weight+=2;
  const late=overdueDays(task,now);
  if(late>0) weight+=1.5+Math.min(2,late/3);
  else if (dueAt(task)>0 && dueAt(task)<now+DAY) weight+=0.5;
  return Math.round(weight*10)/10;
}
function serialDate(v: unknown) { return text(v,80); }
async function all(table:string, order="created_at:desc", limit=LIMIT) {
  const records:Row[]=[];
  while(records.length<limit) {
    const count=Math.min(1000,limit-records.length);
    const page=await selectRows(table,{order,limit:count,offset:records.length});
    records.push(...page);
    if(page.length<count) break;
  }
  return records;
}
async function context() {
  const [tasks,employees,escalations]=await Promise.all([
    all("todo_items","updated_at:desc"),
    all("employees","employee_code:asc",1000),
    all("todo_escalations","created_at:desc")
  ]);
  return {tasks,employees,escalations};
}
export async function getWorkloadDashboard() {
  const {tasks,employees,escalations}=await context();
  const now=Date.now();
  const active=employees.filter(e=>text(e.status).toLowerCase()==="active");
  const scores=new Map(active.map(e=>[text(e.id,80),{score:0,open:0,urgent:0,overdue:0,items:0}]));
  for(const task of tasks){
    const id=text(task.assigned_employee_id,80);
    const s=scores.get(id);if(!s)continue;
    s.items++;
    if(text(task.status)==="Done") continue;
    s.open++;s.score+=score(task,now);
    if(["High","Urgent"].includes(text(task.priority)))s.urgent++;
    if(overdueDays(task,now)>0)s.overdue++;
  }
  const workloads=active.map(e=>{
    const own=scores.get(text(e.id,80))!;
    return {
      id:text(e.id,80),code:text(e.employee_code,80),name:text(e.name,160),
      designation:text(e.designation,160),department:text(e.department,160),
      ...own,score:Math.round(own.score*10)/10
    };
  }).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
  const light=[...workloads].sort((a,b)=>a.score-b.score||a.open-b.open||a.code.localeCompare(b.code));
  const recommendations=tasks.filter(t=>text(t.status)!=="Done"&&
     (!text(t.assigned_employee_id,80)||
        ((scores.get(text(t.assigned_employee_id,80))?.score||0)>((light[0]?.score||0)+3))))
    .map(t=>{
      const current=text(t.assigned_employee_id,80);
      const alternative=light.find(w=>w.id!==current);
      const self=scores.get(current);
      if(!alternative) return null;
      if(current && (!self || self.score-alternative.score<3)) return null;
      const overdue=overdueDays(t,now);
      return {
        todoCode:text(t.todo_code,80),title:text(t.title,250),updatedAt:text(t.updated_at,80),
        priority:text(t.priority,50),projectCode:text(t.project_code,80),dueDate:text(t.due_date,20),
        dueTime:text(t.due_time,20),currentEmployeeId:current,
        assignedTo:text(t.assigned_to,220),
        suggestedEmployeeId:alternative.id,suggestedEmployeeName:alternative.code+" · "+alternative.name,
        suggestedScore:alternative.score,currentScore:self?.score||0,
        overdueDays:Math.floor(overdue),reason:current?"Workload gap ≥ 3 points":"No assigned employee"
      };
    }).filter(Boolean).sort((a,b)=>(b!.overdueDays-a!.overdueDays) || (a!.priority==="Urgent"?-1:1)).slice(0,60);

  const byCode=new Map(tasks.map(t=>[text(t.todo_code,80),t]));
  const queue=escalations.filter(e=>{
    if(!["open","acknowledged"].includes(text(e.status)))return false;
    const task=byCode.get(text(e.todo_code,80));
    if(!task||text(task.status)==="Done"||dateKey(task)!==text(e.deadline_key))return false;
    return overdueDays(task,now)>=(Number(e.level)===2?3:1);
  }).map(e=>{
    const task=byCode.get(text(e.todo_code,80))!;
    return {id:text(e.id,80),todoCode:text(e.todo_code,80),title:text(task.title,220),
      projectCode:text(task.project_code,80),level:Number(e.level) as Level,
      status:text(e.status),priority:text(task.priority,40),
      overdueHours:Math.floor(overdueDays(task,now)*24),
      assignedTo:text(task.assigned_to,170)||"Unassigned",
      dueAt:dateKey(task),acknowledgedAt:serialDate(e.acknowledged_at),
      acknowledgedBy:text(e.acknowledged_by,160),
      createdAt:serialDate(e.created_at)
    };
  }).sort((a,b)=>b.level-a.level||b.overdueHours-a.overdueHours);
  return {workloads,recommendations,escalations:queue,metrics:{
    activeEmployees:active.length,openTasks:tasks.filter(t=>text(t.status)!=="Done").length,
    unassigned:tasks.filter(t=>text(t.status)!=="Done"&&!text(t.assigned_employee_id,80)).length,
    needsAttention:queue.filter(e=>e.status==="open").length,
    critical:queue.filter(e=>e.status==="open"&&e.level===2).length,
  },refreshedAt:new Date().toISOString()};
}
export async function reassignTodoManagement(todoCode:string,employeeId:string,expectedUpdatedAt:string,actor:Row,request?:any) {
  const [todos,employees]=await Promise.all([
    selectRows("todo_items",{filters:{todo_code:todoCode},limit:1}),
    selectRows("employees",{filters:{id:employeeId},limit:1})
  ]);
  const todo=todos[0], employee=employees[0];
  if(!todo) throw new Error("To Do not found.");
  if(text(todo.status)==="Done") throw new Error("Completed To Dos cannot be reassigned.");
  if(!employee || text(employee.status).toLowerCase()!=="active") throw new Error("Select an active employee.");
  if(text(todo.assigned_employee_id,80)===employeeId)throw new Error("This employee is already assigned.");
  if(!expectedUpdatedAt||text(todo.updated_at,100)!==expectedUpdatedAt)throw new Error("Conflict: To Do changed. Refresh before reassigning.");
  const label=text(employee.employee_code,80)+" · "+text(employee.name,160);
  const before={assignedEmployeeId:todo.assigned_employee_id,assignedTo:todo.assigned_to};
  const update=await updateRows("todo_items",{id:todo.id,updated_at:todo.updated_at},{
    assigned_employee_id:employeeId,assigned_to:label,updated_at:new Date().toISOString(),
    reminder_sent_at:null,overdue_notified_at:null,notification_last_attempt_at:null,notification_last_error:null,
  });
  if(update.length!==1) throw new Error("Conflict: To Do changed during reassignment. Refresh and try again.");
  await recordAuditEvent({user:actor,request,action:"todo_workload_reassigned",entityType:"todo",
    entityId:todoCode,before,after:{assignedEmployeeId:employeeId,assignedTo:label},source:"todo-workload"});
  return {todoCode,assignedEmployeeId:employeeId,assignedTo:label};
}
export async function acknowledgeTodoEscalation(id:string,action:"acknowledge"|"reopen",actor:Row,request?:any) {
  const entries=await selectRows("todo_escalations",{filters:{id},limit:1});
  const row=entries[0];if(!row)throw new Error("Escalation not found.");
  const tasks=await selectRows("todo_items",{filters:{id:row.todo_id},limit:1});
  const todo=tasks[0];if(!todo||text(todo.status)==="Done"||dateKey(todo)!==text(row.deadline_key))throw new Error("This escalation is no longer active.");
  const state=action==="acknowledge"?"open":"acknowledged";
  if(text(row.status)!==state)throw new Error("Escalation has already changed. Refresh.");
  const name=text(actor.name||actor.Name||actor.username||actor.Username||actor.userId||"Management",200);
  const changes=action==="acknowledge"
    ? {status:"acknowledged",acknowledged_at:new Date().toISOString(),acknowledged_by:name,updated_at:new Date().toISOString()}
    : {status:"open",acknowledged_at:null,acknowledged_by:null,updated_at:new Date().toISOString()};
  const updated=await updateRows("todo_escalations",{id,status:state},changes);
  if(updated.length!==1)throw new Error("Escalation changed. Refresh.");
  await recordAuditEvent({user:actor,request,action:action==="acknowledge"?"todo_escalation_acknowledged":"todo_escalation_reopened",
    entityType:"todo",entityId:text(row.todo_code),after:{level:row.level,status:changes.status,acknowledgedBy:name},source:"todo-workload"});
  return updated[0];
}
export async function processTodoEscalations() {
  const {tasks,escalations}=await context();
  const now=Date.now();
  const taskMap=new Map(tasks.map(t=>[text(t.id,80),t]));
  let opened=0,resolved=0,skipped=0;
  const errors:string[]=[];
  const known=new Set(escalations.map(e=>[text(e.todo_id,80),text(e.deadline_key),String(e.level)].join("|")));
  for(const e of escalations){
    if(text(e.status)==="resolved")continue;
    const task=taskMap.get(text(e.todo_id,80));
    if(task && text(task.status)!=="Done" && dateKey(task)===text(e.deadline_key))continue;
    try {
      const rows=await updateRows("todo_escalations",{id:e.id,status:e.status},{
        status:"resolved",resolved_at:new Date().toISOString(),
        resolution_reason:task?(text(task.status)==="Done"?"completed":"deadline changed"):"task unavailable",
        updated_at:new Date().toISOString()});
      resolved+=rows.length;
    } catch(err){errors.push(text(err instanceof Error?err.message:err,400));}
  }
  for(const todo of tasks){
    if(text(todo.status)==="Done"||!text(todo.id))continue;
    const late=overdueDays(todo,now);
    if(late<1)continue;
    for(const level of [1,2] as const){
      if(late<(level===1?1:3))continue;
      const deadline=dateKey(todo);
      const key=[text(todo.id,80),deadline,String(level)].join("|");
      if(known.has(key)){skipped++;continue;}
      try {
        await insertRows("todo_escalations",{
          todo_id:todo.id,todo_code:todo.todo_code,deadline_key:deadline,level,status:"open"});
        known.add(key);opened++;
      } catch(err){
        const msg=text(err instanceof Error?err.message:err,400);
        if(/duplicate|unique|23505/i.test(msg)){skipped++;continue;}
        errors.push(msg);
      }
    }
  }
  return {scanned:tasks.length,opened,resolved,skipped,errors:errors.slice(0,10)};
}
