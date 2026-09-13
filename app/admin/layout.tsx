import AdminShell from "@/components/admin-shell";
import AdminControlLinks from "@/components/admin-control-links";
import AccountsStatusPanel from "@/components/accounts-status-panel";
import PortalPreloader from "@/components/portal-preloader";
import { requirePortalSession } from "@/lib/server-auth";
import "./accounts-ledger-overrides.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin", "manager", "accounts"]);
  return (
    <>
      <PortalPreloader portal="admin" />
      <style>{`a[href="/admin/projects/new"],a[href="/admin/public-projects"]{display:none!important}`}</style>
      <AdminShell>
        <AdminControlLinks />
        <AccountsStatusPanel />
        {children}
      </AdminShell>
    </>
  );
}
