import { NextRequest, NextResponse } from "next/server";
import { processTodoEscalations } from "@/lib/todo-workload";
import { processManagementNotifications } from "@/lib/todo-management-notifications";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
function authorized(request:NextRequest){
  const key=process.env.CRON_SECRET?.trim();
  return Boolean(key&&request.headers.get("authorization")==="Bearer "+key);
}
export async function GET(request:NextRequest){
  if(!authorized(request))return NextResponse.json({success:false,error:"Unauthorized."},{status:401});
  try{const escalations=await processTodoEscalations();const notifications=await processManagementNotifications();return NextResponse.json({success:true,data:{...escalations,notifications}},{headers:{"Cache-Control":"no-store"}});}
  catch(err){return NextResponse.json({success:false,error:err instanceof Error?err.message:"Escalation scan failed."},{status:500});}
}
