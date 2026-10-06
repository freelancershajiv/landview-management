import { cache } from "react";
import { selectRows } from "@/lib/supabase-data";
import { looksLikeGoogleMapsLocation, parseGoogleMapsCoordinates, resolveGoogleMapsLocation } from "@/lib/google-maps-location";

export type PublicProjectSeo = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  division?: string;
  district?: string;
  upazilaThana?: string;
  localBodyType?: string;
  localBodyName?: string;
  wardNo?: string;
  villageArea?: string;
  roadHolding?: string;
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
  publicReadiness?: number;
  publicReady?: boolean;
  publicMissing?: string[];
};

const EMPTY_PUBLIC_VALUES = new Set(["", "-", "—", "–", "0", "n/a", "na", "nil", "null", "undefined"]);

export function cleanPublicValue(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return EMPTY_PUBLIC_VALUES.has(text.toLowerCase()) ? "" : text;
}

function cleanProjectTitle(value: unknown) {
  return cleanPublicValue(value)
    .replace(/\s*\((?:ref(?:erred)?\.?|reference)\s*[:.]?\s*[^)]*\)\s*$/i, "")
    .replace(/\s*[-–—|]\s*(?:ref(?:erred)?\.?|reference)\s*[:.]?\s*.*$/i, "")
    .replace(/\s*\((?:eng(?:ineer)?\.?\s+[^)]*(?:fnd|friend|cousin|mama|uncle|aunty))\)\s*$/i, "")
    .replace(/\s*[-–—]\s*(?:eng(?:ineer)?\.?\s+.*(?:fnd|friend|cousin|mama|uncle|aunty))\s*$/i, "")
    .trim();
}

function cleanStories(value: unknown) {
  const text = cleanPublicValue(value);
  if (!text) return "";
  const normalized = text
    .replace(/\s*(?:story|stories|storied|storeid|floor|floors)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || /^(?:re-?design|estimate|flat design|duplex|triplex)$/i.test(normalized)) return "";
  return /^(?:[A-Za-z]+\+)?\d+(?:\/\d+)?$/i.test(normalized) ? normalized.toUpperCase() : "";
}

function cleanArea(value: unknown) {
  const text = cleanPublicValue(value);
  if (!text || /^(?:re-?design|estimate|flat design|duplex|triplex|\d+\s*(?:story|stories|storied|storeid|floor|floors))$/i.test(text)) return "";
  return text
    .replace(/\bdecim(?:al)?\b/gi, "Decimal")
    .replace(/\bdeimal\b/gi, "Decimal")
    .replace(/\bsq\.?\s*ft\.?\b/gi, "sq ft")
    .replace(/\s+/g, " ")
    .trim();
}

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
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map((item) => cleanPublicValue(item))
    .filter(Boolean);
}

function localBodyLabel(type: string, name: string) {
  if (!name) return "";
  const normalizedType = type.toLowerCase();
  if (/union/i.test(name) || /paurashava|pourashava|municipality/i.test(name) || /city corporation/i.test(name)) return name;
  if (normalizedType.includes("union")) return `${name} Union`;
  if (normalizedType.includes("city")) return `${name} City Corporation`;
  if (normalizedType.includes("paur") || normalizedType.includes("pour") || normalizedType.includes("municip")) return `${name} Paurashava`;
  return name;
}

function structuredAddress(row: any) {
  const division = cleanPublicValue(row.division);
  const district = cleanPublicValue(row.district);
  const upazila = cleanPublicValue(row.upazila_thana);
  const localType = cleanPublicValue(row.local_body_type);
  const localName = localBodyLabel(localType, cleanPublicValue(row.local_body_name));
  const wardRaw = cleanPublicValue(row.ward_no).replace(/^ward\s*/i, "");
  const ward = wardRaw ? `Ward ${wardRaw.padStart(2, "0")}` : "";
  const village = cleanPublicValue(row.village_area);
  const road = cleanPublicValue(row.road_holding);

  const parts = [road, village, ward, localName, upazila, district, division].filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" · ");
}

