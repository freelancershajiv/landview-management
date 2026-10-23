import type { Metadata } from "next";
import PublicProjectMapV2 from "@/components/public-project-map-v2";
import PublicProjectMapMarkerStatus from "@/components/public-project-map-marker-status";
import PublicProjectMapMobileGuard from "@/components/public-project-map-mobile-guard";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { selectRows } from "@/lib/supabase-data";
import "./project-map-v2.css";

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
  title: "Interactive Project Map | LAND VIEW Engineers & Architects",
  description: "Explore published LAND VIEW architecture and engineering projects across Bangladesh with project photos, locations, stages and services on an interactive map.",
  alternates: { canonical: "https://www.landview.com.bd/projects/map" },
  openGraph: {
    title: "LAND VIEW Interactive Project Map",
    description: "Select a LAND VIEW project marker to see its photo, location, project stage, services and full project page.",
    url: "https://www.landview.com.bd/projects/map",
    siteName: "LAND VIEW Engineers & Architects",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LAND VIEW Interactive Project Map",
    description: "Explore LAND VIEW projects by location with project photos and details.",
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
    <PublicProjectMapMobileGuard />
    <PublicProjectMapV2 initialProjects={projects} />
  </>;
}
