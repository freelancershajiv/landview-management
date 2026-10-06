import { NextResponse } from "next/server";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [projects, rows] = await Promise.all([
      getPublicProjectsForSeo(),
      selectRows("projects", {
        filters: { public_display: true },
        select: "project_code,website_featured,website_featured_order,public_display_order,public_project_title",
        order: "website_featured_order:asc,public_display_order:asc,updated_at:desc",
        limit: 2000,
      }),
    ]);
    const raw = new Map(rows.map((row: any) => [String(row.project_code || ""), row]));
    const enriched = projects.map((project) => {
      const row: any = raw.get(String(project.projectId || "")) || {};
      const hasPublicTitle = Boolean(String(row.public_project_title || "").trim());
      const fallbackPlace = project.district || project.upazilaThana || project.location || "Bangladesh";
      const displayTitle = hasPublicTitle ? project.title : `${project.category || "Building"} Project · ${fallbackPlace}`;
      return {
        ...project,
        displayTitle,
        websiteFeatured: Boolean(row.website_featured),
        websiteFeaturedOrder: Number(row.website_featured_order || 0),
        publicDisplayOrder: Number(row.public_display_order || 0),
      };
    }).filter((project) => project.projectId && project.category && project.displayTitle);

    const curated = enriched.filter((project) => project.websiteFeatured).sort((a, b) => {
      const order = a.websiteFeaturedOrder - b.websiteFeaturedOrder;
      if (order) return order;
      return Number(b.publicReadiness || 0) - Number(a.publicReadiness || 0);
    });

    const automatic = enriched.filter((project) => !project.websiteFeatured).sort((a, b) => {
      const cover = Number(Boolean(b.coverImageUrl)) - Number(Boolean(a.coverImageUrl));
      if (cover) return cover;
      const score = Number(b.publicReadiness || 0) - Number(a.publicReadiness || 0);
      if (score) return score;
      return a.publicDisplayOrder - b.publicDisplayOrder;
    });

    const selected = [...curated, ...automatic].slice(0, 6).map((project) => ({
      projectId: project.projectId,
      title: project.displayTitle,
      category: project.category,
      location: project.location,
      currentStage: project.currentStage,
      area: project.area,
      stories: project.stories,
      coverImageUrl: project.coverImageUrl,
      services: project.services,
      publicReadiness: project.publicReadiness,
      curated: project.websiteFeatured,
    }));

    return NextResponse.json({ success: true, data: selected }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load featured projects." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
