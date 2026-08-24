import type { MetadataRoute } from "next";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { publicServices } from "@/lib/public-services";

const baseUrl = "https://landview.com.bd";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await getPublicProjectsForSeo();

  const projectEntries: MetadataRoute.Sitemap = projects
    .filter((project) => String(project.projectId || "").trim())
    .map((project) => ({
      url: `${baseUrl}/projects/${encodeURIComponent(String(project.projectId))}`,
      lastModified: project.completionYear
        ? new Date(`${project.completionYear}-01-01`)
        : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: project.coverImageUrl ? [String(project.coverImageUrl)] : undefined,
    }));

  const serviceEntries: MetadataRoute.Sitemap = publicServices.map((service) => ({
    url: `${baseUrl}/services/${service.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.85,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/services`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.95,
    },
    ...serviceEntries,
    {
      url: `${baseUrl}/projects`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...projectEntries,
  ];
}
