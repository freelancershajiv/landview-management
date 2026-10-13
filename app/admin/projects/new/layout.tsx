import ProjectRegistrationLocationBridge from "@/components/project-registration-location-bridge";

export default function NewProjectRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <ProjectRegistrationLocationBridge mode="new">{children}</ProjectRegistrationLocationBridge>;
}
