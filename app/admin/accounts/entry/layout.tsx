import { requirePortalSession } from "@/lib/server-auth";

export default async function AccountsEntryLayout({ children }: { children: React.ReactNode }) {
  await requirePortalSession(["admin"]);
  return children;
}
