import "./redesign.css";
import ProjectManagementLaunchShell from "./ProjectManagementLaunchShell";

export default function ProjectManagementLayout({ children }: { children: React.ReactNode }) {
  return <div className="pm-redesign-scope"><ProjectManagementLaunchShell>{children}</ProjectManagementLaunchShell></div>;
}
