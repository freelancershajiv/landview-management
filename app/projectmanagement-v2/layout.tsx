import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project Management V2 Preview | LAND VIEW",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function ProjectManagementV2Layout({ children }: { children: React.ReactNode }) {
  return children;
}
