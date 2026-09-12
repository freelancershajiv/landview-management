import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Our Engineering & Architecture Team in Bangladesh",
  description: "Meet the LAND VIEW team supporting architecture, structural engineering, project coordination and site supervision from Feni, Bangladesh.",
  alternates: { canonical: "/team" },
  openGraph: { title: "Meet the LAND VIEW Team", description: "Architecture and engineering professionals working together in Feni, Bangladesh.", url: "https://www.landview.com.bd/team" },
  twitter: { title: "Meet the LAND VIEW Team", description: "The people behind LAND VIEW Engineers & Architects." },
};
export default function TeamLayout({ children }: { children: React.ReactNode }) { return children; }
