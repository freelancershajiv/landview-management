import type { Metadata } from "next";
import ContactMapEnhancer from "@/components/contact-map-enhancer";
import "./globals.css";
import "./premium-theme.css";
import "./team-overrides.css";

const siteUrl = "https://landview.com.bd";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LAND VIEW Engineers & Architects | Feni, Bangladesh",
    template: "%s | LAND VIEW Engineers & Architects",
  },
  description:
    "LAND VIEW Engineers & Architects is an architectural and engineering consultancy in Feni, Bangladesh offering architectural design, structural design, exterior and interior 3D design, electrical and plumbing design, estimate and costing, plan approval, digital survey and soil testing.",
  applicationName: "LAND VIEW Engineers & Architects",
  keywords: [
    "LAND VIEW Engineers & Architects",
    "architect Feni",
    "architectural design Feni",
    "structural design Feni",
    "engineering consultancy Feni",
    "building design Feni Bangladesh",
    "3D exterior design Bangladesh",
    "3D interior design Bangladesh",
    "electrical design",
    "plumbing design",
    "estimate and costing",
    "building plan approval",
    "digital survey Bangladesh",
    "soil test Bangladesh",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_BD",
    url: siteUrl,
    siteName: "LAND VIEW Engineers & Architects",
    title: "LAND VIEW Engineers & Architects | Feni, Bangladesh",
    description:
      "Architectural design, structural engineering, 3D design and complete building consultancy services in Feni, Bangladesh.",
    images: [{ url: "/land-view-logo.png", alt: "LAND VIEW Engineers & Architects" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LAND VIEW Engineers & Architects | Feni, Bangladesh",
    description: "Architecture, structural engineering and complete building consultancy services in Feni, Bangladesh.",
    images: ["/land-view-logo.png"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "@id": `${siteUrl}/#organization`,
  name: "LAND VIEW Engineers & Architects",
  url: siteUrl,
  logo: `${siteUrl}/land-view-logo.png`,
  image: `${siteUrl}/land-view-logo.png`,
  description:
    "Architectural and engineering consultancy providing architectural design, structural design, 3D exterior and interior design, electrical and plumbing design, estimate and costing, plan approval, digital survey and soil testing.",
  areaServed: {
    "@type": "Country",
    name: "Bangladesh",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Feni",
    addressCountry: "BD",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Architecture and Engineering Services",
    itemListElement: [
      "Architectural Design",
      "Structural Design",
      "3D Design - Exterior",
      "3D Design - Interior",
      "Electrical Design",
      "Plumbing Design",
      "Estimate & Costing",
      "Plan Approval",
      "Digital Survey",
      "Soil Test",
    ].map((name) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name },
    })),
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-BD">
      <body>
        {children}
        <ContactMapEnhancer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </body>
    </html>
  );
}
