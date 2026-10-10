import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { roleDefaultPermissions } from "@/lib/role-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
async function requireUser(request:NextRequest){const user=await requireLocalSession(request) as Row|null;if(!user)throw new Error("Session expired.");return user;}
async function can(user:Row,permission:string){const role=roleOf(user);if(role==="admin")return true;if(role==="manager")return roleDefaultPermissions("manager")[permission]===true;const rows=await selectRows("app_permissions",{filters:{user_key:userIdOf(user),permission},order:"created_at:desc",limit:1});return Boolean(rows[0]&&String(rows[0].status||"").toLowerCase()==="active");}
async function requirePermission(user:Row,permission:string){if(!await can(user,permission))throw new Error(`Permission required: ${permission}`);}

export async function GET(request:NextRequest){
  try{
    const user=await requireUser(request);await requirePermission(user,"certificates.view");
    const [auditRows,users]=await Promise.all([selectRows("certificate_audit",{order:"created_at:desc",limit:5000}),selectRows("app_users",{limit:5000})]);
    const names=new Map(users.map((u:Row)=>[String(u.user_key||""),String(u.full_name||u.username||u.employee_code||u.user_key||"")]));
    const entries=auditRows.map((row:Row)=>({id:row.id||"",certificateId:row.certificate_code||"",action:row.action||"",actor:row.actor||"",actorName:names.get(String(row.actor||""))||row.actor||"System",details:row.details||{},createdAt:row.created_at||""}));
    return NextResponse.json({success:true,data:{entries}},{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(error:any){const message=error?.message||"Could not load certificate audit history.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/permission/i.test(message)?403:500});}
}
