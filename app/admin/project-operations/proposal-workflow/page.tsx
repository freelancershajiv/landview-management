"use client";

import Link from "next/link";
import WorkflowPage from "../../workflow/page";

export default function ProposalWorkflowPage() {
  return (
    <>
      <style>{`
        .po-workflow-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px;padding:6px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}
        .po-workflow-nav a{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:8px;text-decoration:none;font-size:10px;font-weight:950;color:var(--lv-text-secondary)}
        .po-workflow-nav a.active{background:var(--lv-brand-primary);color:var(--lv-text-inverse);box-shadow:var(--lv-shadow-sm)}
        .po-workflow-nav a:not(.active){background:var(--lv-surface-muted);border:1px solid var(--lv-border-subtle)}
        .po-workflow-nav small{display:block;margin-top:2px;font-size:7px;font-weight:700;opacity:.72;text-align:center}
        .po-proposal-wrap .wf-switch{display:none!important}
        @media(max-width:650px){.po-workflow-nav{grid-template-columns:1fr}}
      `}</style>
      <nav className="po-workflow-nav" aria-label="Project Operations workflows">
        <Link className="active" href="/admin/project-operations/proposal-workflow">
          <span>Proposal Workflow<small>Architectural Design only</small></span>
        </Link>
        <Link href="/admin/project-operations/project-workflow">
          <span>Project Workflow<small>Service matrix by project</small></span>
        </Link>
      </nav>
      <div className="po-proposal-wrap">
        <WorkflowPage />
      </div>
    </>
  );
}
