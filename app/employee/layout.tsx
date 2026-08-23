import RolePortalShell from "@/components/role-portal-shell";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <RolePortalShell portal="employee">{children}</RolePortalShell>;
}
