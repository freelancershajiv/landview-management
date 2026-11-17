import type { MetadataRoute } from "next";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";

export const dynamic = "force-dynamic";
const baseUrl = "https://www.landview.com.bd";

// Next.js 16.3.3 writes sitemap image URLs into XML verbatim. In particular,
// Google Drive thumbnail URLs contain query parameter separators such as
// "&sz=w1600"; without XML escaping, Search Console cannot parse the file.
// Escape XML text content, not the actual target URL the browser will request.
export function escapeXmlSitemapText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    return escapeXmlSitemapText(parsed.toString());
  } catch {
    return undefined;
  }
}

// Published portfolio URLs are separate from the stable main sitemap.
// Include all intentionally published projects, without exposing private
// finance/project-management records or altering project image storage.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await getPublicProjectsForSeo();
  return projects
    .filter((project) => String(project.projectId || "").trim())
    .map((project) => {
      const image = sitemapImageUrl(project.coverImageUrl);
      return {
        url: `${baseUrl}/projects/${encodeURIComponent(String(project.projectId))}`,
        changeFrequency: "monthly" as const,
        priority: project.publicReady ? 0.8 : 0.6,
        images: image ? [image] : undefined,
      };
    });
}
