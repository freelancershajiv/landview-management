import { cache } from "react";
import { selectRows } from "@/lib/supabase-data";

export type PublicProjectSeo = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  status?: string;
  area?: string;
  stories?: string;
  completionYear?: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: string[];
  services?: string[];
};

export function normalizePublicImageUrl(url?: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1600`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
    }
  } catch {}
  return value;
}

function splitList(value: unknown) {
  return String(value ?? "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

export const getPublicProjectsForSeo = cache(async function getPublicProjectsForSeo(): Promise<PublicProjectSeo[]> {
  try {
    const rows = await selectRows("projects", {
      filters: { public_display: true },
      order: "public_display_order:asc,updated_at:desc",
      limit: 1000,
    });
    return rows.map((row: any) => ({
      projectId: String(row.project_code || ""),
      title: String(row.public_project_title || row.project_name || row.project_code || ""),
      category: String(row.project_category || row.project_type || ""),
      location: String(row.location || ""),
      status: String(row.status || ""),
      area: String(row.project_area_text || row.plot_area || ""),
      stories: String(row.number_of_stories_text || row.floors || ""),
      completionYear: String(row.completion_year || ""),
      description: String(row.public_description || ""),
      coverImageUrl: String(row.cover_image_url || ""),
      galleryImages: splitList(row.gallery_images),
      services: splitList(row.public_services),
    }));
  } catch (error) {
    console.warn("LAND VIEW public projects Supabase read failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return [];
  }
});

export async function getPublicProjectForSeo(projectId: string) {
  const id = decodeURIComponent(String(projectId || "")).trim();
  if (!id) return null;
  const projects = await getPublicProjectsForSeo();
  return projects.find((project) => String(project.projectId || "").trim() === id) || null;
}
