import { getPublicProjectDatabasePage } from "@/lib/public-project-database";
import { getPublicProjectsForSeo, mapPublicProjectRow, type PublicProjectSeo } from "@/lib/public-projects-server";

export type PublicProjectCategoryCount = {
  name: string;
  count: number;
};

export type PublicProjectPage = {
  data: PublicProjectSeo[];
  offset: number;
  limit: number;
  total: number;
  publishedTotal: number;
  hasMore: boolean;
  categories: PublicProjectCategoryCount[];
  hasMappedProjects: boolean;
};

function searchableProjectText(project: PublicProjectSeo) {
  return [
    project.projectId,
    project.title,
    project.category,
    project.location,
    project.currentStage,
    project.area,
    project.stories,
    project.completionYear,
    project.description,
    ...(project.services || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function fallbackPublicProjectPage(input: {
  offset: number;
  limit: number;
  query: string;
  category: string;
}): Promise<PublicProjectPage> {
  const projects = await getPublicProjectsForSeo();
  const categoryCounts = new Map<string, number>();
  for (const project of projects) {
    const value = String(project.category || "").trim();
    if (value) categoryCounts.set(value, (categoryCounts.get(value) || 0) + 1);
  }

  const filtered = projects.filter((project) => {
    if (input.category && input.category !== "All" && String(project.category || "").trim() !== input.category) return false;
    if (input.query && !searchableProjectText(project).includes(input.query)) return false;
    return true;
  });
  const data = filtered.slice(input.offset, input.offset + input.limit);
  const categories = Array.from(categoryCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    data,
    offset: input.offset,
    limit: input.limit,
    total: filtered.length,
    publishedTotal: projects.length,
    hasMore: input.offset + data.length < filtered.length,
    categories,
    hasMappedProjects: projects.some((project) => project.mapEnabled === true),
  };
}

export async function getPublicProjectPage(input: {
  offset?: number;
  limit?: number;
  query?: string;
  category?: string;
} = {}): Promise<PublicProjectPage> {
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const limit = Math.min(24, Math.max(1, Math.floor(Number(input.limit) || 12)));
  const query = String(input.query || "").trim().toLowerCase();
  const category = String(input.category || "").trim();

  try {
    const page = await getPublicProjectDatabasePage({ offset, limit, query, category });
    const data = await Promise.all(page.data.map(mapPublicProjectRow));
    return {
      data,
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      publishedTotal: page.publishedTotal,
      hasMore: page.hasMore,
      categories: page.categories,
      hasMappedProjects: page.hasMappedProjects,
    };
  } catch (error) {
    console.warn("LAND VIEW database-backed project pagination failed; using compatibility fallback", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return await fallbackPublicProjectPage({ offset, limit, query, category });
  }
}
