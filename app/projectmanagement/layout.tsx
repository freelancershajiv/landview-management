import AdminMobileDock from "@/components/admin-mobile-dock";
import ManagementShellV5 from "@/components/management-shell-v5";
import RolePortalShell from "@/components/role-portal-shell";
import ProjectFinanceAdminModule from "@/components/project-finance-admin-module";
import ProjectFinanceRouteController from "@/components/project-finance-route-controller";
import ProjectFinancePartyEnhancer from "@/components/project-finance-party-enhancer";
import ProjectFinanceSummaryV2 from "@/components/project-finance-summary-v2";
import ProjectFinanceLocalDate from "@/components/project-finance-local-date";
import ProjectFinanceSafeEdit from "@/components/project-finance-safe-edit";
import ProjectFinanceExpensePartySelect from "@/components/project-finance-expense-party-select";
import ProjectFinanceCategoryTotalStrip from "@/components/project-finance-category-total-strip";
import { requirePortalSession } from "@/lib/server-auth";
import "../admin/admin-brand-theme.css";
import "../admin/admin-layout-polish.css";
import "../admin/admin-theme-consistency.css";
import "../admin/admin-dashboard-light.css";
import "../admin/admin-color-harmony.css";
import "./project-finance-redesign.css";
import "./project-finance-navigation.css";
import "./project-finance-admin-module.css";
import "./project-finance-color-harmony.css";
import "../dual-mode-navigation.css";
import "./project-finance-dual-mode-polish.css";
import "./project-finance-party-dropdown.css";
import "./project-finance-readable-summary.css";
import "./project-finance-summary-v2.css";
// Project Management shares the same authoritative Admin mobile shell as /admin.
import "../admin/admin-mobile-authority.css";
// Route-specific finance geometry remains authoritative for narrow screens.
import "./project-finance-mobile-authority.css";
// Re-assert shared contrast/brightness tokens after finance-specific legacy layers.
import "../color-system-authority.css";
// Nested Project Management CSS can otherwise reset the user-selected deeper LAND VIEW red.
import "../darker-brand-red.css";
// Final Project Management-only authority: surfaces, active states, controls and finance semantics.
import "./project-finance-theme-authority.css";
// Component-local chooser styles are emitted later; this uses !important theme tokens to normalize them.
import "./project-finance-selector-theme.css";

export default async function ProjectFinanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requirePortalSession(["admin", "manager", "client"]);
  const role = String(session.role || session.user?.role || session.user?.Role || "").trim().toLowerCase();

  const clientFinance = (
    <div className="pf-redesign pf-client-shell">
      <ProjectFinanceRouteController />
      <ProjectFinanceSummaryV2 />
      <ProjectFinanceLocalDate />
      <ProjectFinanceCategoryTotalStrip />
      {children}
    </div>
  );

  if (role === "client") {
    return <RolePortalShell portal="client">{clientFinance}</RolePortalShell>;
  }

  return (
    <>
      <ManagementShellV5 initialUser={session.user}>
        <div className="pf-redesign pf-management-shell">
          <ProjectFinancePartyEnhancer />
          <ProjectFinanceRouteController />
          <ProjectFinanceSummaryV2 />
          <ProjectFinanceLocalDate />
          <ProjectFinanceSafeEdit />
          <ProjectFinanceExpensePartySelect />
          <ProjectFinanceCategoryTotalStrip />
          <ProjectFinanceAdminModule />
          {children}
        </div>
      </ManagementShellV5>
      <AdminMobileDock />
    </>
  );
}
