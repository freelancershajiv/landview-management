import PortalPreloader from "@/components/portal-preloader";
import RolePortalShell from "@/components/role-portal-shell";
import ClientInvoiceLinkUpgrade from "@/components/client-invoice-link-upgrade";
import ClientLifecycleStrip from "@/components/client-lifecycle-strip";
import ClientPortalHardening from "@/components/client-portal-hardening";
import { requirePortalSession } from "@/lib/server-auth";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["client"]);
  return <>
    <PortalPreloader portal="client" />
    <ClientInvoiceLinkUpgrade />
    <ClientPortalHardening />
    <RolePortalShell portal="client">
      <ClientLifecycleStrip />
      {children}
    </RolePortalShell>
  </>;
}
