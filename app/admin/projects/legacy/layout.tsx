import ProjectRegistrationLocationBridge from "@/components/project-registration-location-bridge";
import ProjectLegacyLocationCleanup from "@/components/project-legacy-location-cleanup";

export default function LegacyProjectRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <ProjectRegistrationLocationBridge mode="legacy"><ProjectLegacyLocationCleanup />{children}</ProjectRegistrationLocationBridge>;
}
