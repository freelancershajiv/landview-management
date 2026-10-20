import ManagementShellV3 from "@/components/management-shell-v3";
import AdminMobileDock from "@/components/admin-mobile-dock";
import PortalPreloader from "@/components/portal-preloader";
import ProjectManagementEnhancements from "@/components/project-management-enhancements";
import AdminProjectMapDrawer from "@/components/admin-project-map-drawer";
import ManagementRolePolicyEnforcer from "@/components/management-role-policy-enforcer";
import AccountShortcut from "@/components/account-shortcut";
import { requirePortalSession } from "@/lib/server-auth";
import "./admin-brand-theme.css";
import "./admin-layout-polish.css";
import "./finance/invoices/invoice-revamp-print-fix.css";
import "./finance/invoices/invoice-column-alignment-fix.css";
import "./admin-theme-consistency.css";
import "./admin-mobile-redesign.css";
import "./admin-mobile-shell-final.css";
import "./admin-dashboard-light.css";
import "./admin-color-harmony.css";
import "../dual-mode-navigation.css";
import "./admin-red-workspace.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession(["admin", "manager"]);
  const role = String(session.user?.role || session.user?.Role || "").trim().toLowerCase();
  return <>
    <PortalPreloader portal="admin"/>
    <ProjectManagementEnhancements />
    <AdminProjectMapDrawer />
    <ManagementRolePolicyEnforcer role={role} />
    <ManagementShellV3 initialUser={session.user}>{children}</ManagementShellV3>
    {role === "manager" && <AccountShortcut label="My Account" mobileDock />}
    <AdminMobileDock />
  </>;
}
