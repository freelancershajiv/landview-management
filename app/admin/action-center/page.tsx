import AdminActionCenter from "@/components/admin-action-center";
import { requirePortalSession } from "@/lib/server-auth";

export default async function ActionCenterPage() {
  await requirePortalSession(["admin", "manager"]);
  return (
    <div style={{ paddingBottom: 36 }}>
      <AdminActionCenter />
    </div>
  );
}
