import { getPublicProjectsForSeo, type PublicProjectSeo } from "@/lib/public-projects-server";

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

export async function getPublicProjectPage(input: {
  offset?: number;
  limit?: number;
  query?: string;
  category?: string;
} = {}): Promise<PublicProjectPage> {
  const projects = await getPublicProjectsForSeo();
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const limit = Math.min(24, Math.max(1, Math.floor(Number(input.limit) || 12)));
  const query = String(input.query || "").trim().toLowerCase();
  const category = String(input.category || "").trim();

  const categoryCounts = new Map<string, number>();
  for (const project of projects) {
    const value = String(project.category || "").trim();
    if (value) categoryCounts.set(value, (categoryCounts.get(value) || 0) + 1);
  }

  const filtered = projects.filter((project) => {
    if (category && category !== "All" && String(project.category || "").trim() !== category) return false;
    if (query && !searchableProjectText(project).includes(query)) return false;
    return true;
  });

  const data = filtered.slice(offset, offset + limit);
  const categories = Array.from(categoryCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    data,
    offset,
    limit,
    total: filtered.length,
    publishedTotal: projects.length,
    hasMore: offset + data.length < filtered.length,
    categories,
    hasMappedProjects: projects.some((project) => project.mapEnabled === true),
  };
}
