import type { MetadataRoute } from "next";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { publicServices } from "@/lib/public-services";

export const dynamic = "force-dynamic";

const baseUrl = "https://www.landview.com.bd";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let projects: Awaited<ReturnType<typeof getPublicProjectsForSeo>> = [];

  // The static/service sitemap must remain available even if the public
  // projects backend is temporarily unavailable.
  try {
    projects = await getPublicProjectsForSeo();
  } catch (error) {
    console.error("Sitemap project fetch failed:", error);
  }

  const projectEntries: MetadataRoute.Sitemap = projects
    .filter((project) => String(project.projectId || "").trim())
    .map((project) => ({
      url: `${baseUrl}/projects/${encodeURIComponent(String(project.projectId))}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: project.coverImageUrl ? [String(project.coverImageUrl)] : undefined,
    }));

  const serviceEntries: MetadataRoute.Sitemap = publicServices.map((service) => ({
    url: `${baseUrl}/services/${service.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.85,
  }));

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/bn`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/services`, changeFrequency: "monthly", priority: 0.95 },
    ...serviceEntries,
    { url: `${baseUrl}/contact`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/team`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/projects`, changeFrequency: "weekly", priority: 0.9 },
    ...projectEntries,
  ];
}
