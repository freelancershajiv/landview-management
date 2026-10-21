"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import WorkflowPage from "../../workflow/page";

export default function ProposalWorkflowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("mode") === "project") {
      router.replace("/admin/project-operations/proposal-workflow");
    }
  }, [router, searchParams]);

  return <WorkflowPage />;
}
