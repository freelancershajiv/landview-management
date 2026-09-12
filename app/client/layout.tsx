import PortalPreloader from "@/components/portal-preloader";
import RolePortalShell from "@/components/role-portal-shell";
import { requirePortalSession } from "@/lib/server-auth";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["client"]);
  return <><PortalPreloader portal="client" /><RolePortalShell portal="client">{children}</RolePortalShell></>;
}
