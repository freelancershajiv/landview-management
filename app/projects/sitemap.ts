import type { MetadataRoute } from "next";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";

export const dynamic = "force-dynamic";
const baseUrl = "https://www.landview.com.bd";

// Published portfolio URLs are separate from the stable main sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await getPublicProjectsForSeo();
  return projects
    .filter((project) => String(project.projectId || "").trim())
    .map((project) => ({
      url: `${baseUrl}/projects/${encodeURIComponent(String(project.projectId))}`,
      changeFrequency: "monthly" as const,
      priority: project.publicReady ? 0.8 : 0.6,
      images: project.coverImageUrl ? [String(project.coverImageUrl)] : undefined,
    }));
}
