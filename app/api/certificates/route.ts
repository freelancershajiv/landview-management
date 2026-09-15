import { billingQrSvg } from "@/lib/billing-qr";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CertificateType, signCertificate, verifyCertificate } from "@/lib/certificate-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SESSION_COOKIE = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const GATEWAY_TIMEOUT_MS = 50_000;
const REDIRECT_RETRY_DELAYS_MS = [0, 250, 700];

function clean(value: unknown, max = 240) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max); }
function sameOrigin(request: NextRequest) { const origin = request.headers.get("origin"); if (!origin) return process.env.NODE_ENV !== "production"; try { return new URL(origin).host === request.nextUrl.host; } catch { return false; } }
function prefix(type: CertificateType) { if (type === "employee") return "EMP"; if (type === "building") return "BLD"; return "PRJ"; }
function dateKey(date: string) { return date.replace(/\D/g, "").slice(0, 8); }
function requireGatewayConfig() { if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("Certificate registry backend is not configured."); }
function inferCategory(type: CertificateType, subject: string, explicit: unknown) { const value = clean(explicit,40).toLowerCase(); if(value)return value; if(type==="employee")return "employee"; if(type==="building")return "building"; const s=subject.toLowerCase(); if(s.includes("structural"))return "structural_design"; if(s.includes("supervision"))return "supervision"; return "project"; }
function safeUpstreamUrl(value:string){try{const url=new URL(value);return `${url.hostname}${url.pathname}`;}catch{return "invalid-upstream-url";}}
function safeBodyPreview(text:string){return text.replace(/\s+/g," ").slice(0,180);}
type ParsedGatewayResponse={response:Response;raw:string;json:any|null};
async function parseGatewayResponse(response:Response,phase:string):Promise<ParsedGatewayResponse>{const raw=await response.text();let json:any|null=null;try{json=JSON.parse(raw);}catch{console.error("certificate gateway returned non-JSON",{phase,status:response.status,contentType:response.headers.get("content-type")||"",upstream:safeUpstreamUrl(response.url||APPS_SCRIPT_URL),bodyPreview:safeBodyPreview(raw)});}return{response,raw,json};}
async function followContentServiceRedirect(location:string,signal:AbortSignal):Promise<ParsedGatewayResponse>{let last:ParsedGatewayResponse|null=null;for(let index=0;index<REDIRECT_RETRY_DELAYS_MS.length;index+=1){const delay=REDIRECT_RETRY_DELAYS_MS[index];if(delay)await new Promise(resolve=>setTimeout(resolve,delay));const response=await fetch(location,{method:"GET",cache:"no-store",redirect:"follow",signal});const parsed=await parseGatewayResponse(response,`redirect-${index+1}`);last=parsed;if(parsed.json!==null)return parsed;const retryable=response.status===404||response.status===429||response.status>=500;if(!retryable)return parsed;}return last!;}
async function postGateway(payload:Record<string,unknown>):Promise<ParsedGatewayResponse>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),GATEWAY_TIMEOUT_MS);try{const initial=await fetch(APPS_SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},cache:"no-store",redirect:"manual",body:JSON.stringify(payload),signal:controller.signal});if([301,302,303,307,308].includes(initial.status)){const location=initial.headers.get("location")||"";if(!location)return parseGatewayResponse(initial,"redirect-missing-location");return followContentServiceRedirect(location,controller.signal);}return parseGatewayResponse(initial,"initial");}catch(error:any){const timedOut=error?.name==="AbortError";console.error("certificate gateway request failed",{timedOut,error:String(error?.message||error||"Unknown error").slice(0,180)});throw new Error(timedOut?"The certificate server is responding slowly. Please try again.":"Certificate backend is temporarily unavailable.");}finally{clearTimeout(timer);}}
async function gatewayRequest(request:NextRequest,flags:Record<string,unknown>,payload:Record<string,unknown>){requireGatewayConfig();const token=request.cookies.get(SESSION_COOKIE)?.value||"";if(!token)throw new Error("Session expired.");const parsed=await postGateway({action:"getPublicProjects",token,proxySecret:PROXY_SECRET,...flags,...payload});const json=parsed.json;if(json===null)throw new Error(/^\s*</.test(parsed.raw)?"Certificate server returned a temporary HTML response. Please retry.":"Certificate backend returned invalid JSON.");if(!parsed.response.ok&&!json?.success)throw new Error(String(json?.error||json?.message||`Certificate backend returned HTTP ${parsed.response.status}.`));if(!json?.success)throw new Error(String(json?.error||json?.message||"Certificate request failed."));return json.data||{};}
function registryRequest(request:NextRequest,payload:Record<string,unknown>){return gatewayRequest(request,{_certificateRegistry:"1"},payload);}
function portalRequest(request:NextRequest,payload:Record<string,unknown>){return gatewayRequest(request,{_certificatePortal:"1"},payload);}

