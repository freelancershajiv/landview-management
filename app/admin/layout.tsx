import ManagementShellV2 from "@/components/management-shell-v2";
import PortalPreloader from "@/components/portal-preloader";
import { requirePortalSession } from "@/lib/server-auth";
import "./admin-brand-theme.css";
import "./admin-layout-polish.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin", "manager", "accounts", "employee"]);
  return <><PortalPreloader portal="admin"/><style>{`a[href="/admin/projects/new"],a[href="/admin/public-projects"]{display:none!important}`}</style><ManagementShellV2>{children}</ManagementShellV2></>;
}
