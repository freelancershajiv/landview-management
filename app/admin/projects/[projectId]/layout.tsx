import ProjectWorkspaceNav from "@/components/project-workspace-nav";
import "./project-dashboard-red.css";

export default function ProjectDetailLayout({ children }: { children: React.ReactNode }) {
  return <>
    <ProjectWorkspaceNav />
    {children}
  </>;
}
