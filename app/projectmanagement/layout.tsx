import AdminMobileDock from "@/components/admin-mobile-dock";
import ManagementShellV2 from "@/components/management-shell-v2";
import ProjectFinanceAdminModule from "@/components/project-finance-admin-module";
import ProjectFinanceRouteController from "@/components/project-finance-route-controller";
import { requirePortalSession } from "@/lib/server-auth";
import "../admin/admin-brand-theme.css";
import "../admin/admin-layout-polish.css";
import "../admin/admin-theme-consistency.css";
import "../admin/admin-mobile-redesign.css";
import "../admin/admin-mobile-shell-final.css";
import "../admin/admin-dashboard-light.css";
import "../admin/admin-color-harmony.css";
import "./project-finance-redesign.css";
import "./project-finance-navigation.css";
import "./project-finance-admin-module.css";
import "./project-finance-color-harmony.css";

export default async function ProjectFinanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requirePortalSession(["admin", "manager", "client"]);
  const role = String(session.role || session.user?.role || session.user?.Role || "").trim().toLowerCase();

  if (role === "client") {
    return (
      <div className="pf-redesign">
        <ProjectFinanceRouteController />
        {children}
      </div>
    );
  }

  return (
    <>
      <ManagementShellV2 initialUser={session.user}>
        <div className="pf-redesign pf-management-shell">
          <ProjectFinanceRouteController />
          <ProjectFinanceAdminModule />
          {children}
        </div>
      </ManagementShellV2>
      <AdminMobileDock />
    </>
  );
}
