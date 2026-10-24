import { defaultWebsiteContent, normalizeWebsiteContent, type WebsiteContentSettings } from "@/lib/website-content";

const CONTENT_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-website-content";

export async function getWebsiteContent(): Promise<WebsiteContentSettings> {
  try {
    const response = await fetch(CONTENT_URL, { next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) return defaultWebsiteContent;
    return normalizeWebsiteContent(json.data);
  } catch {
    return defaultWebsiteContent;
  }
}
