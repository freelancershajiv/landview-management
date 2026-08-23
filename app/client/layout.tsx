import RolePortalShell from "@/components/role-portal-shell";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <RolePortalShell portal="client">{children}</RolePortalShell>;
}
