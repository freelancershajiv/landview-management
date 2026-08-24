import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Architecture & Engineering Projects | LAND VIEW Feni",
  description:
    "Explore LAND VIEW Engineers & Architects projects in Feni and across Bangladesh, including architectural design, structural design, 3D exterior and interior design, electrical, plumbing, estimating, survey and soil testing.",
  alternates: {
    canonical: "https://landview.com.bd/projects",
  },
  openGraph: {
    title: "LAND VIEW Architecture & Engineering Projects",
    description:
      "Selected building design, architecture, structural engineering and visualization projects by LAND VIEW Engineers & Architects in Feni, Bangladesh.",
    url: "https://landview.com.bd/projects",
    siteName: "LAND VIEW Engineers & Architects",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LAND VIEW Architecture & Engineering Projects",
    description:
      "Explore selected architecture, structural engineering and building design projects by LAND VIEW in Feni, Bangladesh.",
  },
};

const portfolioSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "LAND VIEW Architecture & Engineering Projects",
  url: "https://landview.com.bd/projects",
  description:
    "Project portfolio of LAND VIEW Engineers & Architects covering architectural design, structural design, 3D visualization and engineering consultancy.",
  isPartOf: {
    "@type": "WebSite",
    name: "LAND VIEW Engineers & Architects",
    url: "https://landview.com.bd",
  },
  about: {
    "@type": "ProfessionalService",
    name: "LAND VIEW Engineers & Architects",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Feni",
      addressRegion: "Chattogram",
      addressCountry: "BD",
    },
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioSchema) }}
      />
      {children}
    </>
  );
}
