import { requirePortalSession } from "@/lib/server-auth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin", "manager", "employee"]);
  return <>{children}</>;
}
