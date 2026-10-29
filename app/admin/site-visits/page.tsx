import AdminSiteVisitEntry from "@/components/admin-site-visit-entry";
import SiteVisitAssignmentsAdmin from "@/components/site-visit-assignments-admin";
import SiteVisitMediaQueue from "@/components/site-visit-media-queue";
import SiteVisitsAdmin from "@/components/site-visits-admin";
import { requirePortalSession } from "@/lib/server-auth";

export default async function SiteVisitsPage(){
  const session = await requirePortalSession(["admin","manager"]);
  return <div className="site-visits-page">
    <div className="site-visit-schedule-scope">
      <SiteVisitAssignmentsAdmin />
    </div>
    {session.role === "admin" ? <AdminSiteVisitEntry /> : null}
    <SiteVisitMediaQueue canRetry={session.role === "admin"} />
    <SiteVisitsAdmin canDelete={session.role === "admin"} />

    <style>{`
      .site-visits-page{display:grid;gap:16px;min-width:0}
      .site-visits-page>.admin-site-entry{margin-bottom:0}
      .site-visit-schedule-scope{min-width:0}
      .site-visit-schedule-scope>.sva-shell{margin-bottom:0}

      /* The schedule and visit-history components both historically used
         .sva-list / .sva-row. Keep the schedule table isolated so the
         history-card styles cannot reshape its rows. */
      .site-visit-schedule-scope .sva-list{
        display:block;
        gap:0;
        border-top:1px solid var(--lv-border-default)
      }
      .site-visit-schedule-scope .sva-row{
        display:grid;
        grid-template-columns:150px minmax(190px,1.3fr) minmax(150px,.8fr) 105px 110px 72px;
        gap:10px;
        align-items:center;
        padding:11px 16px;
        border:0;
        border-top:1px solid var(--lv-border-subtle);
        border-radius:0;
        background:transparent;
        overflow:visible;
        font-size:9px
      }
      .site-visit-schedule-scope .sva-row:hover{
        border-color:var(--lv-border-subtle);
        background:transparent
      }

      @media(max-width:1100px){
        .site-visit-schedule-scope .sva-row{grid-template-columns:1fr 1fr 110px}
      }
      @media(max-width:700px){
        .site-visit-schedule-scope .sva-row{grid-template-columns:1fr 1fr}
      }
    `}</style>
  </div>;
}
