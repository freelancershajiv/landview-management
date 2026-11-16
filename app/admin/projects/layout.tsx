import Link from "next/link";
import ProjectLegacyNavigation from "./project-legacy-navigation";
import "./projects-navigation.css";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <div>
    <ProjectLegacyNavigation />
    <nav className="projects-section-nav" aria-label="Project management">
      <Link className="projects-section-link" href="/admin/projects">Projects</Link>
      <Link className="projects-section-link primary" href="/admin/projects/new">+ New Project</Link>
      <Link className="projects-section-link missing" href="/admin/projects/missing-serials">Missing Serials</Link>
      <Link className="projects-section-link" href="/admin/projects/locations">Locations</Link>
      <Link className="projects-section-link website" href="/admin/projects/website-readiness">Website Readiness</Link>
      <Link className="projects-section-link website" href="/admin/projects/website-curation">Website Curation</Link>
      <Link className="projects-section-link website" href="/admin/website-leads">Website Enquiries</Link>
      <Link className="projects-section-link" href="/admin/projects/legacy">Legacy Registration</Link>
      <Link className="projects-section-link" href="/admin/projects/reclassify">Move to Proposals</Link>
    </nav>
    {children}
  </div>;
}