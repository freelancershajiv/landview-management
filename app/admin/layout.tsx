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

const ADMIN_CHROME_FIX = `
  html body .portal-admin .primary-nav,
  html body .portal-admin .sidebar-brand,
  html body .portal-admin .sidebar-footer {
    background:
      radial-gradient(circle at 18% 4%, rgba(255,255,255,.16), transparent 24%),
      linear-gradient(165deg, #df1922 0%, #bd1018 52%, #90080d 100%) !important;
    border-color: rgba(255,255,255,.14) !important;
    color: #fff !important;
  }
  html body .portal-admin .sidebar-brand {
    border-bottom: 1px solid rgba(255,255,255,.14) !important;
    box-shadow: none !important;
  }
  html body .portal-admin .sidebar-brand img {
    filter: brightness(0) invert(1) !important;
  }
  html body .portal-admin .sidebar-brand strong,
  html body .portal-admin .sidebar-user strong {
    color: #fff !important;
  }
  html body .portal-admin .sidebar-brand small,
  html body .portal-admin .sidebar-user small,
  html body .portal-admin .sidebar-section-label {
    color: rgba(255,255,255,.65) !important;
  }
  html body .portal-admin .primary-nav a::before { display:none !important; }
  html body .portal-admin .primary-nav .lv-nav-direct,
  html body .portal-admin .primary-nav .lv-nav-group-button,
  html body .portal-admin .primary-nav .lv-nav-children > a {
    color: rgba(255,255,255,.90) !important;
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }
  html body .portal-admin .primary-nav .lv-nav-direct:hover,
  html body .portal-admin .primary-nav .lv-nav-group-button:hover,
  html body .portal-admin .primary-nav .lv-nav-group-button.active,
  html body .portal-admin .primary-nav .lv-nav-children > a:hover {
    color: #fff !important;
    background: rgba(255,255,255,.11) !important;
    border-color: rgba(255,255,255,.07) !important;
  }
  html body .portal-admin .primary-nav .lv-nav-direct.active,
  html body .portal-admin .primary-nav .lv-nav-direct[aria-current="page"] {
    color: #b20e15 !important;
    background: #fff !important;
    border-color: #fff !important;
    box-shadow: 0 10px 24px rgba(84,0,4,.18) !important;
  }
  html body .portal-admin .primary-nav .lv-nav-children > a.active,
  html body .portal-admin .primary-nav .lv-nav-children > a[aria-current="page"] {
    color: #fff !important;
    background: rgba(255,255,255,.17) !important;
    border-color: rgba(255,255,255,.10) !important;
    box-shadow: inset 3px 0 #fff !important;
  }
  html body .portal-admin .primary-nav :is(.nav-icon,.lv-nav-chevron) { color: currentColor !important; }
  html body .portal-admin .lv-nav-divider { background: rgba(255,255,255,.15) !important; }
  html body .portal-admin .sidebar-footer { border-top-color: rgba(255,255,255,.14) !important; }
  html body .portal-admin .sidebar-footer-account { color: rgba(255,255,255,.92) !important; }
  html body .portal-admin .sidebar-footer-account:hover { background: rgba(255,255,255,.10) !important; }
  html body .portal-admin .sidebar-footer .utility-avatar {
    background: rgba(255,255,255,.15) !important;
    border-color: rgba(255,255,255,.25) !important;
    color: #fff !important;
  }
  html body .portal-admin .primary-nav-inner { scrollbar-color: rgba(255,255,255,.30) transparent !important; }
  html body .portal-admin .primary-nav-inner::-webkit-scrollbar-thumb { background: rgba(255,255,255,.26) !important; }
  html body .portal-admin .utility-bar {
    background: rgba(255,255,255,.985) !important;
    border-bottom: 1px solid #e5e8ec !important;
    box-shadow: 0 3px 18px rgba(34,39,45,.05) !important;
    backdrop-filter: blur(14px) !important;
  }
  html body .portal-admin .global-search,
  html body .portal-admin .notification-button,
  html body .portal-admin .utility-logout {
    background: #f7f8fa !important;
    border-color: #e1e4e8 !important;
    color: #252b33 !important;
  }
  html body .portal-admin .global-search input {
    background: transparent !important;
    color: #252b33 !important;
  }
  html body .portal-admin .global-search input::placeholder { color:#8d949d !important; }
  html body .portal-admin .utility-avatar {
    background: #fff0f1 !important;
    border-color: #f0c9cc !important;
    color: #c8141b !important;
  }
  @media screen and (min-width:901px) {
    html body .portal-admin .global-search { flex: 0 1 370px !important; width: min(370px, 36vw) !important; max-width: 370px !important; }
    html body .portal-admin .utility-items { gap: 10px !important; }
    html body .portal-admin .primary-nav-inner { padding-top: 10px !important; }
  }
  @media screen and (max-width:900px) {
    html body .portal-admin .primary-nav.open {
      background:
        radial-gradient(circle at 18% 4%, rgba(255,255,255,.16), transparent 24%),
        linear-gradient(165deg, #df1922 0%, #bd1018 52%, #90080d 100%) !important;
    }
    html body .portal-admin .admin-mobile-account { border-top-color: rgba(255,255,255,.15) !important; }
    html body .portal-admin .admin-mobile-account button,
    html body .portal-admin .admin-mobile-account a {
      background: rgba(255,255,255,.10) !important;
      border-color: rgba(255,255,255,.15) !important;
      color: #fff !important;
    }
  }
`;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession(["admin", "manager"]);
  const role = String(session.user?.role || session.user?.Role || "").trim().toLowerCase();
  return <>
    <PortalPreloader portal="admin"/>
    <ProjectManagementEnhancements />
    <AdminProjectMapDrawer />
    <ManagementRolePolicyEnforcer role={role} />
    <ManagementShellV3 initialUser={session.user}>{children}</ManagementShellV3>
    <style dangerouslySetInnerHTML={{ __html: ADMIN_CHROME_FIX }} />
    {role === "manager" && <AccountShortcut label="My Account" mobileDock />}
    <AdminMobileDock />
  </>;
}
