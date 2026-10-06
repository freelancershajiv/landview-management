import { cache } from "react";
import { selectRows } from "@/lib/supabase-data";

export type PublicTeamMember = {
  name?: string;
  title?: string;
  designation?: string;
  position?: string;
  department?: string;
  degree?: string;
  degrees?: string;
  speciality?: string;
  specialities?: string;
  bio?: string;
  photoUrl?: string;
  linkedInUrl?: string;
  displayOrder?: number;
};

function cleanPublicTeamText(value: unknown) {
  return String(value ?? "")
    .replace(/\bArchicture\b/gi, "Architecture")
    .replace(/\bArchitectre\b/gi, "Architecture")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export function normalizePublicTeamImageUrl(url?: string, size = "w1000") {
  const value = String(url || "").trim();
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=${size}`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=${size}`;
    }
  } catch {}
  return value;
}

export const getPublicTeamForSeo = cache(async function getPublicTeamForSeo(): Promise<PublicTeamMember[]> {
  try {
    const rows = await selectRows("employees", {
      filters: { public_display: true },
      order: "display_order:asc,name:asc",
      limit: 1000,
    });
    return rows.map((row: any) => ({
      name: cleanPublicTeamText(row.name),
      title: cleanPublicTeamText(row.public_title || row.designation),
      designation: cleanPublicTeamText(row.designation || row.public_title),
      position: cleanPublicTeamText(row.public_title || row.designation),
      department: cleanPublicTeamText(row.department),
      degree: "",
      degrees: "",
      speciality: "",
      specialities: "",
      bio: cleanPublicTeamText(row.public_bio),
      photoUrl: String(row.photo_url || "").trim(),
      linkedInUrl: String(row.linkedin_url || "").trim(),
      displayOrder: Number(row.display_order ?? 9999),
    }));
  } catch (error) {
    console.warn("LAND VIEW public team Supabase read failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return [];
  }
});
