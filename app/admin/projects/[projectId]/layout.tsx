import ProjectContextBar from "@/components/project-context-bar";
import ProjectWorkspaceNav from "@/components/project-workspace-nav";
import ProjectPublicPortfolioShortcut from "@/components/project-public-portfolio-shortcut";
import "./project-dashboard-red.css";
import "./public-portfolio-centralization.css";

export default function ProjectDetailLayout({ children }: { children: React.ReactNode }) {
  return <>
    <ProjectWorkspaceNav />
    <ProjectContextBar />
    <ProjectPublicPortfolioShortcut />
    {children}
  </>;
}
