import PublicProjectList from "@/components/public-project-list";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
export const dynamic = "force-dynamic";
export default async function ProjectsPage() {
  return <PublicProjectList initialProjects={await getPublicProjectsForSeo()} />;
}
