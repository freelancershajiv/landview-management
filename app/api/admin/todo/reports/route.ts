import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { selectRows, insertRows, updateRows, deleteRows } from "@/lib/supabase-data";
import { normalizeReportFilters, buildTodoReport, reportOptions } from "@/lib/todo-reporting";
import { exportTodoXlsx, exportTodoPdf } from "@/lib/todo-report-export";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
type Row=Record<string,any>;
function text(v:unknown,max=200){return String(v??"").trim().slice(0,max);}
function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});}
function errStatus(message:string){return /authentication|sign in/i.test(message)?401:/access denied/i.test(message)?403:/invalid|too many|filter|not found|limit|name|unsupported|unknown|choose|date/i.test(message)?400:500;}
function sameOrigin(req:NextRequest){
  const origin=req.headers.get("origin");
  if(!origin)return process.env.NODE_ENV!=="production"||req.headers.get("sec-fetch-site")==="same-origin";
  try{return new URL(origin).origin===req.nextUrl.origin;}catch{return false;}
}
async function authenticate(req:NextRequest){
  const user=await requireLocalSession(req);
  if(!user)throw new Error("Authentication required.");
  const role=roleOf(user);
  if(!["admin","manager"].includes(role))throw new Error("Access denied.");
  const key=text(userIdOf(user),160);
  if(!key)throw new Error("Sign in with a named management account to use saved views.");
  return {user,ownerKey:role+":"+key};
}
function normalizeName(v:unknown) {
  const name=text(v,90).replace(/\s+/g," ").trim();
  if(!name||name.length>80)throw new Error("View name must be 1–80 characters.");
  return name;
}
async function ownedViews(ownerKey:string){
  const rows=await selectRows("todo_saved_views",{filters:{owner_key:ownerKey},order:"updated_at:desc",limit:40});
  return rows.map(r=>({id:r.id,name:r.name,filters:r.filters||{},createdAt:r.created_at,updatedAt:r.updated_at}));
}
export async function GET(req:NextRequest){
  try{
    const {ownerKey}=await authenticate(req);
    const [views,options]=await Promise.all([ownedViews(ownerKey),reportOptions()]);
    return json({success:true,data:{views,...options}});
  }catch(e){const message=text(e instanceof Error?e.message:e,700);return json({success:false,error:message},errStatus(message));}
}
export async function POST(req:NextRequest) {
  if(!sameOrigin(req))return json({success:false,error:"Invalid request origin."},403);
  try{
    const {user,ownerKey}=await authenticate(req);
    const input=await req.json().catch(()=>null) as Row|null;
    if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid report request.");
    const action=text(input.action,30).toLowerCase();
    if(action==="save"){
      const name=normalizeName(input.name);
      const filters=normalizeReportFilters(input.filters);
      const views=await selectRows("todo_saved_views",{filters:{owner_key:ownerKey},limit:40});
      const same=views.find(v=>text(v.name,80).toLowerCase()===name.toLowerCase());
      if(!same&&views.length>=25)throw new Error("You can save up to 25 views per account.");
      let row:Row;
      const now=new Date().toISOString();
      if(same){
        const result=await updateRows("todo_saved_views",{id:same.id,owner_key:ownerKey},{name,filters,updated_at:now});
        if(!result.length)throw new Error("Saved view was not updated.");
        row=result[0];
      }else{
        const result=await insertRows("todo_saved_views",{owner_key:ownerKey,name,filters,created_at:now,updated_at:now});
        row=result[0];
      }
      await recordAuditEvent({user,request:req,action:"todo_report_view_saved",entityType:"todo_saved_view",entityId:text(row?.id,80),after:{name},source:"todo-reports"}).catch(()=>undefined);
      return json({success:true,data:{id:row.id,name,filters}});
    }
    if(action==="delete"){
      const id=text(input.id,80);
      if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error("Invalid saved view.");
      const removed=await deleteRows("todo_saved_views",{id,owner_key:ownerKey});
      if(!removed.length)throw new Error("Saved view was not found.");
      await recordAuditEvent({user,request:req,action:"todo_report_view_deleted",entityType:"todo_saved_view",entityId:id,source:"todo-reports"}).catch(()=>undefined);
      return json({success:true,data:{removed:true,id}});
    }
    if(action==="preview"||action==="export"){
      const result=await buildTodoReport(input.filters);
      if(action==="preview")return json({success:true,data:{...result,rows:result.rows.slice(0,150),shown:Math.min(150,result.rows.length)}});
      const format=text(input.format,12).toLowerCase();
      if(format!=="xlsx"&&format!=="pdf")throw new Error("Choose Excel or PDF.");
      const bytes=format==="xlsx"?exportTodoXlsx(result):exportTodoPdf(result);
      const day=result.generatedAt.slice(0,10);
      const filename="LAND_VIEW_ToDo_Report_"+day+"."+format;
      await recordAuditEvent({user,request:req,action:"todo_report_export",entityType:"todo_report",entityId:format,after:{format,rows:result.stats.total},source:"todo-reports"}).catch(()=>undefined);
      return new Response(new Uint8Array(bytes),{
        status:200,
        headers:{
          "Content-Type":format==="xlsx"?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"application/pdf",
          "Content-Disposition":'attachment; filename="'+filename+'"',
          "Cache-Control":"private, no-store, max-age=0",
          "X-Content-Type-Options":"nosniff",
        },
      });
    }
    throw new Error("Unsupported report action.");
  }catch(e){const message=text(e instanceof Error?e.message:e,700);return json({success:false,error:message},errStatus(message));}
}
