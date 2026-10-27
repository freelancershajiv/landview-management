import ManagementShellV5 from "@/components/management-shell-v5";
import AdminMobileDock from "@/components/admin-mobile-dock";
import PortalPreloader from "@/components/portal-preloader";
import ProjectManagementEnhancements from "@/components/project-management-enhancements";
import AdminProjectMapDrawer from "@/components/admin-project-map-drawer";
import ManagementRolePolicyEnforcer from "@/components/management-role-policy-enforcer";
import OutsourcingVendorLedgerInlineBridge from "@/components/outsourcing-vendor-ledger-inline-bridge";
import { requirePortalSession } from "@/lib/server-auth";
import "./admin-brand-theme.css";
import "./admin-layout-polish.css";
import "./finance/invoices/invoice-revamp-print-fix.css";
import "./finance/invoices/invoice-column-alignment-fix.css";
import "../dual-mode-navigation.css";
// Phase 4: one Admin-only semantic theme bridge replaces four overlapping fix layers.
import "./admin-route-theme.css";
import "./public-portfolio-nav-cleanup.css";
import "./finance-navigation-cleanup.css";
// Authoritative mobile geometry. Keep this after route theme styles.
import "./admin-mobile-authority.css";
// Re-assert the shared palette after every Admin-specific override.
import "../color-system-authority.css";
// Phase 3 keeps one final compatibility bridge after nested Admin styles.
import "../color-system-compatibility.css";
// Keep the restored original signature red final in the Admin cascade.
import "../brand-palette-original.css";
// Final screen-only typography authority. Keep after route/mobile/theme layers.
import "./admin-typography-authority.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession(["admin", "manager"]);
  const role = String(session.user?.role || session.user?.Role || "").trim().toLowerCase();
  return <>
    <PortalPreloader portal="admin"/>
    <ProjectManagementEnhancements />
    <AdminProjectMapDrawer />
    <ManagementRolePolicyEnforcer role={role} />
    <ManagementShellV5 initialUser={session.user}>{children}</ManagementShellV5>
    <OutsourcingVendorLedgerInlineBridge />
    <AdminMobileDock />
  </>;
}
