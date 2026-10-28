import ProjectRegistrationLocationBridge from "@/components/project-registration-location-bridge";
import ProjectNewLocationCleanup from "@/components/project-new-location-cleanup";

export default function NewProjectRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <ProjectRegistrationLocationBridge mode="new"><ProjectNewLocationCleanup />{children}</ProjectRegistrationLocationBridge>;
}
