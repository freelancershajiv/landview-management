import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { deleteRows, insertRows, normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { deleteR2Object, readSiteVisitMediaFromR2, uploadProjectReferenceImage } from "@/lib/cloudflare-r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Row = Record<string, any>;
const CATEGORIES = new Set(["Exterior","Interior","Floor Plan","Elevation","Structural","Materials","Other"]);
const clean = (v: unknown, max=300) => String(v ?? "").trim().slice(0,max);
function json(data: unknown, status=200) { return NextResponse.json(data,{status,headers:{"Cache-Control":"no-store, max-age=0"}}); }
function sameOrigin(request: NextRequest) {
  const origin=request.headers.get("origin");
  if(!origin) return process.env.NODE_ENV!=="production" || request.headers.get("sec-fetch-site")==="same-origin";
  try { return new URL(origin).host===request.nextUrl.host; } catch { return false; }
}
async function actor(request: NextRequest, write=false) {
  const user=await requireLocalSession(request) as Row|null;
  if(!user) throw new Error("Session expired.");
  const role=roleOf(user);
  if(write ? !["admin","manager"].includes(role) : !["admin","manager"].includes(role)) throw new Error("Only Admin or Manager can access project reference images.");
  return user;
}
async function projectByCode(value: unknown) {
  const code=normalizeProjectCode(clean(value,80));
  if(!code) throw new Error("Project ID is required.");
  const rows=await selectRows("projects",{filters:{project_code:code},limit:1});
  if(!rows[0]) throw new Error("Project not found.");
  return rows[0] as Row;
}
function fileId(key: string) { return `r2:${key}`; }

export async function GET(request: NextRequest) {
  try {
    await actor(request);
    const mediaId=clean(request.nextUrl.searchParams.get("mediaId"),80);
    if(mediaId) {
      const rows=await selectRows("project_reference_images",{filters:{id:mediaId},limit:1});
      const row=rows[0] as Row|undefined;
      if(!row) return json({success:false,error:"Reference image not found."},404);
      const media=await readSiteVisitMediaFromR2(fileId(String(row.object_key)));
      return new Response(new Uint8Array(media.bytes),{headers:{"Content-Type":media.contentType,"Cache-Control":"private, max-age=300","Content-Disposition":"inline"}});
    }
    const project=await projectByCode(request.nextUrl.searchParams.get("projectId"));
    const rows=await selectRows("project_reference_images",{filters:{project_id:project.id},order:"created_at:desc",limit:500});
    return json({success:true,data:rows.map((row:Row)=>({...row,media_url:`/api/admin/project-reference-images?mediaId=${encodeURIComponent(row.id)}`}))});
  } catch(error:any) {
    const message=clean(error?.message||"Could not load reference images.",1000);
    return json({success:false,error:message},/session/i.test(message)?401:/permission|access|admin|manager/i.test(message)?403:400);
  }
}

export async function POST(request: NextRequest) {
  if(!sameOrigin(request)) return json({success:false,error:"Invalid request origin."},403);
  try {
    const user=await actor(request,true);
    const form=await request.formData();
    const project=await projectByCode(form.get("projectId"));
    const category=clean(form.get("category"),40);
    if(!CATEGORIES.has(category)) throw new Error("Choose a valid image category.");
    const file=form.get("file");
    if(!file || typeof file!=="object" || typeof (file as File).arrayBuffer!=="function") throw new Error("Choose an image to upload.");
    const image=file as File;
    const mime=clean(image.type,80).toLowerCase();
    if(!["image/jpeg","image/png","image/webp"].includes(mime)) throw new Error("Only JPG, PNG and WebP images are supported.");
    if(image.size<=0 || image.size>8*1024*1024) throw new Error("Processed images must be 8 MB or smaller.");
    const bytes=Buffer.from(await image.arrayBuffer());
    const stored=await uploadProjectReferenceImage({projectCode:project.project_code,mimeType:mime,bytes});
    try {
      const saved=await insertRows("project_reference_images",{
        project_id:project.id,project_code:project.project_code,category,caption:clean(form.get("caption"),240)||null,
        object_key:stored.key,original_name:clean(image.name,240)||"reference-image.webp",mime_type:stored.mimeType,
        size_bytes:stored.size,uploaded_by:clean(user.name||user.Name||user.username||user.Username,160)||null,uploaded_by_role:roleOf(user),
      });
      return json({success:true,data:saved[0]||null});
    } catch(error) {
      await deleteR2Object(stored.key).catch(()=>undefined);
      throw error;
    }
  } catch(error:any) {
    const message=clean(error?.message||"Reference image upload failed.",1000);
    return json({success:false,error:message},/session/i.test(message)?401:/permission|access|admin|manager/i.test(message)?403:/required|choose|valid|smaller|supported|project not found/i.test(message)?400:500);
  }
}

export async function DELETE(request: NextRequest) {
  if(!sameOrigin(request)) return json({success:false,error:"Invalid request origin."},403);
  try {
    await actor(request,true);
    const input=await request.json() as Row;
    const project=await projectByCode(input.projectId);
    const rows=await selectRows("project_reference_images",{filters:{id:clean(input.id,80),project_id:project.id},limit:1});
    const row=rows[0] as Row|undefined;
    if(!row) return json({success:false,error:"Reference image not found for this project."},404);
    await deleteRows("project_reference_images",{id:row.id});
    await deleteR2Object(String(row.object_key));
    return json({success:true});
  } catch(error:any) {
    const message=clean(error?.message||"Could not delete reference image.",1000);
    return json({success:false,error:message},/session/i.test(message)?401:/permission|access|admin|manager/i.test(message)?403:400);
  }
}
