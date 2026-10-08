import PortalPreloader from "@/components/portal-preloader";
import RolePortalShell from "@/components/role-portal-shell";
import EmployeeLocationCheck from "@/components/employee-location-check";
import { requirePortalSession } from "@/lib/server-auth";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["employee"]);
  return <>
    <PortalPreloader portal="employee" />
    <RolePortalShell portal="employee">
      <div style={{ padding: "16px 16px 0" }}><EmployeeLocationCheck /></div>
      {children}
    </RolePortalShell>
  </>;
}
