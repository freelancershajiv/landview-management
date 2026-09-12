import { cache } from "react";

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

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

export function normalizePublicTeamImageUrl(url?: string, size = "w1000") {
  const value = String(url || "").trim();
  if (!value) return "";

  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=${size}`;
  }

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
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) return [];

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getPublicTeam", proxySecret: PROXY_SECRET }),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const json = await response.json();
    const rows = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.team)
        ? json.team
        : Array.isArray(json?.employees)
          ? json.employees
          : Array.isArray(json)
            ? json
            : [];

    return (rows as PublicTeamMember[]).sort(
      (a, b) => Number(a.displayOrder ?? 9999) - Number(b.displayOrder ?? 9999)
    );
  } catch {
    return [];
  }
});
