import type { Metadata } from "next";
import ProjectLedgerSwitcher from "./project-ledger-switcher";

export const metadata: Metadata = {
  title: "Project Management | LAND VIEW",
  description: "LAND VIEW internal project finance and construction management workspace.",
  robots: { index: false, follow: false },
};

export default function ProjectManagementPage() {
  return <ProjectLedgerSwitcher />;
}
