import ManagementShellV2 from "@/components/management-shell-v2";
import PortalPreloader from "@/components/portal-preloader";
import ProjectManagementEnhancements from "@/components/project-management-enhancements";
import AdminProjectMapDrawer from "@/components/admin-project-map-drawer";
import { requirePortalSession } from "@/lib/server-auth";
import "./admin-brand-theme.css";
import "./admin-layout-polish.css";
import "./finance/invoices/invoice-revamp-print-fix.css";
import "./finance/invoices/invoice-column-alignment-fix.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession(["admin", "manager"]);
  return <>
    <PortalPreloader portal="admin"/>
    <ProjectManagementEnhancements />
    <AdminProjectMapDrawer />
    <style>{`
      a[href="/admin/projects/new"],a[href="/admin/public-projects"]{display:none!important}
      .primary-nav a[href="/admin/accounts/entry"]{display:none!important}
    `}</style>
    <ManagementShellV2 initialUser={session.user}>{children}</ManagementShellV2>
  </>;
}
