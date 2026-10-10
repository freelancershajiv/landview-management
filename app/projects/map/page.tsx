import type { Metadata } from "next";
import PublicProjectMap from "@/components/public-project-map";
import PublicProjectMapMarkerStatus from "@/components/public-project-map-marker-status";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { selectRows } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

type MarkerState = "completed" | "active" | "hold";

function markerState(row: Record<string, any>): MarkerState {
  const lifecycle = String(row.lifecycle_phase || "").trim().toLowerCase();
  const statusText = [
    row.project_status,
    row.status,
    row.project_state,
    row.lifecycle_phase,
    row.design_stage_status,
    row.approval_stage_status,
    row.supervision_stage_status,
  ].map((value) => String(value ?? "").trim().toLowerCase()).join(" ");

  if (/on\s*hold|hold|paused|pause/.test(statusText)) return "hold";
  if (lifecycle === "completed") return "completed";
  if (["design stage", "approval stage", "supervision / construction stage"].includes(lifecycle)) return "active";

  const design = String(row.design_stage_status || "Pending");
  const approval = String(row.approval_stage_status || "Pending");
  const supervision = String(row.supervision_stage_status || "Completed");
  return design === "Completed" && approval === "Completed" && supervision === "Completed" ? "completed" : "active";
}

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
  const [projects, rawProjects] = await Promise.all([
    getPublicProjectsForSeo(),
    selectRows("projects", { filters: { public_display: true }, limit: 1000 }).catch(() => []),
  ]);

  const states = Object.fromEntries(
    (rawProjects || [])
      .map((row: Record<string, any>) => [String(row.project_code || "").trim().toUpperCase(), markerState(row)] as const)
      .filter(([id]) => Boolean(id)),
  );

  return <>
    <PublicProjectMapMarkerStatus states={states} />
    <PublicProjectMap initialProjects={projects} />
  </>;
}
