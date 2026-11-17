import type { Metadata } from "next";
import PublicHome from "@/components/public-home";
import { getPublicHomeInitialData } from "@/lib/public-home-initial";
import { siteUrl } from "@/lib/site-info";
import "./public-home-v2.css";

export const metadata: Metadata = {
  title: { absolute: "Architects & Structural Engineers in Feni | LAND VIEW" },
  description: "LAND VIEW is an architecture and structural engineering consultancy in Feni, Bangladesh, offering building planning, structural design, 3D visualization, soil test coordination, plan approval drawings and site supervision.",
  alternates: {
    canonical: "/",
    languages: {
      "en-BD": siteUrl,
      "bn-BD": `${siteUrl}/bn`,
      "x-default": siteUrl,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_BD",
    url: siteUrl,
    siteName: "LAND VIEW Engineers & Architects",
    title: "Architects & Structural Engineers in Feni | LAND VIEW",
    description: "Feni-based architects and structural engineering consultancy for residential and commercial building design in Feni and across Bangladesh.",
    images: [{ url: "/land-view-logo.png", alt: "LAND VIEW Engineers & Architects" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Architects & Structural Engineers in Feni | LAND VIEW",
    description: "Architecture, structural design, building planning and engineering consultancy based in Feni, Bangladesh.",
    images: ["/land-view-logo.png"],
  },
};

// Keep initial data server-side and refresh its public-only cache each minute.
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const snapshot = await getPublicHomeInitialData();
  return <PublicHome {...(snapshot || {})} />;
}
