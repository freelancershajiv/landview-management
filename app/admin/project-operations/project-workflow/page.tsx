"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import WorkflowPage from "../../workflow/page";

export default function ProjectWorkflowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isProjectMode = searchParams.get("mode") === "project";

  useEffect(() => {
    if (!isProjectMode) {
      router.replace("/admin/project-operations/project-workflow?mode=project");
    }
  }, [isProjectMode, router]);

  if (!isProjectMode) {
    return <div style={{ padding: 24, fontSize: 12 }}>Loading Project Workflow…</div>;
  }

  return <WorkflowPage />;
}
