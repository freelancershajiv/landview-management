import ManagementScorecard from "@/components/management-scorecard";
import { requirePortalSession } from "@/lib/server-auth";

export default async function ManagementAnalyticsPage() {
  await requirePortalSession(["admin", "manager"]);
  return <ManagementScorecard />;
}
