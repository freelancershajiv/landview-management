import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeHost(value:string|null|undefined){return String(value||"").split(":")[0].trim().toLowerCase();}
function trustedVercelHosts(){return new Set([process.env.VERCEL_URL,process.env.VERCEL_BRANCH_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL].map(normalizeHost).filter(Boolean));}
function allowedHost(host:string){return host==="app.landview.com.bd"||host==="localhost"||host==="127.0.0.1"||trustedVercelHosts().has(host);}
function originAllowed(request:NextRequest){const origin=request.headers.get("origin");if(!origin)return process.env.NODE_ENV!=="production"||request.headers.get("sec-fetch-site")==="same-origin";try{return allowedHost(normalizeHost(new URL(origin).hostname));}catch{return false;}}

export async function POST(request:NextRequest){
  try{
    const host=normalizeHost(request.headers.get("host"));
    if(!allowedHost(host)||!originAllowed(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const user=await requireLocalSession(request);
    if(!user)return NextResponse.json({success:false,error:"Your session has expired. Sign in again to change public visibility."},{status:401});
    const role=roleOf(user);
    if(role!=="admin"&&role!=="manager")return NextResponse.json({success:false,error:"Admin or Manager access is required."},{status:403});
    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    const projectId=normalizeProjectCode(body.projectId);
    const publicDisplay=body.publicDisplay===true;
    if(!projectId)return NextResponse.json({success:false,error:"Project ID is required."},{status:400});
    const existing=await selectRows("projects",{filters:{project_code:projectId},limit:1});
    if(!existing[0])return NextResponse.json({success:false,error:`${projectId} is not registered in Supabase. Create or sync the project first.`},{status:404});
    const rows=await updateRows("projects",{project_code:projectId},{public_display:publicDisplay,updated_at:new Date().toISOString()});
    return NextResponse.json({success:true,data:{projectId,Public_Display:publicDisplay,project:rows[0]||null}},{headers:{"Cache-Control":"no-store","X-Landview-Data":"supabase"}});
  }catch(error:any){return NextResponse.json({success:false,error:error?.message||"Could not update public visibility."},{status:502,headers:{"Cache-Control":"no-store"}});}
}
