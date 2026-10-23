import type { Metadata } from "next";
import PublicHome from "@/components/public-home";
import { siteUrl } from "@/lib/site-info";
import "./public-home-v2.css";

export const metadata: Metadata = {
  title: { absolute: "Architecture, Engineering & Building Consultancy in Bangladesh | LAND VIEW" },
  description: "LAND VIEW Engineers & Architects provides architectural design, structural engineering, 3D visualization, plan approval support, survey, soil-test coordination and site supervision from Feni, Bangladesh.",
  alternates: {
    canonical: "/",
    languages: {
      "en-BD": siteUrl,
      "bn-BD": `${siteUrl}/bn`,
      "x-default": siteUrl,
    },
  },
};

export default function HomePage() {
  return <PublicHome />;
}
