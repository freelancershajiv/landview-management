import type { Metadata } from "next";
import PublicHome from "@/components/public-home";
import { siteUrl } from "@/lib/site-info";
import "./public-home-v2.css";

export const metadata: Metadata = {
  title: { absolute: "Architectural & Structural Design Consultancy in Bangladesh | LAND VIEW" },
  description: "LAND VIEW Engineers & Architects is a Feni-based architecture and engineering consultancy serving building projects in Bangladesh with architectural design, structural design, 3D visualization, approval drawings, survey coordination, estimates and site supervision.",
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
    title: "Architectural & Structural Design Consultancy in Bangladesh | LAND VIEW",
    description: "Feni-based architectural and structural design consultancy for residential and commercial building projects across Bangladesh.",
    images: [{ url: "/land-view-logo.png", alt: "LAND VIEW Engineers & Architects" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Architectural & Structural Design Consultancy in Bangladesh | LAND VIEW",
    description: "Feni-based architectural and structural design consultancy for building projects across Bangladesh.",
    images: ["/land-view-logo.png"],
  },
};

export default function HomePage() {
  return <PublicHome />;
}
