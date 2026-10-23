import type { Metadata } from "next";
import PublicProjectDetail from "@/components/public-project-detail";
import { getPublicProjectForSeo, getPublicProjectsForSeo, type PublicProjectSeo } from "@/lib/public-projects-server";
import "../projects-v2.css";

type PageProps = { params: Promise<{ projectId: string }> };

function relatedScore(project: PublicProjectSeo, candidate: PublicProjectSeo) {
  let score = 0;
  if (project.category && candidate.category === project.category) score += 4;
  if (project.district && candidate.district === project.district) score += 3;
  if (project.currentStage && candidate.currentStage === project.currentStage) score += 1;
  const services = new Set((project.services || []).map((item) => item.toLowerCase()));
  for (const item of candidate.services || []) if (services.has(item.toLowerCase())) score += 2;
  if (candidate.coverImageUrl) score += 1;
  return score;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getPublicProjectForSeo(projectId);
  if (!project) return { title: "Project | LAND VIEW" };
  const title = project.title || project.projectId || "LAND VIEW Project";
  const description = project.description || [project.category, project.stories ? `${project.stories} storeys` : "", project.location, project.services?.length ? `LAND VIEW services: ${project.services.join(", ")}` : ""].filter(Boolean).join(" · ");
  const canonical = `/projects/${encodeURIComponent(String(project.projectId || projectId))}`;
  return {
    title: `${title} | LAND VIEW Project`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | LAND VIEW Engineers & Architects`,
      description,
      url: `https://www.landview.com.bd${canonical}`,
      type: "article",
      images: project.coverImageUrl ? [{ url: project.coverImageUrl, alt: title }] : undefined,
    },
  };
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const [project, projects] = await Promise.all([getPublicProjectForSeo(projectId), getPublicProjectsForSeo()]);
  const relatedProjects = project
    ? projects
        .filter((candidate) => candidate.projectId !== project.projectId)
        .map((candidate) => ({ candidate, score: relatedScore(project, candidate) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((item) => item.candidate)
    : [];

  return <PublicProjectDetail key={projectId} initialProject={project} relatedProjects={relatedProjects} />;
}