function publicLocation(row: any) {
  const structured = structuredAddress(row);
  if (structured) return structured;
  const legacy = cleanPublicValue(row.location);
  if (!legacy || looksLikeGoogleMapsLocation(legacy) || /^https?:\/\//i.test(legacy)) return "";
  return legacy;
}

function validCoordinates(latitude: unknown, longitude: unknown) {
  const latText = String(latitude ?? "").trim();
  const lngText = String(longitude ?? "").trim();
  if (!latText || !lngText) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
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
  const locationTag = String(row.location_tag || "").trim();
  if (!locationTag) return {};
  const fromTag = await locationTagCoordinates(row);
  const fromSite = validCoordinates(row.site_latitude, row.site_longitude);
  const source = fromTag || fromSite;
  if (!source) return {};
  return {
    mapEnabled: true,
    mapPrecision: "exact" as const,
    mapLatitude: Number(source.latitude.toFixed(6)),
    mapLongitude: Number(source.longitude.toFixed(6)),
  };
}

function readiness(row: any, project: PublicProjectSeo) {
  const checks = [
    { label: "Public title", ok: Boolean(cleanPublicValue(row.public_project_title)) },
    { label: "Project category", ok: Boolean(project.category) },
    { label: "Structured address", ok: Boolean(structuredAddress(row)) },
    { label: "Cover image", ok: Boolean(project.coverImageUrl) },
    { label: "Public description", ok: Boolean(project.description && project.description.length >= 40) },
    { label: "Services", ok: Boolean(project.services?.length) },
    { label: "Project ID", ok: Boolean(project.projectId) },
  ];
  const passed = checks.filter((check) => check.ok).length;
  const score = Math.round((passed / checks.length) * 100);
  return {
    publicReadiness: score,
    publicReady: score >= 72 && Boolean(project.coverImageUrl && project.location && project.title),
    publicMissing: checks.filter((check) => !check.ok).map((check) => check.label),
  };
}

export const getPublicProjectsForSeo = cache(async function getPublicProjectsForSeo(): Promise<PublicProjectSeo[]> {
  try {
    const rows = await selectRows("projects", {
      filters: { public_display: true },
      order: "public_display_order:asc,updated_at:desc",
      limit: 1000,
    });

    return await Promise.all(rows.map(async (row: any) => {
      const project: PublicProjectSeo = {
        projectId: String(row.project_code || "").trim(),
        title: cleanProjectTitle(row.public_project_title || row.project_name || row.project_code || ""),
        category: cleanPublicValue(row.project_category || row.project_type),
        location: publicLocation(row),
        division: cleanPublicValue(row.division),
        district: cleanPublicValue(row.district),
        upazilaThana: cleanPublicValue(row.upazila_thana),
        localBodyType: cleanPublicValue(row.local_body_type),
        localBodyName: cleanPublicValue(row.local_body_name),
        wardNo: cleanPublicValue(row.ward_no),
        villageArea: cleanPublicValue(row.village_area),
        roadHolding: cleanPublicValue(row.road_holding),
        currentStage: (() => {
          const design = String(row.design_stage_status || "Pending");
          const approval = String(row.approval_stage_status || "Pending");
          const supervision = String(row.supervision_stage_status || "Completed");
          if (design !== "Completed") return "Design Stage";
          if (approval !== "Completed") return "Approval Stage";
          if (supervision !== "Completed") return "Supervision / Construction";
          return "Completed";
        })(),
        area: cleanArea(row.project_area_text || row.plot_area),
        stories: cleanStories(row.number_of_stories_text || row.floors),
        completionYear: cleanPublicValue(row.completion_year),
        description: cleanPublicValue(row.public_description),
        coverImageUrl: normalizePublicImageUrl(String(row.cover_image_url || "")),
        galleryImages: splitList(row.gallery_images).map((item) => normalizePublicImageUrl(item)),
        services: splitList(row.public_services),
        ...(await publicMap(row)),
      };
      return { ...project, ...readiness(row, project) };
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
