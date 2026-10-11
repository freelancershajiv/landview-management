import type { ReactNode } from "react";
import ProjectFinanceEditorPortal from "@/components/project-finance-editor-portal";

export default function ProjectDetailLayout({ children }: { children: ReactNode }) {
  return <>{children}<ProjectFinanceEditorPortal /></>;
}
