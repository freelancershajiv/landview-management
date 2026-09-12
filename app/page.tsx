import type { Metadata } from "next";
import PublicHome from "@/components/public-home";
import { siteUrl } from "@/lib/site-info";

export const metadata: Metadata = {
  title: { absolute: "Engineering Consultancy in Bangladesh | LAND VIEW" },
  description: "LAND VIEW Engineers & Architects: building planning, structural design and site supervision in Bangladesh. Based in Feni. Discuss your project with our team.",
  alternates: {
    canonical: "/",
    languages: {
      "en-BD": siteUrl,
      "bn-BD": `${siteUrl}/bn`,
      "x-default": siteUrl,
    },
  },
};

export default function HomePage() { return <PublicHome />; }
