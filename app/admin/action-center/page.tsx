import BillingExceptionQueue from "@/components/billing-exception-queue";
import AdminTaskResponsibilityCenter from "@/components/admin-task-responsibility-center";
import AdminActionCenter from "@/components/admin-action-center";
import { requirePortalSession } from "@/lib/server-auth";

export default async function ActionCenterPage() {
  await requirePortalSession(["admin", "manager"]);
  return (
    <div style={{ paddingBottom: 36 }}>
      <BillingExceptionQueue />
      <AdminTaskResponsibilityCenter />
      <AdminActionCenter />
    </div>
  );
}
