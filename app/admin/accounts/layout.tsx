"use client";

import { usePathname } from "next/navigation";
import ReconciledLedgerPanel from "@/components/reconciled-ledger-panel";

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/accounts") return <ReconciledLedgerPanel />;
  return <>{children}</>;
}
