import { NextRequest, NextResponse } from "next/server";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { getPublicProjectPage } from "@/lib/public-project-pagination";

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

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export async function GET(request:NextRequest){
  try{
    if(!hostAllowed(request))return NextResponse.json({success:false,error:"Not found."},{status:404});

    const params = request.nextUrl.searchParams;
    const paginated = params.has("offset") || params.has("limit") || params.has("q") || params.has("category");

    if (!paginated) {
      const data=await getPublicProjectsForSeo();
      return NextResponse.json({success:true,data},{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=300","X-Landview-Data":"supabase"}});
    }

    const page = await getPublicProjectPage({
      offset: Math.max(0, numberParam(params.get("offset"), 0)),
      limit: Math.min(24, Math.max(1, numberParam(params.get("limit"), 12))),
      query: params.get("q") || "",
      category: params.get("category") || "",
    });

    return NextResponse.json({
      success:true,
      data:page.data,
      pagination:{
        offset:page.offset,
        limit:page.limit,
        total:page.total,
        hasMore:page.hasMore,
      },
      meta:{
        publishedTotal:page.publishedTotal,
        categories:page.categories,
        hasMappedProjects:page.hasMappedProjects,
      },
    },{headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=300","X-Landview-Data":"supabase"}});
  }catch{
    return NextResponse.json({success:false,error:"Unable to load public projects."},{status:502});
  }
}
