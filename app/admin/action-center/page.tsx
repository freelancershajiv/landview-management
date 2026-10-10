import AdminActionCenter from "@/components/admin-action-center";
import { requirePortalCapability } from "@/lib/permission-guard-server";

export default async function ActionCenterPage() {
  await requirePortalCapability("systemHealth.view");
  return (
    <div style={{ paddingBottom: 36 }}>
      <AdminActionCenter />
    </div>
  );
}
