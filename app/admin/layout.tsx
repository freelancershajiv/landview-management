import Link from "next/link";
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
import "./admin-dashboard-theme-fix.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession(["admin", "manager"]);
  const role = String(session.user?.role || session.user?.Role || "").trim().toLowerCase();
  return <>
    <PortalPreloader portal="admin"/>
    <ProjectManagementEnhancements />
    <AdminProjectMapDrawer />
    <ManagementRolePolicyEnforcer role={role} />
    <ManagementShellV3 initialUser={session.user}>{children}</ManagementShellV3>
    <style>{`
      .lv-action-center-shortcut{position:fixed;right:18px;bottom:18px;z-index:180;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid var(--lv-brand-text);border-radius:999px;background:var(--lv-surface-panel);color:var(--lv-brand-text);box-shadow:var(--lv-shadow-md);font-size:9px;font-weight:900;text-decoration:none;letter-spacing:.04em}
      .lv-action-center-shortcut:hover{background:var(--lv-brand-soft)}
      @media(max-width:900px){.lv-action-center-shortcut{display:none}}
    `}</style>
    <Link className="lv-action-center-shortcut" href="/admin/action-center" aria-label="Open Action Center"><span aria-hidden="true">⚑</span> ACTION CENTER</Link>
    {role === "manager" && <AccountShortcut label="My Account" mobileDock />}
    <AdminMobileDock />
  </>;
}
