export type IntelligenceTask = {
  todoCode:string; title:string; status:string; priority:string;
  dueDate?:string; dueTime?:string; createdAt?:string; completedAt?:string;
  assignedEmployeeId?:string; assignedTo?:string; employeeName?:string;
  projectCode?:string; proposalCode?:string; dependencyBlocker?:string;
  reviewState?:string; reviewChangedAt?:string; estimatedMinutes?:number|null;
  deliveryStep?:boolean; workflowMissing?:boolean; workflowMismatch?:boolean;
};
export type IntelligenceEmployee = {id:string;code:string;name:string;status:string};
export type IntelligenceData={items:IntelligenceTask[];employees:IntelligenceEmployee[];totalTasks:number;truncated:boolean;refreshedAt:string};
const DAY=86400000, DHAKA=21600000;
export function dayOf(ms:number){return new Date(ms+DHAKA).toISOString().slice(0,10);}
export function deadline(t:IntelligenceTask){
  if(!t.dueDate||!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate))return Infinity;
  const time=t.dueTime&&/^([01]\d|2[0-3]):[0-5]\d/.test(t.dueTime)?t.dueTime.slice(0,5)+":00":"23:59:59";
  const ms=Date.parse(t.dueDate+"T"+time+"+06:00");return Number.isFinite(ms)?ms:Infinity;
}
function estimate(t:IntelligenceTask){return typeof t.estimatedMinutes==="number"&&Number.isFinite(t.estimatedMinutes)&&t.estimatedMinutes>0?t.estimatedMinutes:0;}
function pending(t:IntelligenceTask){return t.status!=="Done";}
function inReview(t:IntelligenceTask){return t.reviewState==="submitted";}
function waiting(t:IntelligenceTask){return inReview(t)||t.reviewState==="approved";}
function clock(v?:string){const n=Date.parse(v||"");return Number.isFinite(n)?n:0;}
export function buildIntelligence(data:IntelligenceData,now:number,weeklyHours:number){
  const today=dayOf(now),start=Date.parse(today+"T00:00:00+06:00"),end=start+7*DAY,weekStart=start-7*DAY;
  const capacityMinutes=Math.max(0,Math.min(168,Number(weeklyHours)||0))*60;
  const open=data.items.filter(pending);
  const dueSoon=open.filter(t=>deadline(t)<end);
  const active=data.employees.filter(e=>e.status.toLowerCase()==="active");
  const activeIds=new Set(active.map(e=>e.id));
  const ownerMissing=(t:IntelligenceTask)=>!t.assignedEmployeeId||!activeIds.has(t.assignedEmployeeId);
  const overdue=open.filter(t=>deadline(t)<now);
  const blockers=open.filter(t=>Boolean(t.dependencyBlocker));
  const review=open.filter(inReview).sort((a,b)=>clock(a.reviewChangedAt)-clock(b.reviewChangedAt));
  const revisions=open.filter(t=>t.reviewState==="revision_requested");
  const critical=overdue.filter(t=>now-deadline(t)>=3*DAY);
  const workload=active.map(e=>{
    const tasks=open.filter(t=>t.assignedEmployeeId===e.id);
    const due=tasks.filter(t=>deadline(t)<end);
    const executable=due.filter(t=>!waiting(t)&&!t.dependencyBlocker&&!t.deliveryStep);
    const known=executable.reduce((a,t)=>a+estimate(t),0);
    const unknown=executable.filter(t=>!estimate(t)).length;
    return {id:e.id,code:e.code,name:e.name,open:tasks.length,overdue:tasks.filter(t=>deadline(t)<now).length,review:tasks.filter(inReview).length,blocked:tasks.filter(t=>t.dependencyBlocker).length,due:due.length,knownMinutes:known,unknown,capacityMinutes,overMinutes:Math.max(0,known-capacityMinutes)};
  }).sort((a,b)=>b.overMinutes-a.overMinutes||b.knownMinutes-a.knownMinutes||b.overdue-a.overdue||a.code.localeCompare(b.code));
  const groups=new Map<string,{code:string;open:number;overdue:number;blocked:number;review:number;unassigned:number;delivery:number;risk:number}>();
  for(const t of open){
    const code=t.projectCode||t.proposalCode||"Office";
    const group=groups.get(code)||{code,open:0,overdue:0,blocked:0,review:0,unassigned:0,delivery:0,risk:0};
    group.open++;if(deadline(t)<now)group.overdue++;if(t.dependencyBlocker)group.blocked++;if(inReview(t))group.review++;if(ownerMissing(t))group.unassigned++;if(t.deliveryStep)group.delivery++;
    if(deadline(t)<now||t.dependencyBlocker||inReview(t)||ownerMissing(t))group.risk++;
    groups.set(code,group);
  }
  const bottlenecks=[...groups.values()].filter(g=>g.risk>0).sort((a,b)=>b.risk-a.risk||b.overdue-a.overdue||a.code.localeCompare(b.code));
  const weekTasks=data.items.filter(t=>clock(t.createdAt)>=weekStart&&clock(t.createdAt)<start);
  const weekDone=data.items.filter(t=>t.status==="Done"&&clock(t.completedAt)>=weekStart&&clock(t.completedAt)<start);
  const dueCompleted=weekDone.filter(t=>Number.isFinite(deadline(t)));
  const onTime=dueCompleted.filter(t=>clock(t.completedAt)<=deadline(t)).length;
  const riskTasks=open.filter(t=>deadline(t)<now||t.dependencyBlocker||inReview(t)||ownerMissing(t)||t.reviewState==="revision_requested"||t.workflowMissing);
  riskTasks.sort((a,b)=>Number(deadline(b)<now)-Number(deadline(a)<now)||Number(b.priority==="Urgent")-Number(a.priority==="Urgent")||deadline(a)-deadline(b)||a.todoCode.localeCompare(b.todoCode));
  return {today,horizonEnd:dayOf(end-DAY),weeklyHours,metrics:{open:open.length,overdue:overdue.length,critical:critical.length,blocked:blockers.length,review:review.length,revisions:revisions.length,unassigned:open.filter(ownerMissing).length,dueSoon:dueSoon.length,overCapacity:workload.filter(w=>w.overMinutes>0).length},workload,bottlenecks,review,riskTasks,week:{from:dayOf(weekStart),to:dayOf(start-DAY),created:weekTasks.length,completed:weekDone.length,onTime,withDeadline:dueCompleted.length},truncated:data.truncated};
}
function csvCell(value:unknown){
  let text=String(value??"");
  if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function weeklyCsv(snapshot:ReturnType<typeof buildIntelligence>){
  const rows:unknown[][]=[
    ["LAND VIEW weekly work snapshot",snapshot.week.from,snapshot.week.to],
    ["Source coverage",snapshot.truncated?"Partial":"Loaded records"],
    ["Created",snapshot.week.created],["Completed",snapshot.week.completed],
    ["Completed by current deadline",snapshot.week.onTime],["Completed with a recorded deadline",snapshot.week.withDeadline],
    ["CURRENT backlog",snapshot.today],["Open",snapshot.metrics.open],["Overdue",snapshot.metrics.overdue],["Blocked",snapshot.metrics.blocked],["Awaiting review",snapshot.metrics.review],["Missing active owner",snapshot.metrics.unassigned],
    ["Scenario capacity (hours per person; next 7 calendar days)",snapshot.weeklyHours],
    ["Staff code","Employee","Open","Due or overdue","Actionable estimated hours","Actionable without estimate","Scenario excess hours"],
    ...snapshot.workload.map(w=>[w.code,w.name,w.open,w.due,w.knownMinutes/60,w.unknown,w.overMinutes/60]),
    ["Reference","Open","Overdue","Blocked","Awaiting review","Missing active owner"],
    ...snapshot.bottlenecks.map(g=>[g.code,g.open,g.overdue,g.blocked,g.review,g.unassigned]),
  ];return "\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
}
