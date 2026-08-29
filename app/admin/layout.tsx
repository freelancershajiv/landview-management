import AdminShell from "@/components/admin-shell";
import { requirePortalSession } from "@/lib/server-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin", "manager", "accounts"]);
  return <AdminShell>{children}</AdminShell>;
}
