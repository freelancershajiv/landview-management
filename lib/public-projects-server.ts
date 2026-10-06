import { cache } from "react";
import { selectRows } from "@/lib/supabase-data";
import { looksLikeGoogleMapsLocation, parseGoogleMapsCoordinates, resolveGoogleMapsLocation } from "@/lib/google-maps-location";

export type PublicProjectSeo = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  currentStage?: string;
  area?: string;
  stories?: string;
  completionYear?: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: string[];
  services?: string[];
  mapEnabled?: boolean;
  mapLatitude?: number;
  mapLongitude?: number;
  mapPrecision?: "exact" | "approximate";
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

function validCoordinates(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

async function locationTagCoordinates(row: any) {
  const locationTag = String(row.location_tag || "").trim();
  if (!locationTag) return null;

  const direct = parseGoogleMapsCoordinates(locationTag);
  if (direct) return { latitude: direct.latitude, longitude: direct.longitude };

  if (!looksLikeGoogleMapsLocation(locationTag)) return null;
  try {
    const resolved = await resolveGoogleMapsLocation(locationTag);
    return resolved ? { latitude: resolved.latitude, longitude: resolved.longitude } : null;
  } catch {
    return null;
  }
}

async function publicMap(row: any) {
  if (row.public_map_enabled !== true) return {};

  // Location Tag is the source of truth for the public map. Site coordinates are
  // kept only as a resilient fallback because they are themselves synchronized
  // from the Location Tag when a project is saved.
  const fromTag = await locationTagCoordinates(row);
  const fromSite = validCoordinates(row.site_latitude, row.site_longitude);
  const fromLegacyPublic = validCoordinates(row.public_map_latitude, row.public_map_longitude);
  const source = fromTag || fromSite || fromLegacyPublic;
  if (!source) return {};

  const precision: "exact" | "approximate" = row.public_map_precision === "exact" ? "exact" : "approximate";
  return {
    mapEnabled: true,
    mapPrecision: precision,
    mapLatitude: precision === "exact" ? Number(source.latitude.toFixed(6)) : Number(source.latitude.toFixed(2)),
    mapLongitude: precision === "exact" ? Number(source.longitude.toFixed(6)) : Number(source.longitude.toFixed(2)),
  };
}

export const getPublicProjectsForSeo = cache(async function getPublicProjectsForSeo(): Promise<PublicProjectSeo[]> {
  try {
    const rows = await selectRows("projects", {
      filters: { public_display: true },
      order: "public_display_order:asc,updated_at:desc",
      limit: 1000,
    });

    return await Promise.all(rows.map(async (row: any) => ({
      projectId: String(row.project_code || ""),
      title: String(row.public_project_title || row.project_name || row.project_code || ""),
      category: String(row.project_category || row.project_type || ""),
      location: String(row.location || ""),
      currentStage: (() => { const design=String(row.design_stage_status||"Pending"); const approval=String(row.approval_stage_status||"Pending"); const supervision=String(row.supervision_stage_status||"Completed"); if(design!=="Completed") return "Design Stage"; if(approval!=="Completed") return "Approval Stage"; if(supervision!=="Completed") return "Supervision / Construction"; return "Completed"; })(),
      area: String(row.project_area_text || row.plot_area || ""),
      stories: String(row.number_of_stories_text || row.floors || ""),
      completionYear: String(row.completion_year || ""),
      description: String(row.public_description || ""),
      coverImageUrl: String(row.cover_image_url || ""),
      galleryImages: splitList(row.gallery_images),
      services: splitList(row.public_services),
      ...(await publicMap(row)),
    })));
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
