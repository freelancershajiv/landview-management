export type PublicProjectSeo = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  status?: string;
  area?: string;
  stories?: string;
  completionYear?: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: string[];
  services?: string[];
};

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

export function normalizePublicImageUrl(url?: string) {
  const value = String(url || "").trim();
  if (!value) return "";

  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1600`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
      }
    }
  } catch {}

  return value;
}

export async function getPublicProjectsForSeo(): Promise<PublicProjectSeo[]> {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) return [];

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getPublicProjects", proxySecret: PROXY_SECRET }),
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) return [];

    const json = await response.json();
    const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return rows as PublicProjectSeo[];
  } catch {
    return [];
  }
}

export async function getPublicProjectForSeo(projectId: string) {
  const id = decodeURIComponent(String(projectId || "")).trim();
  if (!id) return null;

  const projects = await getPublicProjectsForSeo();
  return projects.find((project) => String(project.projectId || "").trim() === id) || null;
}
