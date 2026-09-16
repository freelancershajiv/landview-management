import { NextRequest, NextResponse } from "next/server";
import { getPublicTeamForSeo } from "@/lib/public-team-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function hostAllowed(request: NextRequest) {
  const host=(request.headers.get("host")||"").split(":")[0].toLowerCase();
  if(["www.landview.com.bd","landview.com.bd","app.landview.com.bd","localhost","127.0.0.1"].includes(host))return true;
  if(process.env.VERCEL_ENV!=="production"&&host.endsWith(".vercel.app"))return true;
  const vercelHost=process.env.VERCEL_URL?.toLowerCase();
  return Boolean(vercelHost&&host===vercelHost);
}

export async function GET(request:NextRequest){
  try{
    if(!hostAllowed(request))return NextResponse.json({success:false,error:"Not found."},{status:404});
    const data=await getPublicTeamForSeo();
    return NextResponse.json({success:true,data},{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=300","X-Landview-Data":"supabase"}});
  }catch{
    return NextResponse.json({success:false,error:"Unable to load team."},{status:502});
  }
}
