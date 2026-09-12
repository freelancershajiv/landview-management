import AdminShell from "@/components/admin-shell";
import PortalPreloader from "@/components/portal-preloader";
import { requirePortalSession } from "@/lib/server-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin", "manager", "accounts"]);
  return (
    <>
      <PortalPreloader portal="admin" />
      <style>{`a[href="/admin/projects/new"],a[href="/admin/public-projects"]{display:none!important}`}</style>
      <AdminShell>{children}</AdminShell>
    </>
  );
}
