import PortalPreloader from "@/components/portal-preloader";
import RolePortalShell from "@/components/role-portal-shell";
import { requirePortalSession } from "@/lib/server-auth";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["employee"]);
  return <><PortalPreloader portal="employee" /><RolePortalShell portal="employee">{children}</RolePortalShell></>;
}
