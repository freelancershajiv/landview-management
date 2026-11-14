import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// A bounded, read-only projection of the pre-existing audit table.
// Never return raw before_data/after_data, arbitrary audit details, or user credentials.
type Row=Record<string,any>;
const clean=(value:unknown,max=150)=>String(value??"").trim().slice(0,max);
const roleOf=(user:Row|null)=>clean(user?.role||user?.Role,30).toLowerCase();
const HEADERS={"Cache-Control":"private, no-store, max-age=0","X-Landview-Data":"supabase"};
const fail=(message:string,status:number)=>NextResponse.json({success:false,error:message},{status,headers:HEADERS});
const ALLOWED_FIELDS=[
  "entry_date","details","category","received_from","paid_to","supplier",
  "debit","credit","payment_method","cheque_status","reference_no",
  "supplier_account_id","contractor_contract_id","approval_status"
] as const;

export async function GET(request:NextRequest){
  try {
    const user=await requireLocalSession(request) as Row|null;
    if(!user)return fail("Session expired.",401);
    if(!["admin","manager"].includes(roleOf(user)))return fail("Management permission required.",403);

    const projectCode=normalizeProjectCode(request.nextUrl.searchParams.get("projectId")||"");
    if(!projectCode)return fail("A project is required.",400);
    const projects=await selectRows("projects",{filters:{project_code:projectCode,record_type:"project"},limit:1});
    const project=projects[0];
    if(!project)return fail("Project not found.",404);
    // Bound the scan to recent records. Older records are NOT claimed to be absent.
    // Audit history is not itself modified, reconciled, or approved by this endpoint.
    const AUDIT_SCAN_LIMIT=800;
    const auditRows=await selectRows("app_audit_log",{
      filters:{entity_type:"project_management_ledger"},
      order:"created_at:desc",
      limit:AUDIT_SCAN_LIMIT
    });
    const projectId=clean(project.id,80);
    const matches=auditRows.filter((row:Row)=>{
      const previous=row.before_data && typeof row.before_data==="object" ? row.before_data : {};
      const next=row.after_data && typeof row.after_data==="object" ? row.after_data : {};
      const details=row.details && typeof row.details==="object" ? row.details : {};
      const recordedId=clean(next.project_id||previous.project_id||details.project_id,80);
      if(recordedId)return recordedId===projectId;
      return normalizeProjectCode(details.project_code||"")===projectCode;
    });
    const events=matches.slice(0,65).map((row:Row)=>{
      const previous=row.before_data && typeof row.before_data==="object" ? row.before_data : {};
      const next=row.after_data && typeof row.after_data==="object" ? row.after_data : {};
      const action=clean(row.action,90);
      const changedFields=ALLOWED_FIELDS.filter(field=>JSON.stringify(previous[field]??null)!==JSON.stringify(next[field]??null));
      const current=action.endsWith(".delete")?previous:next;
      return {
        id:clean(row.id,80),
        entryId:clean(row.entity_id||current.id||"",80),
        date:clean(row.created_at,50),
        action:action.endsWith(".create")?"Created":action.endsWith(".delete")?"Deleted":action.endsWith(".update")?"Updated":"Changed",
        actor:clean(row.actor_name||row.actor_user_key||"System",90),
        details:clean(current.details||previous.details||"Project ledger entry",220),
        category:clean(current.category||previous.category,90),
        changedFields,
        debit:Number(current.debit||0)||0,
        credit:Number(current.credit||0)||0,
      };
    });
    return NextResponse.json({
      success:true,
      data:{
        projectCode,
        events,
        scanned:auditRows.length,
        recentWindowOnly:true,
        moreMatchingEvents:matches.length>events.length,
      }
    },{headers:HEADERS});
  }catch(error){
    // Never expose internal query errors or raw data through an audit endpoint.
    return fail("Audit records could not be loaded.",500);
  }
}
