import AdminSiteVisitEntry from "@/components/admin-site-visit-entry";
import SiteVisitMediaQueue from "@/components/site-visit-media-queue";
import SiteVisitsAdmin from "@/components/site-visits-admin";
import { requirePortalSession } from "@/lib/server-auth";

export default async function SiteVisitsPage(){
  const session = await requirePortalSession(["admin","manager"]);
  return <>
    {session.role === "admin" ? <AdminSiteVisitEntry /> : null}
    <SiteVisitMediaQueue canRetry={session.role === "admin"} />
    <SiteVisitsAdmin canDelete={session.role === "admin"} />
  </>;
}
