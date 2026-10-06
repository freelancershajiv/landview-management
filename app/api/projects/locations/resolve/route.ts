import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf } from "@/lib/supabase-data";
import { resolveGoogleMapsLocation } from "@/lib/google-maps-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);
const GEO_SOURCE = "https://iqbalhasandev.github.io/bangladesh-geo-json/bangladesh-geo.json";
const MODERN_NAMES: Record<string, string> = { Chattagram:"Chattogram", Barisal:"Barishal", Comilla:"Cumilla", Jessore:"Jashore", Bogra:"Bogura" };

type Place = { name?: string; bn_name?: string; districts?: Place[]; upazilas?: Place[]; unions?: Place[]; pourashavas?: Array<Place & { category?: string }> };
type Address = Record<string, string | undefined>;

function text(value: unknown, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function modern(value: unknown) { const raw=text(value,200); return MODERN_NAMES[raw] || raw; }
function clean(value: unknown) {
  return modern(value)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\b(?:division|district|zila|zilla|upazila|thana|union parishad|union|paurashava|pourashava|municipality|city corporation|sadar)\b/gi," ")
    .replace(/[^a-z0-9]+/gi," ").trim().toLowerCase();
}
function tokens(value: unknown) { return new Set(clean(value).split(/\s+/).filter(Boolean)); }
function candidateScore(name: unknown, candidate: unknown) {
  const a=clean(name), b=clean(candidate); if(!a||!b)return 0;
  if(a===b)return 100;
  if(a.includes(b)||b.includes(a))return 82-Math.min(20,Math.abs(a.length-b.length));
  const at=tokens(a), bt=tokens(b); let common=0; for(const token of at)if(bt.has(token))common++;
  if(!common)return 0; return Math.round(55*common/Math.max(at.size,bt.size));
}
function bestPlace(items: Place[] | undefined, candidates: unknown[]) {
  let best: Place | null=null, score=0;
  for(const item of items||[])for(const candidate of candidates){const next=Math.max(candidateScore(item.name,candidate),candidateScore(item.bn_name,candidate));if(next>score){score=next;best=item;}}
  return score>=45?best:null;
}
function first(...values: unknown[]) { for(const value of values){const found=text(value,250);if(found)return found;} return ""; }
function stripAdmin(value: unknown) {
  return modern(value).replace(/\s+(?:Division|District|Zila|Zilla|Upazila|Thana|Union Parishad|Union|Paurashava|Pourashava|Municipality|City Corporation)$/i,"").trim();
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success:false, error:"Invalid request origin." }, { status:403 });
    const user=await requireLocalSession(request);
    if(!user)return NextResponse.json({success:false,error:"Session expired."},{status:401});
    if(!MANAGE_ROLES.has(roleOf(user)))return NextResponse.json({success:false,error:"Admin or manager access is required."},{status:403});

    const body=await request.json() as Record<string,unknown>;
    const locationTag=text(body.locationTag||body.Location_Tag,4000);
    if(!locationTag)return NextResponse.json({success:false,error:"Paste a Google Maps location link or coordinates first."},{status:400});

    const point=await resolveGoogleMapsLocation(locationTag);
    if(!point)return NextResponse.json({success:false,error:"Could not find an exact pin in this map location tag."},{status:400});

    const reverseUrl=new URL("https://nominatim.openstreetmap.org/reverse");
    reverseUrl.searchParams.set("format","jsonv2");
    reverseUrl.searchParams.set("lat",String(point.latitude));
    reverseUrl.searchParams.set("lon",String(point.longitude));
    reverseUrl.searchParams.set("addressdetails","1");
    reverseUrl.searchParams.set("zoom","18");
    reverseUrl.searchParams.set("accept-language","en");
    const reverseResponse=await fetch(reverseUrl,{cache:"no-store",headers:{"user-agent":"LAND VIEW Architects & Engineers project-location-admin/1.0 (https://landview.com.bd)",accept:"application/json"},signal:AbortSignal.timeout(12000)});
    if(!reverseResponse.ok)throw new Error(`Reverse geocoder returned ${reverseResponse.status}.`);
    const reverse=await reverseResponse.json() as { address?:Address; display_name?:string };
    const address=reverse.address||{};
    if(text(address.country_code).toLowerCase()!=="bd")return NextResponse.json({success:false,error:"The selected pin is outside Bangladesh."},{status:400});

    const geoResponse=await fetch(GEO_SOURCE,{next:{revalidate:86400},signal:AbortSignal.timeout(15000)});
    if(!geoResponse.ok)throw new Error(`Bangladesh location source returned ${geoResponse.status}.`);
    const hierarchy=await geoResponse.json() as Place[];

    const divisionCandidates=[address.state,address.region];
    const divisionPlace=bestPlace(hierarchy,divisionCandidates);
    const division=modern(divisionPlace?.name||stripAdmin(first(...divisionCandidates)));

    const districtCandidates=[address.state_district,address.district,address.county];
    const districtPlace=bestPlace(divisionPlace?.districts,districtCandidates);
    const district=modern(districtPlace?.name||stripAdmin(first(...districtCandidates)));

    const upazilaCandidates=[address.county,address.city_district,address.municipality,address.suburb,address.town,address.city];
    const upazilaPlace=bestPlace(districtPlace?.upazilas,upazilaCandidates);
    const upazilaThana=modern(upazilaPlace?.name||stripAdmin(first(...upazilaCandidates)));

    const localCandidates=[address.municipality,address.city,address.town,address.village,address.suburb,address.neighbourhood,address.quarter];
    const unionPlace=bestPlace(upazilaPlace?.unions,localCandidates);
    const paurashavaPlace=bestPlace(upazilaPlace?.pourashavas,localCandidates);
    let localBodyName="", localBodyType="";
    if(unionPlace&&paurashavaPlace){
      const unionScore=Math.max(...localCandidates.map(v=>candidateScore(unionPlace.name,v)));
      const paurashavaScore=Math.max(...localCandidates.map(v=>candidateScore(paurashavaPlace.name,v)));
      if(paurashavaScore>=unionScore){localBodyName=modern(paurashavaPlace.name);localBodyType="Paurashava / Municipality";}else{localBodyName=modern(unionPlace.name);localBodyType="Union Parishad";}
    }else if(paurashavaPlace){localBodyName=modern(paurashavaPlace.name);localBodyType="Paurashava / Municipality";}
    else if(unionPlace){localBodyName=modern(unionPlace.name);localBodyType="Union Parishad";}
    else {localBodyName=stripAdmin(first(...localCandidates));localBodyType=localBodyName?"Other":"";}

    return NextResponse.json({success:true,data:{
      locationTag,
      latitude:point.latitude,
      longitude:point.longitude,
      division,
      district,
      upazilaThana,
      localBodyType,
      localBodyName,
      displayName:text(reverse.display_name,1000),
      matched:{division:Boolean(divisionPlace),district:Boolean(districtPlace),upazila:Boolean(upazilaPlace),localBody:Boolean(unionPlace||paurashavaPlace)},
    }},{headers:{"Cache-Control":"no-store, max-age=0"}});
  } catch(error) {
    return NextResponse.json({success:false,error:error instanceof Error?error.message:"Could not resolve map location tag."},{status:502,headers:{"Cache-Control":"no-store"}});
  }
}
