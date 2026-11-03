import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { getManagementAlertsState, updateManagementSettings, acknowledgeWorkloadAlert, processManagementNotifications } from "@/lib/todo-management-notifications";
import { acknowledgeTodoEscalation, processTodoEscalations } from "@/lib/todo-workload";
import { recordAuditEvent } from "@/lib/audit-log";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
type Row=Record<string,any>;
function text(v:unknown,max=650){return String(v??"").trim().slice(0,max);}
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});}
function statusFor(message:string){return /authentication|session/i.test(message)?401:/access denied/i.test(message)?403:/already|changed|conflict/i.test(message)?409:/not found|recipient|invalid|must be|limit|points|requires|configuration/i.test(message)?400:500;}
async function management(request:NextRequest) {
  const actor=await requireLocalSession(request) as Row|null;
  if(!actor)throw new Error("Authentication required.");
  if(!["admin","manager"].includes(roleOf(actor)))throw new Error("Access denied.");
  return actor;
}
function sameOrigin(request:NextRequest){
  const origin=request.headers.get("origin");
  if(!origin)return process.env.NODE_ENV!=="production"||request.headers.get("sec-fetch-site")==="same-origin";
  try{const host=new URL(origin).hostname.toLowerCase();return host===request.nextUrl.hostname.toLowerCase()||host==="app.landview.com.bd"||host==="localhost"||host==="127.0.0.1";}catch{return false;}
}
export async function GET(request:NextRequest){
  try{await management(request);return json({success:true,data:await getManagementAlertsState()});}
  catch(e){const message=text(e instanceof Error?e.message:e);return json({success:false,error:message},statusFor(message));}
}
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return json({success:false,error:"Invalid request origin."},403);
  let actor:Row|null=null,action="";
  try{
    actor=await management(request);
    const input=await request.json().catch(()=>({})) as Row;
    action=text(input.action,60).toLowerCase();
    if(action==="settings"){
      const updated=await updateManagementSettings(input.settings||{},actor,request);
      return json({success:true,data:updated});
    }
    if(action==="acknowledge"){
      const updated=await acknowledgeWorkloadAlert(text(input.id,80),actor,request);
      return json({success:true,data:updated});
    }
    if(action==="acknowledge_escalation"||action==="reopen_escalation"){
      const updated=await acknowledgeTodoEscalation(text(input.id,80),action==="acknowledge_escalation"?"acknowledge":"reopen",actor,request);
      return json({success:true,data:updated});
    }
    if(action==="scan"){
      const escalations=await processTodoEscalations();
      const notifications=await processManagementNotifications();
      await recordAuditEvent({user:actor,request,action:"todo_management_notification_manual_scan",entityType:"todo_management",
        entityId:"management",after:{escalations,notifications},source:"todo-management-alerts"}).catch(()=>undefined);
      return json({success:true,data:{escalations,notifications}});
    }
    throw new Error("Unsupported management notification action.");
  }catch(e){
    const message=text(e instanceof Error?e.message:e);
    if(actor)await recordAuditEvent({user:actor,request,action:"todo_management_notification_action",entityType:"todo_management",entityId:"management",outcome:"failure",details:{action,error:message},source:"todo-management-alerts"}).catch(()=>undefined);
    return json({success:false,error:message},statusFor(message));
  }
}
