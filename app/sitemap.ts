import type { MetadataRoute } from "next";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { publicServices } from "@/lib/public-services";

const baseUrl = "https://www.landview.com.bd";

function safeProjectLastModified(value: unknown): Date | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  // Accept a clean four-digit year without allowing malformed project data
  // to make the entire sitemap return HTTP 500.
  const yearMatch = raw.match(/^(19|20)\d{2}$/);
  if (yearMatch) {
    const date = new Date(`${raw}-01-01T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

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
    .map((project) => {
      const lastModified = safeProjectLastModified(project.completionYear);
      return {
        url: `${baseUrl}/projects/${encodeURIComponent(String(project.projectId))}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "monthly" as const,
        priority: 0.8,
        images: project.coverImageUrl ? [String(project.coverImageUrl)] : undefined,
      };
    });

  const serviceEntries: MetadataRoute.Sitemap = publicServices.map((service) => ({
    url: `${baseUrl}/services/${service.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.85,
  }));

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/services`, changeFrequency: "monthly", priority: 0.95 },
    ...serviceEntries,
    { url: `${baseUrl}/projects`, changeFrequency: "weekly", priority: 0.9 },
    ...projectEntries,
  ];
}
