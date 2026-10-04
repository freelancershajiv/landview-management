import SiteVisitsAdmin from "@/components/site-visits-admin";
import { requirePortalSession } from "@/lib/server-auth";

export default async function SiteVisitsPage(){
  await requirePortalSession(["admin","manager"]);
  return <SiteVisitsAdmin />;
}
