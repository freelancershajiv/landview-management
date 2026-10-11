import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LAND VIEW Project Control",
  description: "LAND VIEW Project Control — Plan · Build · Control.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProjectControlLayout({ children }: { children: React.ReactNode }) {
  return children;
}
