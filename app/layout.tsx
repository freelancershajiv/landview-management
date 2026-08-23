import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LAND VIEW Architects & Engineers",
  description: "LAND VIEW Architects & Engineers — architecture, structural engineering, planning and site supervision in Feni, Bangladesh.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
