"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/lv-ui";
import ProjectReferenceImages from "@/components/project-reference-images";

const css = `
.reference-page{display:grid;gap:16px}
.reference-page .pc-panel{padding:20px;border:1px solid var(--theme-line-rgba_255_255_255__09_,rgba(255,255,255,.09));border-radius:12px;background:var(--theme-bg-_242424,#242424)}
.reference-page .pc-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
.reference-page .pc-panel-head span:not(.pc-badge){color:#ef493b;font-size:10px;font-weight:800;letter-spacing:.08em}
.reference-page .pc-panel-head h2{font-size:19px;color:var(--theme-ink-_fff,#fff);margin:3px 0 0}
.reference-page .pc-badge{padding:5px 8px;border-radius:5px;background:var(--theme-bg-_333,#333);color:var(--theme-ink-_bbb,#bbb);font-size:11px;white-space:nowrap}
.reference-page .pc-note{color:var(--theme-ink-_aaa,#aaa);font-size:12px;line-height:1.5}
.reference-page .pc-empty{padding:28px;text-align:center;color:var(--theme-ink-_aaa,#aaa);font-size:12px}
.reference-page .pc-danger{border:1px solid #67352f!important;background:#2b1d1b!important;color:#ff8177!important}
@media(max-width:600px){.reference-page .pc-panel{padding:14px}}
`;

export default function ProjectReferencesPage() {
  const params = useParams<{projectId:string}>();
  const projectId = decodeURIComponent(String(params.projectId || ""));
  return <>
    <style dangerouslySetInnerHTML={{__html:css}} />
    <div className="reference-page">
      <PageHeader
        eyebrow={`PROJECT · ${projectId}`}
        title="Reference Images"
        description="Project concept references, drawings, elevations and material samples."
        action={<Link className="btn btn-dark" href="/admin/projects">← Back to Projects</Link>}
      />
      {projectId ? <ProjectReferenceImages projectId={projectId} /> : <div className="pc-panel">A project ID is required.</div>}
    </div>
  </>;
}
