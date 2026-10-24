import { cache } from "react";

const TESTIMONIALS_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-testimonials";

export type PublicTestimonial = {
  id: string;
  clientName: string;
  clientRole?: string;
  projectCode?: string;
  location?: string;
  serviceLabel?: string;
  quote: string;
  featured?: boolean;
  displayOrder?: number;
  createdAt?: string;
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export const getPublicTestimonials = cache(async function getPublicTestimonials(): Promise<PublicTestimonial[]> {
  try {
    const response = await fetch(TESTIMONIALS_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success || !Array.isArray(json.data)) return [];
    return json.data.map((row: Record<string, unknown>) => ({
      id: text(row.id),
      clientName: text(row.client_name),
      clientRole: text(row.client_role) || undefined,
      projectCode: text(row.project_code) || undefined,
      location: text(row.location) || undefined,
      serviceLabel: text(row.service_label) || undefined,
      quote: text(row.quote),
      featured: Boolean(row.featured),
      displayOrder: Number(row.display_order || 0),
      createdAt: text(row.created_at) || undefined,
    })).filter((row: PublicTestimonial) => row.id && row.clientName && row.quote);
  } catch (error) {
    console.warn("LAND VIEW public testimonials read failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return [];
  }
});
