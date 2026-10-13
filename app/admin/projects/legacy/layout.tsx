import ProjectRegistrationLocationBridge from "@/components/project-registration-location-bridge";

export default function LegacyProjectRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <ProjectRegistrationLocationBridge mode="legacy">{children}</ProjectRegistrationLocationBridge>;
}
