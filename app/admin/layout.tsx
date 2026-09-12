import AdminShell from "@/components/admin-shell";
import AdminPublicProjectsCard from "@/components/admin-public-projects-card";
import PortalPreloader from "@/components/portal-preloader";
import { requirePortalSession } from "@/lib/server-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin", "manager", "accounts"]);
  return (
    <>
      <PortalPreloader portal="admin" />
      <AdminShell>
        <AdminPublicProjectsCard />
        {children}
      </AdminShell>
    </>
  );
}
