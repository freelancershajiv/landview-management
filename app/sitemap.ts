import type { MetadataRoute } from "next";
import { publicServices } from "@/lib/public-services";

const baseUrl = "https://www.landview.com.bd";

// Always-available core sitemap, independent of the projects database.
export default function sitemap(): MetadataRoute.Sitemap {
  const serviceEntries: MetadataRoute.Sitemap = publicServices.map((service) => ({
    url: `${baseUrl}/services/${service.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/bn`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${baseUrl}/feni`, changeFrequency: "monthly", priority: 0.95 },
    { url: `${baseUrl}/guides/building-design-feni`, changeFrequency: "monthly", priority: 0.75 },
    { url: `${baseUrl}/services`, changeFrequency: "monthly", priority: 0.9 },
    ...serviceEntries,
    { url: `${baseUrl}/contact`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/team`, changeFrequency: "monthly", priority: 0.75 },
    { url: `${baseUrl}/projects`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/projects/map`, changeFrequency: "weekly", priority: 0.75 },
    { url: `${baseUrl}/case-studies`, changeFrequency: "monthly", priority: 0.85 },
  ];
}
