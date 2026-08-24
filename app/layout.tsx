import type { Metadata } from "next";
import ContactMapEnhancer from "@/components/contact-map-enhancer";
import "./globals.css";
import "./premium-theme.css";

export const metadata: Metadata = {
  title: "LAND VIEW Engineers & Architects",
  description: "LAND VIEW Engineers & Architects — architectural design, structural engineering, visualization and technical consultancy in Feni, Bangladesh.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ContactMapEnhancer />
      </body>
    </html>
  );
}
