import { cache } from "react";
import { mapPublicProjectRow, type PublicProjectSeo } from "@/lib/public-projects-server";
import { selectRows } from "@/lib/supabase-data";

export type PublicCaseStudy = PublicProjectSeo & {
  websiteFeaturedOrder?: number;
};

export const getPublicCaseStudies = cache(async function getPublicCaseStudies(): Promise<PublicCaseStudy[]> {
  try {
    const rows = await selectRows("projects", {
      filters: { public_display: true, website_featured: true },
      order: "website_featured_order:asc,public_display_order:asc,updated_at:desc",
      limit: 100,
    });
    const studies = await Promise.all(rows.map(async (row: Record<string, unknown>) => ({
      ...(await mapPublicProjectRow(row)),
      websiteFeaturedOrder: Number(row.website_featured_order || 0),
    })));
    return studies.filter((project) => project.projectId && project.title);
  } catch (error) {
    console.warn("LAND VIEW public case studies read failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return [];
  }
});
