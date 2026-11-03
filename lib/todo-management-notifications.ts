import { selectRows, insertRows, updateRows } from "@/lib/supabase-data";
import { getWorkloadDashboard } from "@/lib/todo-workload";
import { recordAuditEvent } from "@/lib/audit-log";

type Row = Record<string, any>;
export type ManagementSettings = {
  settings_key: string;
  max_open_tasks: number;
  max_workload_points: number;
  whatsapp_critical_enabled: boolean;
  whatsapp_recipient_employee_id: string | null;
  whatsapp_enabled_at: string | null;
  updated_at: string;
};
function text(v: unknown, max=400) { return String(v??"").trim().slice(0,max); }
function dateMs(v: unknown) { const ms=Date.parse(text(v,100)); return Number.isFinite(ms)?ms:0; }
function phoneToJid(input: unknown) {
  let p=text(input,100).replace(/\D/g,"");
  if(p.startsWith("880")&&p.length===13)p="0"+p.slice(3);
  else if(p.startsWith("88")&&p.length===13)p=p.slice(2);
  if(p.length===10&&p.startsWith("1"))p="0"+p;
  return /^01\d{9}$/.test(p)?"88"+p+"@s.whatsapp.net":"";
}
function settingsFrom(row:Row):ManagementSettings {
  return {
    settings_key:"management",
    max_open_tasks:Math.max(1,Number(row.max_open_tasks)||8),
    max_workload_points:Math.max(1,Number(row.max_workload_points)||15),
    whatsapp_critical_enabled:row.whatsapp_critical_enabled===true,
    whatsapp_recipient_employee_id:text(row.whatsapp_recipient_employee_id,80)||null,
    whatsapp_enabled_at:row.whatsapp_enabled_at?text(row.whatsapp_enabled_at,80):null,
    updated_at:text(row.updated_at,80),
  };
}
export async function getManagementSettings() {
  const rows=await selectRows("todo_management_settings",{filters:{settings_key:"management"},limit:1});
  if(!rows.length)throw new Error("Management notification settings were not initialized.");
  return settingsFrom(rows[0]);
}
export async function updateManagementSettings(input:Row,actor:Row,request?:any) {
  const openLimit=Number(input.maxOpenTasks);
  const pointLimit=Number(input.maxWorkloadPoints);
  if(!Number.isInteger(openLimit)||openLimit<1||openLimit>100)throw new Error("Open task limit must be 1–100.");
  if(!Number.isFinite(pointLimit)||pointLimit<1||pointLimit>500)throw new Error("Workload points limit must be 1–500.");
  const rounded=Math.round(pointLimit*10)/10;
  const enabled=input.whatsappCriticalEnabled===true;
  const recipientId=text(input.whatsappRecipientEmployeeId,80);
  if(enabled&&!recipientId)throw new Error("Select a WhatsApp alert recipient before enabling notifications.");
  if(enabled) {
    const employees=await selectRows("employees",{filters:{id:recipientId},limit:1});
    const recipient=employees[0];
    if(!recipient||text(recipient.status).toLowerCase()!=="active")throw new Error("The WhatsApp recipient must be an active employee.");
    if(!phoneToJid(recipient.phone_number))throw new Error("The WhatsApp recipient needs a valid Bangladesh mobile number.");
    if(!process.env.WHATSAPP_BOT_API_TOKEN||!process.env.WHATSAPP_BOT_URL)throw new Error("LAND VIEW WhatsApp service is not configured.");
  }
  const prior=await getManagementSettings();
  const switchingOn=enabled&&(!prior.whatsapp_critical_enabled||prior.whatsapp_recipient_employee_id!==recipientId);
  const now=new Date().toISOString();
  const changes:Row={
    max_open_tasks:openLimit,
    max_workload_points:rounded,
    whatsapp_critical_enabled:enabled,
    whatsapp_recipient_employee_id:recipientId||null,
    whatsapp_enabled_at:enabled?(switchingOn?now:prior.whatsapp_enabled_at||now):null,
    updated_at:now,
  };
  const updated=await updateRows("todo_management_settings",{settings_key:"management"},changes);
  if(updated.length!==1)throw new Error("Could not save management notification settings.");
  await recordAuditEvent({user:actor,request,action:"todo_management_settings_updated",entityType:"todo_management_settings",
    entityId:"management",before:{maxOpenTasks:prior.max_open_tasks,maxWorkloadPoints:prior.max_workload_points,whatsappEnabled:prior.whatsapp_critical_enabled,recipientId:prior.whatsapp_recipient_employee_id},
    after:{maxOpenTasks:openLimit,maxWorkloadPoints:rounded,whatsappEnabled:enabled,recipientId:recipientId||null},source:"todo-management-alerts"});
  return settingsFrom(updated[0]);
}
export async function getManagementAlertsState() {
  const [settings,dashboard,alerts,staff,delivery]=await Promise.all([
    getManagementSettings(),
    getWorkloadDashboard(),
    selectRows("todo_management_alerts",{order:"created_at:desc",limit:1000}),
    selectRows("employees",{order:"employee_code:asc",limit:500}),
    selectRows("whatsapp_client_outbox",{filters:{source:"todo-management"},order:"created_at:desc",limit:100}),
  ]);
  const names=new Map(staff.map(e=>[text(e.id,80),{name:text(e.name,160),code:text(e.employee_code,80)}]));
  const overloaded=dashboard.workloads.filter(w=>w.open>settings.max_open_tasks||w.score>settings.max_workload_points)
    .map(w=>({...w,overOpen:Math.max(0,w.open-settings.max_open_tasks),
      overPoints:Math.max(0,Math.round((w.score-settings.max_workload_points)*10)/10)}));
  const escalation=dashboard.escalations.map(e=>({
    id:e.id,todoCode:e.todoCode,title:e.title,level:e.level,status:e.status,overdueHours:e.overdueHours,assignedTo:e.assignedTo,createdAt:e.createdAt,
  }));
  const managers=staff.filter(e=>text(e.status).toLowerCase()==="active")
    .map(e=>({id:text(e.id,80),code:text(e.employee_code,80),name:text(e.name,160),phoneConfigured:Boolean(phoneToJid(e.phone_number))}));
  return {
    settings,overloaded,escalation,managers,
    alerts:alerts.slice(0,150).map(row=>({
      id:text(row.id,80),employeeId:text(row.employee_id,80),code:names.get(text(row.employee_id,80))?.code||"",
      employeeName:names.get(text(row.employee_id,80))?.name||"Employee unavailable",
      status:text(row.status,50),openCount:Number(row.open_count||0),points:Number(row.workload_points||0),
      maxOpen:Number(row.max_open_tasks||0),maxPoints:Number(row.max_workload_points||0),
      acknowledgedBy:text(row.acknowledged_by,160),createdAt:row.created_at,updatedAt:row.updated_at,
    })),
    deliveries:delivery.slice(0,40).map(row=>({
      id:text(row.id,80),status:text(row.status,50),source:text(row.source,50),createdAt:row.created_at,
      sentAt:row.sent_at,lastError:text(row.last_error,250),dedupeKey:text(row.dedupe_key,240),
    })),
    refreshedAt:new Date().toISOString(),
  };
}
export async function acknowledgeWorkloadAlert(id:string,actor:Row,request?:any) {
  const rows=await selectRows("todo_management_alerts",{filters:{id},limit:1});
  const row=rows[0];
  if(!row)throw new Error("Workload alert not found.");
  if(text(row.status)!=="unread")throw new Error("Alert was already acknowledged or resolved.");
  const name=text(actor.name||actor.Name||actor.username||actor.Username||actor.userId||"Management",160);
  const result=await updateRows("todo_management_alerts",{id,status:"unread"},{
    status:"acknowledged",acknowledged_at:new Date().toISOString(),acknowledged_by:name,updated_at:new Date().toISOString(),
  });
  if(result.length!==1)throw new Error("Alert has changed. Refresh and try again.");
  await recordAuditEvent({user:actor,request,action:"todo_workload_alert_acknowledged",entityType:"todo_management_alert",
    entityId:id,after:{employeeId:row.employee_id,acknowledgedBy:name},source:"todo-management-alerts"});
  return result[0];
}
async function wakeClientWhatsAppBot() {
  const base=text(process.env.WHATSAPP_BOT_URL,1000).replace(/\/+$/,"");
  const token=text(process.env.WHATSAPP_BOT_API_TOKEN,500);
  if(!base||!token)return;
  try{
    await fetch(base+"/client/wake",{method:"POST",headers:{"x-land-view-bot-token":token},
      cache:"no-store",signal:AbortSignal.timeout(4000)});
  }catch{}
}
export async function processManagementNotifications() {
  const [settings,dashboard,existing]=await Promise.all([
    getManagementSettings(),getWorkloadDashboard(),
    selectRows("todo_management_alerts",{order:"created_at:desc",limit:3000}),
  ]);
  const active=new Map<string,Row>();
  for(const row of existing) if(["unread","acknowledged"].includes(text(row.status)))active.set(text(row.employee_id,80),row);
  let overloadOpened=0,overloadResolved=0,whatsappQueued=0,whatsappSkipped=0;
  const errors:string[]=[];
  const now=new Date().toISOString();
  const overloadedIds=new Set<string>();
  for(const person of dashboard.workloads){
    const breached=person.open>settings.max_open_tasks||person.score>settings.max_workload_points;
    if(!breached)continue;
    overloadedIds.add(person.id);
    if(active.has(person.id))continue;
    try{
      await insertRows("todo_management_alerts",{
        employee_id:person.id,status:"unread",open_count:person.open,workload_points:person.score,
        max_open_tasks:settings.max_open_tasks,max_workload_points:settings.max_workload_points,
        created_at:now,updated_at:now,
      });
      overloadOpened++;
    }catch(e){
      const message=text(e instanceof Error?e.message:e,400);
      if(!/23505|duplicate|unique/i.test(message))errors.push(message);
    }
  }
  for(const [id,row] of active) {
    if(overloadedIds.has(id))continue;
    try {
      const updated=await updateRows("todo_management_alerts",{id:row.id,status:row.status},{
        status:"resolved",resolved_at:now,updated_at:now,
      });
      overloadResolved+=updated.length;
    }catch(e){errors.push(text(e instanceof Error?e.message:e,400));}
  }
  if(settings.whatsapp_critical_enabled&&settings.whatsapp_recipient_employee_id&&settings.whatsapp_enabled_at) {
    const recipients=await selectRows("employees",{filters:{id:settings.whatsapp_recipient_employee_id},limit:1});
    const recipient=recipients[0];
    const jid=recipient&&text(recipient.status).toLowerCase()==="active"?phoneToJid(recipient.phone_number):"";
    if(!jid)errors.push("Configured WhatsApp alert recipient is unavailable or has an invalid phone.");
    else{
      const since=dateMs(settings.whatsapp_enabled_at);
      for(const esc of dashboard.escalations.filter(e=>e.level===2&&e.status==="open"&&dateMs(e.createdAt)>=since).slice(0,30)) {
        const dedupeKey=("todo-management-critical:"+esc.id+":"+settings.whatsapp_recipient_employee_id).slice(0,240);
        try{
          const found=await selectRows("whatsapp_client_outbox",{filters:{dedupe_key:dedupeKey},limit:1});
          if(found.length){whatsappSkipped++;continue;}
          const lines=["🔴 *LAND VIEW — CRITICAL TO DO*","", "*Task:* "+text(esc.title,220),
            "*Code:* "+esc.todoCode,"*Overdue:* "+esc.overdueHours+" hours",
            "*Assigned:* "+text(esc.assignedTo,160),"*Project:* "+text(esc.projectCode||"General task",80),
            "","Management review required. Open LAND VIEW → To Do.","https://app.landview.com.bd/admin/todo","_LAND VIEW Architects & Engineers_"];
          await insertRows("whatsapp_client_outbox",{
            conversation_id:null,to_jid:jid,message:lines.join("\n").slice(0,4000),status:"pending",
            attempt_count:0,next_attempt_at:now,dedupe_key:dedupeKey,source:"todo-management",
            event_key:"todo.critical",priority:"critical",recipient_group:"management",
            template_key:"todo_critical",media_json:null,created_at:now,updated_at:now,
          });
          whatsappQueued++;
        }catch(e){
          const msg=text(e instanceof Error?e.message:e,500);
          if(/23505|duplicate|unique/i.test(msg))whatsappSkipped++;
          else errors.push("WhatsApp queue: "+msg);
        }
      }
    }
  }
  if(whatsappQueued>0)await wakeClientWhatsAppBot();
  return {scanned:dashboard.workloads.length,overloadOpened,overloadResolved,whatsappQueued,whatsappSkipped,errors:errors.slice(0,12)};
}
