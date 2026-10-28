import type { ReactNode } from "react";
import ProjectLocationsQuickPanel from "@/components/project-locations-quick-panel";

export default function ProjectLocationsLayout({ children }: { children: ReactNode }) {
  return <><ProjectLocationsQuickPanel />{children}</>;
}
