import PortalPreloader from "@/components/portal-preloader";
import RolePortalShell from "@/components/role-portal-shell";
import ClientInvoiceLinkUpgrade from "@/components/client-invoice-link-upgrade";
import { requirePortalSession } from "@/lib/server-auth";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["client"]);
  return <><PortalPreloader portal="client" /><ClientInvoiceLinkUpgrade /><RolePortalShell portal="client">{children}</RolePortalShell></>;
}
