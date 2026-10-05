import type { Metadata } from "next";
import PublicProjectMap from "@/components/public-project-map";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project Map | LAND VIEW Engineers & Architects",
  description: "Explore selected LAND VIEW architectural and engineering projects across Bangladesh on an interactive map.",
  alternates: { canonical: "https://www.landview.com.bd/projects/map" },
  openGraph: {
    title: "LAND VIEW Interactive Project Map",
    description: "Explore selected LAND VIEW architectural and engineering projects across Bangladesh by location.",
    url: "https://www.landview.com.bd/projects/map",
    siteName: "LAND VIEW Engineers & Architects",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LAND VIEW Interactive Project Map",
    description: "Explore selected LAND VIEW architecture and engineering projects by location.",
  },
};

export default async function ProjectMapPage() {
  return <PublicProjectMap initialProjects={await getPublicProjectsForSeo()} />;
}
