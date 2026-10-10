import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import { roleDefaultPermissions } from "@/lib/role-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
function clean(value: unknown, max = 4000) { return String(value ?? "").trim().replace(/\r\n?/g, "\n").slice(0, max); }
function sameOrigin(request: NextRequest) { const origin = request.headers.get("origin"); if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin"; try { return new URL(origin).host === request.nextUrl.host; } catch { return false; } }
async function requireUser(request:NextRequest){const user=await requireLocalSession(request) as Row|null;if(!user)throw new Error("Session expired.");return user;}
async function can(user:Row,permission:string){const role=roleOf(user);if(role==="admin")return true;if(role==="manager")return roleDefaultPermissions("manager")[permission]===true;const rows=await selectRows("app_permissions",{filters:{user_key:userIdOf(user),permission},order:"created_at:desc",limit:1});return Boolean(rows[0]&&String(rows[0].status||"").toLowerCase()==="active");}
async function requirePermission(user:Row,permission:string){if(!await can(user,permission))throw new Error(`Permission required: ${permission}`);}
function map(row:Row){return{key:row.template_key,type:row.recipient_type,label:row.label,subject:row.subject,position:row.default_position||"",statement:row.statement||"",needsPeriod:Boolean(row.needs_period),active:row.active!==false,updatedAt:row.updated_at||"",updatedBy:row.updated_by||""};}

export async function GET(request:NextRequest){
  try{const user=await requireUser(request);await requirePermission(user,"certificates.view");const rows=await selectRows("certificate_templates",{order:"recipient_type:asc,label:asc",limit:500});return NextResponse.json({success:true,data:{templates:rows.map(map)}},{headers:{"Cache-Control":"no-store, max-age=0"}});}
  catch(error:any){const message=error?.message||"Could not load certificate templates.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/permission/i.test(message)?403:500});}
}

export async function PATCH(request:NextRequest){
  try{
    if(!sameOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const user=await requireUser(request);await requirePermission(user,"certificates.process");
    const input=await request.json();const key=clean(input?.key,80).toLowerCase();if(!key)return NextResponse.json({success:false,error:"Template key is required."},{status:400});
    const current=(await selectRows("certificate_templates",{filters:{template_key:key},limit:1}))[0];if(!current)return NextResponse.json({success:false,error:"Certificate template not found."},{status:404});
    const label=clean(input?.label,120),subject=clean(input?.subject,160),position=clean(input?.position,140),statement=clean(input?.statement,4000);if(!label||!subject)return NextResponse.json({success:false,error:"Template label and subject are required."},{status:400});
    const now=new Date().toISOString();const rows=await updateRows("certificate_templates",{template_key:key},{label,subject,default_position:position,statement,active:input?.active!==false,updated_at:now,updated_by:userIdOf(user)});
    await insertRows("certificate_audit",{certificate_code:`TEMPLATE:${key}`,action:"template_updated",actor:userIdOf(user),details:{label,subject},created_at:now});
    return NextResponse.json({success:true,data:map(rows[0]||{...current,label,subject,default_position:position,statement,updated_at:now,updated_by:userIdOf(user)})},{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(error:any){const message=error?.message||"Could not update certificate template.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/permission/i.test(message)?403:500});}
}
