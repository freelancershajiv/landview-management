import Link from "next/link";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 72) return "ready";
  if (score >= 50) return "partial";
  return "weak";
}

export default async function WebsiteReadinessPage() {
  const projects = (await getPublicProjectsForSeo()).slice().sort((a, b) => (b.publicReadiness || 0) - (a.publicReadiness || 0));
  const ready = projects.filter((project) => project.publicReady).length;
  const average = projects.length ? Math.round(projects.reduce((sum, project) => sum + (project.publicReadiness || 0), 0) / projects.length) : 0;

  return (
    <main className="website-readiness-page">
      <style>{`
        .website-readiness-page{min-height:100vh;padding:34px;background:#f4f6f8;color:#17212b}.wr-wrap{width:min(100% - 32px,1400px);margin:0 auto}.wr-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:24px}.wr-kicker{display:block;margin-bottom:7px;color:#c6252b;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.wr-head h1{margin:0;font-size:clamp(28px,4vw,44px);line-height:1}.wr-head p{max-width:700px;margin:12px 0 0;color:#61707d;line-height:1.65}.wr-actions{display:flex;gap:8px;flex-wrap:wrap}.wr-button{min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid #cbd2d9;border-radius:8px;background:#fff;color:#17212b!important;text-decoration:none;font-size:12px;font-weight:800}.wr-button.primary{border-color:#c6252b;background:#c6252b;color:#fff!important}.wr-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}.wr-stat{padding:18px;border:1px solid #dce1e6;border-radius:12px;background:#fff}.wr-stat small{display:block;color:#778591;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.wr-stat strong{display:block;margin-top:6px;font-size:30px}.wr-note{margin-bottom:18px;padding:14px 16px;border-left:3px solid #c6252b;border-radius:8px;background:#fff;color:#55636f;font-size:13px;line-height:1.6}.wr-table-wrap{overflow:auto;border:1px solid #dce1e6;border-radius:12px;background:#fff}.wr-table{width:100%;min-width:1040px;border-collapse:collapse}.wr-table th,.wr-table td{padding:13px 14px;border-bottom:1px solid #edf0f2;text-align:left;vertical-align:top}.wr-table th{position:sticky;top:0;z-index:1;background:#f8fafb;color:#65727d;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.wr-project strong{display:block;font-size:13px}.wr-project small{display:block;margin-top:4px;color:#7b8791}.wr-score{display:inline-flex;min-width:58px;justify-content:center;padding:6px 8px;border-radius:999px;font-size:11px;font-weight:900}.wr-score.ready{background:#e7f6ed;color:#19703a}.wr-score.partial{background:#fff4d8;color:#8a6100}.wr-score.weak{background:#fde8e8;color:#a32525}.wr-location{max-width:300px;color:#44525e;font-size:12px;line-height:1.5}.wr-missing{display:flex;gap:5px;flex-wrap:wrap;max-width:420px}.wr-chip{padding:4px 6px;border-radius:5px;background:#f1f3f5;color:#5d6973;font-size:10px;font-weight:700}.wr-chip.complete{background:#e7f6ed;color:#19703a}.wr-edit{color:#c6252b!important;font-size:11px;font-weight:900;text-decoration:none}.wr-empty{padding:40px;text-align:center;color:#687681}@media(max-width:850px){.website-readiness-page{padding:22px 0}.wr-head{align-items:flex-start;flex-direction:column}.wr-summary{grid-template-columns:1fr 1fr}}@media(max-width:520px){.wr-wrap{width:min(100% - 20px,1400px)}.wr-summary{grid-template-columns:1fr 1fr}.wr-stat{padding:14px}.wr-stat strong{font-size:24px}}
      `}</style>
      <div className="wr-wrap">
        <header className="wr-head">
          <div>
            <span className="wr-kicker">Public Website Quality</span>
            <h1>Website Readiness</h1>
            <p>Review every project currently published on the LAND VIEW website. Scores are calculated from public title, category, structured address, cover image, description, services and project ID. Internal finance and project-management names are not changed.</p>
          </div>
          <div className="wr-actions">
            <Link className="wr-button" href="/admin/projects">Back to Projects</Link>
            <Link className="wr-button" href="/admin/projects/locations">Complete Locations</Link>
            <Link className="wr-button" href="/admin/website-leads">Project Enquiries</Link>
            <Link className="wr-button primary" href="/admin/projects/website-curation">Curate Website Projects</Link>
          </div>
        </header>

        <section className="wr-summary" aria-label="Website readiness summary">
          <article className="wr-stat"><small>Published Projects</small><strong>{projects.length}</strong></article>
          <article className="wr-stat"><small>Website Ready</small><strong>{ready}</strong></article>
          <article className="wr-stat"><small>Need Work</small><strong>{projects.length - ready}</strong></article>
          <article className="wr-stat"><small>Average Score</small><strong>{average}%</strong></article>
        </section>

        <div className="wr-note">Use <strong>Website Curation</strong> to finish and rank the strongest 10–15 projects. The public homepage now uses that curated shortlist first and quality-ranked published projects as a fallback.</div>

        <div className="wr-table-wrap">
          {projects.length ? <table className="wr-table">
            <thead><tr><th>Project</th><th>Score</th><th>Public Location</th><th>Missing / Complete</th><th>Action</th></tr></thead>
            <tbody>{projects.map((project) => {
              const score = project.publicReadiness || 0;
              const missing = project.publicMissing || [];
              return <tr key={project.projectId || project.title}>
                <td className="wr-project"><strong>{project.title || "Untitled public project"}</strong><small>{project.projectId || "No project ID"} · {project.category || "No category"}</small></td>
                <td><span className={`wr-score ${scoreTone(score)}`}>{score}%</span></td>
                <td className="wr-location">{project.location || "No safe public address yet"}</td>
                <td><div className="wr-missing">{missing.length ? missing.map((item) => <span className="wr-chip" key={item}>{item}</span>) : <span className="wr-chip complete">Website ready</span>}</div></td>
                <td>{project.projectId ? <Link className="wr-edit" href={`/admin/projects/${encodeURIComponent(project.projectId)}`}>Edit project →</Link> : "—"}</td>
              </tr>;
            })}</tbody>
          </table> : <div className="wr-empty">No public projects are currently available.</div>}
        </div>
      </div>
    </main>
  );
}
