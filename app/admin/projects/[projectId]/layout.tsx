import ProjectWorkspaceNav from "@/components/project-workspace-nav";

export default function ProjectDetailLayout({ children }: { children: React.ReactNode }) {
  return <>
    <ProjectWorkspaceNav />
    {children}
  </>;
}
