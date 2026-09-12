import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import ContactMapEnhancer from "@/components/contact-map-enhancer";
import GlobalActionFeedback from "@/components/global-action-feedback";
import "./globals.css";
import "./premium-theme.css";
import "./team-overrides.css";
import "./app-brand-theme.css";
import "./action-feedback.css";
import "./portal-experiences.css";

import { siteUrl, businessSchema, jsonLd } from "@/lib/site-info";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Engineering & Architectural Consultancy in Bangladesh | LAND VIEW",
    template: "%s | LAND VIEW",
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
    title: "Engineering & Architectural Consultancy in Bangladesh | LAND VIEW",
    description:
      "Architectural design, structural engineering, 3D design and complete building consultancy services in Feni, Bangladesh.",
    images: [{ url: "/land-view-logo.png", alt: "LAND VIEW Engineers & Architects" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Engineering & Architectural Consultancy in Bangladesh | LAND VIEW",
    description: "Architecture, structural engineering and complete building consultancy services in Feni, Bangladesh.",
    images: ["/land-view-logo.png"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-BD">
      <body>
        {children}
        <Analytics />
        <GlobalActionFeedback />
        <ContactMapEnhancer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@graph": [businessSchema, { "@type": "WebSite", "@id": `${siteUrl}/#website`, url: siteUrl, name: "LAND VIEW Engineers & Architects", publisher: { "@id": `${siteUrl}/#organization` } }] }) }}
        />
      </body>
    </html>
  );
}
