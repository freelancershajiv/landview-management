import { requirePortalSession } from "@/lib/server-auth";

export default async function WebsiteAnalyticsLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin"]);
  return children;
}
