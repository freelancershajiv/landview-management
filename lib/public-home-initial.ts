import { unstable_cache } from "next/cache";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { getPublicTeamForSeo } from "@/lib/public-team-server";
import { getWebsiteContent } from "@/lib/website-content-server";

// These sources contain only published public website data. Never share this
// cache with the authenticated project, payment, or administration APIs.
const loadPublicHomeSnapshot = unstable_cache(async () => {
  const [allProjects, allTeam, content] = await Promise.all([
    getPublicProjectsForSeo(),
    getPublicTeamForSeo(),
    getWebsiteContent(),
  ]);
  const ready = allProjects.filter((project) => project.coverImageUrl && project.publicReady !== false);
  const withImages = allProjects.filter((project) => project.coverImageUrl && project.publicReady === false);
  const withoutImages = allProjects.filter((project) => !project.coverImageUrl);
  // Only the six candidates actually needed for the hero/featured section are
  // serialized to the browser; the full project list stays on the server.
  const projects = [...ready, ...withImages, ...withoutImages].slice(0, 6).map((project) => ({
    projectId: project.projectId,
    title: project.title,
    category: project.category,
    location: project.location,
    district: project.district,
    currentStage: project.currentStage,
    stories: project.stories,
    description: project.description,
    coverImageUrl: project.coverImageUrl,
    services: project.services,
    mapEnabled: project.mapEnabled,
    publicReady: project.publicReady,
  }));
  const team = allTeam.slice(0, 6).map((member) => ({
    name: member.name,
    title: member.title,
    designation: member.designation,
    position: member.position,
    department: member.department,
    speciality: member.speciality,
    specialities: member.specialities,
    photoUrl: member.photoUrl,
  }));
  const summary = {
    projects: allProjects.length,
    active: allProjects.filter((project) => project.currentStage && project.currentStage !== "Completed").length,
    mapped: allProjects.filter((project) => project.mapEnabled).length,
    districts: new Set(allProjects.map((project) => String(project.district || "").trim()).filter(Boolean)).size,
  };
  return { initialProjects: projects, initialTeam: team, initialContent: content, initialSummary: summary };
}, ["landview-public-home-v6"], { revalidate: 60 });

export async function getPublicHomeInitialData() {
  try {
    return await loadPublicHomeSnapshot();
  } catch (error) {
    // The client-side public API fallback remains available when the upstream
    // Supabase service or cache is temporarily unavailable.
    console.warn("LAND VIEW public homepage snapshot unavailable", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return null;
  }
}
