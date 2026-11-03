import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { getWorkloadDashboard, reassignTodoManagement, acknowledgeTodoEscalation, processTodoEscalations } from "@/lib/todo-workload";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
type Row=Record<string,any>;
function text(v:unknown,max=600){return String(v??"").trim().slice(0,max);}
function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});}
async function manager(request:NextRequest){
  const user=await requireLocalSession(request) as Row|null;
  if(!user)throw new Error("Authentication required.");
  if(!["admin","manager"].includes(roleOf(user)))throw new Error("Access denied.");
  return user;
}
function sameOrigin(request:NextRequest){
  const origin=request.headers.get("origin");
  if(!origin)return process.env.NODE_ENV!=="production"||request.headers.get("sec-fetch-site")==="same-origin";
  try{const url=new URL(origin);return url.origin===request.nextUrl.origin||url.hostname==="app.landview.com.bd"||url.hostname==="localhost"||url.hostname==="127.0.0.1";}catch{return false;}
}
function errorStatus(message:string){return /authentication/i.test(message)?401:/access denied/i.test(message)?403:/conflict|already changed/i.test(message)?409:/not found|active employee|already assigned|cannot be reassigned|no longer active|already changed|required/i.test(message)?400:500;}
export async function GET(request:NextRequest){
  try{await manager(request);return json({success:true,data:await getWorkloadDashboard()});}
  catch(err){const message=text(err instanceof Error?err.message:err);return json({success:false,error:message},errorStatus(message));}
}
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return json({success:false,error:"Invalid request origin."},403);
  let user:Row|null=null;
  let action="",todoCode="";
  try{
    user=await manager(request);
    const input=await request.json() as Row;
    action=text(input.action,50).toLowerCase();
    todoCode=text(input.todoCode,80);
    if(action==="reassign"){
      const employeeId=text(input.employeeId,80);
      const updated=await reassignTodoManagement(todoCode,employeeId,text(input.expectedUpdatedAt,100),user,request);
      return json({success:true,data:updated});
    }
    if(action==="acknowledge"||action==="reopen"){
      const updated=await acknowledgeTodoEscalation(text(input.id,80),action,user,request);
      return json({success:true,data:updated});
    }
    if(action==="scan"){
      const result=await processTodoEscalations();
      await recordAuditEvent({user,request,action:"todo_escalation_manual_scan",entityType:"todo_escalation",entityId:"management",after:result,source:"todo-workload"}).catch(()=>undefined);
      return json({success:true,data:result});
    }
    throw new Error("Unsupported workload action.");
  }catch(err){
    const message=text(err instanceof Error?err.message:err);
    if(user)await recordAuditEvent({user,request,action:"todo_workload_action",entityType:"todo",entityId:todoCode,outcome:"failure",
      details:{action,error:message},source:"todo-workload"}).catch(()=>undefined);
    return json({success:false,error:message},errorStatus(message));
  }
}
