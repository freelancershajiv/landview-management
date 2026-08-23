import type { Metadata } from "next";
import RolePortalShell from "@/components/role-portal-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <RolePortalShell portal="employee">{children}</RolePortalShell>;
}
