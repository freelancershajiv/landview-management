import SystemControlCenter from "@/components/system-control-center";
import { requirePortalSession } from "@/lib/server-auth";

export default async function SystemControlPage() {
  await requirePortalSession(["admin"]);
  return <SystemControlCenter />;
}
