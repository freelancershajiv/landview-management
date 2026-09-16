import { billingQrSvg } from "@/lib/billing-qr";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CertificateType, signCertificate, verifyCertificate } from "@/lib/certificate-verification";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
function clean(value: unknown, max = 240) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max); }
function sameOrigin(request: NextRequest) { const origin = request.headers.get("origin"); if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin"; try { return new URL(origin).host === request.nextUrl.host; } catch { return false; } }
function prefix(type: CertificateType) { if (type === "employee") return "EMP"; if (type === "building") return "BLD"; return "PRJ"; }
function dateKey(date: string) { return date.replace(/\D/g, "").slice(0, 8); }
function inferCategory(type: CertificateType, subject: string, explicit: unknown) { const value = clean(explicit,40).toLowerCase(); if(value)return value; if(type==="employee")return "employee"; if(type==="building")return "building"; const s=subject.toLowerCase(); if(s.includes("structural"))return "structural_design"; if(s.includes("supervision"))return "supervision"; return "project"; }
function validateType(value:unknown){const type=clean(value,20).toLowerCase() as CertificateType;if(!["project","employee","building"].includes(type))throw new Error("Invalid certificate type.");return type;}
async function requireUser(request:NextRequest){const user=await requireLocalSession(request) as Row|null;if(!user)throw new Error("Session expired.");return user;}
async function can(user:Row,permission:string){const role=roleOf(user);if(role==="admin"||role==="manager")return true;const rows=await selectRows("app_permissions",{filters:{user_key:userIdOf(user),permission},order:"created_at:desc",limit:1});return Boolean(rows[0]&&clean(rows[0].status,30).toLowerCase()==="active");}
async function requirePermission(user:Row,permission:string){if(!await can(user,permission))throw new Error(`Permission required: ${permission}`);}

function certificateUrls(request:NextRequest,token:string){
  if(!token)return{verificationUrl:"",qrUrl:""};
  const origin=`${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const verificationUrl=`${origin}/certificate/verify/${encodeURIComponent(token)}`;
  let qrVerificationUrl=verificationUrl;
  const full=verifyCertificate(token);
  if(full){
    const compactToken=signCertificate({id:full.id,t:full.t,n:full.n,a:"",p:"",s:"",r:"",d:"",i:full.i,x:full.x||undefined});
    qrVerificationUrl=`${origin}/certificate/verify/${encodeURIComponent(compactToken)}`;
  }
  const qrUrl=`${origin}/api/billing-verification/qr?data=${encodeURIComponent(qrVerificationUrl)}`;
  return{verificationUrl,qrUrl};
}
function mapCertificate(request:NextRequest,row:Row){
  const token=String(row.verification_token||"");
  const verified=token?verifyCertificate(token):null;
  return{
    certificateId:row.certificate_code,type:row.type,category:row.category||"",requestId:row.request_code||"",name:row.name||verified?.n||"",address:row.address||verified?.a||"",
    fatherName:row.father_name||verified?.f||"",motherName:row.mother_name||verified?.m||"",nidNo:row.nid_no||verified?.nid||"",position:row.position||verified?.p||"",subject:row.subject||verified?.s||"",
    reference:row.reference||verified?.r||"",description:row.description||verified?.d||"",issuedAt:row.issued_at||verified?.i||"",expiresAt:row.expires_at||verified?.x||"",status:row.status||"Active",
    revision:Number(row.revision||1),parentId:row.parent_code||"",supersededBy:row.superseded_by||"",revokedAt:row.revoked_at||"",revokedReason:row.revoked_reason||"",deletedAt:row.deleted_at||"",deletedReason:row.deleted_reason||"",
    ...certificateUrls(request,token),
  };
}
async function audit(certificateId:string,action:string,actor:string,details:Row={}){await insertRows("certificate_audit",{certificate_code:certificateId,action,actor,details,created_at:new Date().toISOString()});}

export async function GET(request:NextRequest){
  try{
    const user=await requireUser(request);await requirePermission(user,"certificates.view");
    const rows=await selectRows("certificates",{order:"created_at:desc",limit:5000});
    return NextResponse.json({success:true,data:{certificates:rows.map(row=>mapCertificate(request,row)),source:"supabase"}},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
  }catch(error:any){const message=error?.message||"Could not load certificate registry.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/permission/i.test(message)?403:500});}
}

export async function POST(request:NextRequest){
  try{
    if(!sameOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const user=await requireUser(request);await requirePermission(user,"certificates.issue");
    const input=await request.json();const type=validateType(input?.type);const issuedAt=clean(input?.issuedAt,40)||new Date().toISOString();const key=dateKey(issuedAt)||dateKey(new Date().toISOString());const code=randomBytes(4).toString("hex").slice(0,6).toUpperCase();const certificateId=`LVC-${prefix(type)}-${key}-${code}`;
    const name=clean(input?.name,120),address=clean(input?.address,220),fatherName=clean(input?.fatherName,120),motherName=clean(input?.motherName,120),nidNo=clean(input?.nidNo,40),position=clean(input?.position,120),subject=clean(input?.subject,140),reference=clean(input?.reference,80);
    const description=String(input?.description??"").trim().replace(/\r\n?/g,"\n");if(description.length>3000)return NextResponse.json({success:false,error:"Certificate statement must be 3,000 characters or fewer."},{status:400});
    const expiresAt=clean(input?.expiresAt,40),category=inferCategory(type,subject,input?.category);let requestId=clean(input?.requestId,80);if(!name)throw new Error("Certificate name is required.");
    if(!requestId&&reference){const pending=await selectRows("certificate_requests",{limit:5000});const matched=pending.find((item:Row)=>clean(item.status,30).toLowerCase()==="approved"&&clean(item.requester_id||item.project_code||item.employee_code,80).toUpperCase()===reference.toUpperCase()&&clean(item.category,40).toLowerCase()===category);if(matched?.request_code)requestId=clean(matched.request_code,80);}
    let revision=1,parentId="";const reissueOf=clean(input?.reissueOf,60).toUpperCase();
    if(reissueOf){const previous=(await selectRows("certificates",{filters:{certificate_code:reissueOf},limit:1}))[0];if(!previous)throw new Error("The certificate being reissued was not found.");revision=Math.max(1,Number(previous.revision||1))+1;parentId=clean(previous.parent_code||previous.certificate_code,60).toUpperCase();}
    const signedToken=signCertificate({id:certificateId,t:type,n:name,a:address,p:position,s:subject,r:reference,d:description,f:fatherName||undefined,m:motherName||undefined,nid:nidNo||undefined,i:issuedAt,x:expiresAt||undefined});
    const urls=certificateUrls(request,signedToken);if(urls.verificationUrl.length>4096)throw new Error("Certificate content is too long for its verification QR.");billingQrSvg(urls.verificationUrl);
    const now=new Date().toISOString();const row={certificate_code:certificateId,type,category,request_code:requestId||null,name,address:address||null,father_name:fatherName||null,mother_name:motherName||null,nid_no:nidNo||null,position:position||null,subject:subject||null,reference:reference||null,description:description||null,issued_at:issuedAt,expires_at:expiresAt||null,status:"Active",revision,parent_code:parentId||null,superseded_by:null,revoked_at:null,revoked_reason:null,deleted_at:null,deleted_reason:null,created_by:userIdOf(user),created_at:now,updated_at:now,verification_token:signedToken};
    const saved=await insertRows("certificates",row);if(reissueOf){await updateRows("certificates",{certificate_code:reissueOf},{status:"Superseded",superseded_by:certificateId,updated_at:now});await audit(reissueOf,"superseded",userIdOf(user),{supersededBy:certificateId});}
    if(requestId)await updateRows("certificate_requests",{request_code:requestId},{status:"Issued",certificate_code:certificateId,reviewed_at:now,reviewed_by:userIdOf(user)});
    await audit(certificateId,"issued",userIdOf(user),{type,category,revision,parentId});
    return NextResponse.json({success:true,data:mapCertificate(request,saved[0]||row)},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
  }catch(error:any){const message=error?.message||"Could not issue certificate.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/permission/i.test(message)?403:500});}
}

export async function PATCH(request:NextRequest){
  try{
    if(!sameOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const user=await requireUser(request);await requirePermission(user,"certificates.process");
    const input=await request.json();const action=clean(input?.action,20).toLowerCase();if(!["revoke","delete"].includes(action))return NextResponse.json({success:false,error:"Unknown certificate action."},{status:400});
    const certificateId=clean(input?.certificateId,60).toUpperCase();if(!certificateId)return NextResponse.json({success:false,error:"Certificate ID is required."},{status:400});
    const reason=clean(input?.reason,300),now=new Date().toISOString();const changes=action==="revoke"?{status:"Revoked",revoked_at:now,revoked_reason:reason||null,updated_at:now}:{status:"Deleted",deleted_at:now,deleted_reason:reason||null,updated_at:now};
    const rows=await updateRows("certificates",{certificate_code:certificateId},changes);if(!rows.length)throw new Error("Certificate not found.");await audit(certificateId,action,userIdOf(user),{reason});
    return NextResponse.json({success:true,data:mapCertificate(request,rows[0])},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
  }catch(error:any){const message=error?.message||"Could not update certificate.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/permission/i.test(message)?403:500});}
}
