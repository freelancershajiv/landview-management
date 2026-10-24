import type { Metadata } from "next";
import Link from "next/link";
import PublicProjectListPaginated from "@/components/public-project-list-paginated";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import "./projects-v2.css";
import "./case-studies-link.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Architecture & Engineering Projects in Bangladesh | LAND VIEW",
  description: "Explore public LAND VIEW architecture and engineering projects by category, stage, district and consultancy service, with project images, location information and project details.",
  alternates: { canonical: "/projects" },
  openGraph: {
    title: "LAND VIEW Architecture & Engineering Projects",
    description: "Explore selected public architecture, engineering and construction-stage projects from LAND VIEW Engineers & Architects.",
    url: "https://www.landview.com.bd/projects",
    type: "website",
  },
};

export default async function ProjectsPage() {
  const projects = await getPublicProjectsForSeo();
  const hasMappedProjects = projects.some((project) => project.mapEnabled === true);

  return <>
    <PublicProjectListPaginated initialProjects={projects} />
    <Link className="pv2-map-fab pv2-case-fab" href="/case-studies" aria-label="Open selected LAND VIEW project case studies"><span aria-hidden="true">◆</span> Case Studies</Link>
    {hasMappedProjects && <Link className="pv2-map-fab" href="/projects/map" aria-label="Open interactive project map"><span aria-hidden="true">⌖</span> Project Map</Link>}
  </>;
}