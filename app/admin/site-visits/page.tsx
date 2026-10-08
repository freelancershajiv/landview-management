import AdminSiteVisitEntry from "@/components/admin-site-visit-entry";
import SiteVisitsAdmin from "@/components/site-visits-admin";
import { requirePortalSession } from "@/lib/server-auth";

export default async function SiteVisitsPage(){
  const session = await requirePortalSession(["admin","manager"]);
  return <>
    {session.role === "admin" ? <AdminSiteVisitEntry /> : null}
    <SiteVisitsAdmin />
  </>;
}