function certificateUrls(request:NextRequest,token:string,certificateId=""){
  if(!token)return{verificationUrl:"",qrUrl:""};
  const origin=`${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const verificationUrl=`${origin}/certificate/verify/${encodeURIComponent(token)}`;
  let qrVerificationUrl=verificationUrl;
  const full=verifyCertificate(token);
  if(full){
    const compactToken=signCertificate({
      id:full.id,
      t:full.t,
      n:full.n,
      a:"",
      p:"",
      s:"",
      r:"",
      d:"",
      i:full.i,
      x:full.x||undefined,
    });
    qrVerificationUrl=`${origin}/certificate/verify/${encodeURIComponent(compactToken)}`;
  }
  const qrUrl=`${origin}/api/billing-verification/qr?data=${encodeURIComponent(qrVerificationUrl)}`;
  return{verificationUrl,qrUrl};
}
function validateType(value:unknown){const type=clean(value,20).toLowerCase() as CertificateType;if(!["project","employee","building"].includes(type))throw new Error("Invalid certificate type.");return type;}

export async function GET(request:NextRequest){try{if(!request.cookies.get(SESSION_COOKIE)?.value)return NextResponse.json({success:false,error:"Unauthorized."},{status:401});const data=await registryRequest(request,{registryOp:"list"});const certificates=(Array.isArray(data?.certificates)?data.certificates:[]).map((item:any)=>{const signed=clean(item?.token,5000);const verified=signed?verifyCertificate(signed):null;return{...item,fatherName:clean(item?.fatherName||item?.Father_Name||verified?.f,120),motherName:clean(item?.motherName||item?.Mother_Name||verified?.m,120),nidNo:clean(item?.nidNo||item?.NID_No||item?.NID||verified?.nid,40),...certificateUrls(request,signed,clean(item?.certificateId||item?.Certificate_ID,60)),token:undefined};});return NextResponse.json({success:true,data:{...data,certificates}},{headers:{"Cache-Control":"no-store, max-age=0"}});}catch(error:any){return NextResponse.json({success:false,error:error?.message||"Could not load certificate registry."},{status:502});}}

export async function POST(request:NextRequest){try{if(!sameOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});if(!request.cookies.get(SESSION_COOKIE)?.value)return NextResponse.json({success:false,error:"Unauthorized."},{status:401});const input=await request.json();const type=validateType(input?.type);const issuedAt=clean(input?.issuedAt,40)||new Date().toISOString();const key=dateKey(issuedAt)||dateKey(new Date().toISOString());const code=randomBytes(4).toString("hex").slice(0,6).toUpperCase();const certificateId=`LVC-${prefix(type)}-${key}-${code}`;const name=clean(input?.name,120);const address=clean(input?.address,220);const fatherName=clean(input?.fatherName,120);const motherName=clean(input?.motherName,120);const nidNo=clean(input?.nidNo,40);const position=clean(input?.position,120);const subject=clean(input?.subject,140);const reference=clean(input?.reference,80);const description=String(input?.description??"").trim().replace(/\r\n?/g,"\n");if(description.length>3000)return NextResponse.json({success:false,error:"Certificate statement must be 3,000 characters or fewer."},{status:400});const expiresAt=clean(input?.expiresAt,40);const category=inferCategory(type,subject,input?.category);let requestId=clean(input?.requestId,80);if(!name)throw new Error("Certificate name is required.");if(!requestId&&reference){try{const pending=await portalRequest(request,{certificatePortalOp:"adminList"});const matched=(Array.isArray(pending?.requests)?pending.requests:[]).find((item:any)=>{const requester=clean(item?.requesterId||item?.projectId||item?.employeeId,80).toUpperCase();return String(item?.status||"").toLowerCase()==="approved"&&requester===reference.toUpperCase()&&clean(item?.category,40).toLowerCase()===category;});if(matched?.requestId)requestId=clean(matched.requestId,80);}catch{}}
let revision=1;let parentId="";const reissueOf=clean(input?.reissueOf,60).toUpperCase();if(reissueOf){const list=await registryRequest(request,{registryOp:"list"});const previous=(Array.isArray(list?.certificates)?list.certificates:[]).find((item:any)=>String(item?.certificateId||"").toUpperCase()===reissueOf);if(!previous)throw new Error("The certificate being reissued was not found.");revision=Math.max(1,Number(previous.revision||1))+1;parentId=clean(previous.parentId||previous.certificateId,60).toUpperCase();}
const signedToken=signCertificate({id:certificateId,t:type,n:name,a:address,p:position,s:subject,r:reference,d:description,f:fatherName||undefined,m:motherName||undefined,nid:nidNo||undefined,i:issuedAt,x:expiresAt||undefined});const urls=certificateUrls(request,signedToken,certificateId);if(urls.verificationUrl.length>4096)throw new Error("Certificate content is too long for its verification QR.");billingQrSvg(urls.verificationUrl);await registryRequest(request,{registryOp:"create",Certificate_ID:certificateId,Type:type,Category:category,Request_ID:requestId,Name:name,Address:address,Father_Name:fatherName,Mother_Name:motherName,NID_No:nidNo,Position:position,Subject:subject,Reference:reference,Description:description,Issued_At:issuedAt,Expires_At:expiresAt,Revision:revision,Parent_ID:parentId,Token:signedToken});if(reissueOf)await registryRequest(request,{registryOp:"supersede",certificateId:reissueOf,supersededBy:certificateId});if(requestId)await portalRequest(request,{certificatePortalOp:"linkIssued",requestId,certificateId});return NextResponse.json({success:true,data:{certificateId,...urls,issuedAt,type,category,requestId,name,address,fatherName,motherName,nidNo,position,subject,reference,description,expiresAt:expiresAt||undefined,status:"Active",revision,parentId}},{headers:{"Cache-Control":"no-store, max-age=0"}});}catch(error:any){return NextResponse.json({success:false,error:error?.message||"Could not issue certificate."},{status:500});}}

export async function PATCH(request:NextRequest){try{if(!sameOrigin(request))return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});if(!request.cookies.get(SESSION_COOKIE)?.value)return NextResponse.json({success:false,error:"Unauthorized."},{status:401});const input=await request.json();const action=clean(input?.action,20).toLowerCase();if(!["revoke","delete"].includes(action))return NextResponse.json({success:false,error:"Unknown certificate action."},{status:400});const certificateId=clean(input?.certificateId,60).toUpperCase();if(!certificateId)return NextResponse.json({success:false,error:"Certificate ID is required."},{status:400});const data=await registryRequest(request,{registryOp:action,certificateId,reason:clean(input?.reason,300)});return NextResponse.json({success:true,data},{headers:{"Cache-Control":"no-store, max-age=0"}});}catch(error:any){return NextResponse.json({success:false,error:error?.message||"Could not update certificate."},{status:500});}}