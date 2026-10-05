import type { Metadata } from "next";
import PublicProjectMap from "@/components/public-project-map";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project Map | LAND VIEW Engineers & Architects",
  description: "Explore selected LAND VIEW architectural and engineering projects across Bangladesh on an interactive map.",
};

export default async function ProjectMapPage() {
  return <PublicProjectMap initialProjects={await getPublicProjectsForSeo()} />;
}
