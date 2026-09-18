import ManagementShellV2 from "@/components/management-shell-v2";
import PortalPreloader from "@/components/portal-preloader";
import ProjectManagementEnhancements from "@/components/project-management-enhancements";
import { requirePortalSession } from "@/lib/server-auth";
import "./admin-brand-theme.css";
import "./admin-layout-polish.css";
import "./finance/invoices/invoice-revamp-print-fix.css";
import "./finance/invoices/invoice-column-alignment-fix.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePortalSession(["admin", "manager", "accounts"]);
  return <>
    <PortalPreloader portal="admin"/>
    <ProjectManagementEnhancements />
    <style>{`
      a[href="/admin/projects/new"],a[href="/admin/public-projects"]{display:none!important}
      .primary-nav a[href="/admin/accounts/entry"]{display:none!important}
      .primary-nav a[href="/admin/finance"],.primary-nav a[href="/admin/accounts"]{font-size:0}
      .primary-nav a[href="/admin/finance"]::after{content:"Billing";font-size:12px}
      .primary-nav a[href="/admin/accounts"]::after{content:"Accounts";font-size:12px}
    `}</style>
    <ManagementShellV2 initialUser={session.user}>{children}</ManagementShellV2>
  </>;
}
