import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET } from "../landview/route";
import { handleLandviewDataAction } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowedOrigin(request: NextRequest) {
  const origin=request.headers.get("origin");
  if(!origin)return process.env.NODE_ENV!=="production"||request.headers.get("sec-fetch-site")==="same-origin";
  try{const host=new URL(origin).hostname.toLowerCase();return host==="app.landview.com.bd"||host==="localhost"||host==="127.0.0.1"||host.endsWith(".vercel.app");}catch{return false;}
}
async function sessionUser(request:NextRequest){const url=new URL(request.url);url.pathname="/api/landview";url.search="?action=getSession";const response=await legacyGET(new NextRequest(url,{method:"GET",headers:new Headers(request.headers)}));const json=await response.json().catch(()=>null);return response.ok&&json?.success&&json?.data?.authenticated?json.data.user as Record<string,unknown>:null;}

export async function POST(request:NextRequest){
  try{
    if(!allowedOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const user=await sessionUser(request);if(!user)return NextResponse.json({success:false,error:"Session expired."},{status:401});
    const body=await request.json() as Record<string,unknown>;const op=String(body.workflowOp||"").trim().toLowerCase();
    if(op!=="create"&&op!=="update")return NextResponse.json({success:false,error:"Unsupported workflow operation."},{status:400});
    const id=String(body.id||body.Task_ID||"").trim();
    const data=await handleLandviewDataAction(op==="create"?"createErpRecord":"updateErpRecord",{module:"tasks",...(op==="update"?{id}:{}),...body},user);
    return NextResponse.json({success:true,data},{status:200,headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
  }catch(error){const message=error instanceof Error?error.message:"Workflow save failed.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:502,headers:{"Cache-Control":"no-store"}});}
}
