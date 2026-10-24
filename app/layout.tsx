import ThemeSwitch from "@/components/theme-switch";
import "./landview-design-tokens.css";
import "./theme-colors.css";
import "./theme-controls.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ContactMapEnhancer from "@/components/contact-map-enhancer";
import BrandLoader from "@/components/brand-loader";
import GlobalActionFeedback from "@/components/global-action-feedback";
import SessionExpiryGuard from "@/components/session-expiry-guard";
import VisitorAnalytics from "@/components/visitor-analytics";
import ConversionAnalytics from "@/components/conversion-analytics";
import WebsiteLeadNotifier from "@/components/website-lead-notifier";
import PublicLeadActions from "@/components/public-lead-actions";
import PublicHomeProjectEnhancer from "@/components/public-home-project-enhancer";
import MobileInteractionGuard from "@/components/mobile-interaction-guard";
import "./globals.css";
import "./brand-loader.css";
import "./premium-theme.css";
import "./team-overrides.css";
import "./app-brand-theme.css";
import "./action-feedback.css";
import "./portal-experiences.css";
import "./brand-logo-overrides.css";
import "./top-portal-navigation.css";
import "./portal-sidebar-lock.css";
// Keep typography near the end so it can normalize legacy component font sizes.
import "./typography-system.css";
// Navigation must independently honor light and dark mode.
import "./dual-mode-navigation.css";
// Shared mobile interaction geometry across public, employee and client surfaces.
import "./mobile-foundation.css";
// Semantic screen palette shared across public, login, portal and finance surfaces.
import "./color-system-authority.css";
// Phase 3 compatibility bridge: one final layer replaces five overlapping color overrides.
import "./color-system-compatibility.css";
// Final brand palette: restore the original bright LAND VIEW signature red.
import "./brand-palette-original.css";

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
    images: [
      {
        url: `${siteUrl}/land-view-logo.png`,
        width: 1200,
        height: 630,
        alt: "LAND VIEW Engineers & Architects",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Engineering & Architectural Consultancy in Bangladesh | LAND VIEW",
    description:
      "Architecture, structural engineering and complete building consultancy services in Feni, Bangladesh.",
    images: [`${siteUrl}/land-view-logo.png`],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-BD" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{document.documentElement.dataset.theme=localStorage.getItem("landview-theme")==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();',
          }}
        />
      </head>
      <body>
        <ThemeSwitch />
        <BrandLoader />
        {children}
        <GlobalActionFeedback />
        <SessionExpiryGuard />
        <VisitorAnalytics />
        <ConversionAnalytics />
        <WebsiteLeadNotifier />
        <PublicLeadActions />
        <PublicHomeProjectEnhancer />
        <MobileInteractionGuard />
        <ContactMapEnhancer />
        <Analytics />
        <SpeedInsights />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(businessSchema) }}
        />
      </body>
    </html>
  );
}
