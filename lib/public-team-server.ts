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

const POSITION_PREFIX = "__POSITION__:";

function cleanPublicTeamText(value: unknown) {
  return String(value ?? "")
    .replace(/\bArchicture\b/gi, "Architecture")
    .replace(/\bArchitectre\b/gi, "Architecture")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function publicPositionFromBio(value: unknown) {
  for (const line of cleanPublicTeamText(value).split(/\r?\n/)) {
    const item = line.trim();
    if (item.startsWith(POSITION_PREFIX)) return item.slice(POSITION_PREFIX.length).trim();
  }
  return "";
}

function publicTeamRank(member: PublicTeamMember) {
  const source = [member.department, member.position, member.designation, member.title].map(cleanPublicTeamText).join(" ").toLowerCase();
  if (/structur/.test(source)) return 0;
  if (/architect/.test(source)) return 1;
  if (/project engineer|project management|supervision|site|coordination/.test(source)) return 2;
  return 3;
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
      filters: { public_display: true, status: "Active" },
      order: "display_order:asc,name:asc",
      limit: 1000,
    });
    const members = rows.map((row: any) => {
      const bio = cleanPublicTeamText(row.public_bio);
      const designation = cleanPublicTeamText(row.designation);
      const publicTitle = cleanPublicTeamText(row.public_title);
      const position = publicPositionFromBio(bio) || designation || publicTitle;

      return {
        name: cleanPublicTeamText(row.name),
        title: publicTitle,
        designation,
        position,
        department: cleanPublicTeamText(row.department),
        degree: "",
        degrees: "",
        speciality: "",
        specialities: "",
        bio,
        photoUrl: String(row.photo_url || "").trim(),
        linkedInUrl: String(row.linkedin_url || "").trim(),
        displayOrder: Number(row.display_order ?? 9999),
      } satisfies PublicTeamMember;
    });

    return members.sort((a, b) =>
      publicTeamRank(a) - publicTeamRank(b) ||
      Number(a.displayOrder ?? 9999) - Number(b.displayOrder ?? 9999) ||
      cleanPublicTeamText(a.name).localeCompare(cleanPublicTeamText(b.name))
    );
  } catch (error) {
    console.warn("LAND VIEW public team Supabase read failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return [];
  }
});
