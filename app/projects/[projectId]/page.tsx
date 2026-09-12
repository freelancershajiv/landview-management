import PublicProjectDetail from "@/components/public-project-detail";
import { getPublicProjectForSeo } from "@/lib/public-projects-server";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <PublicProjectDetail key={projectId} initialProject={await getPublicProjectForSeo(projectId)} />;
}
