"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type QueueData = {
  totals: { pending: number; processing: number; failed: number; terminalFailed: number; completed: number; completed24h: number; total: number };
  jobs: Row[];
  recentCompleted: Row[];
};

function dateTime(value: unknown) {
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });
}

export default function SiteVisitMediaQueue({ canRetry = false }: { canRetry?: boolean }) {
  const [data, setData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/site-visits/media-queue", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load media queue.");
      setData(json.data);
    } catch (err: any) {
      setError(err?.message || "Could not load media queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function retry(jobId: string) {
    if (!canRetry || retrying) return;
    setRetrying(jobId);
    setError("");
    try {
      const response = await fetch("/api/admin/site-visits/media-queue", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not retry media job.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not retry media job.");
    } finally {
      setRetrying("");
    }
  }

  const activeJobs = useMemo(() => Array.isArray(data?.jobs) ? data!.jobs : [], [data]);
  const totals = data?.totals || { pending: 0, processing: 0, failed: 0, terminalFailed: 0, completed: 0, completed24h: 0, total: 0 };
  const state = totals.terminalFailed > 0 ? "critical" : totals.failed > 0 ? "warning" : totals.pending + totals.processing > 0 ? "working" : "healthy";
  const label = state === "critical" ? "Needs attention" : state === "warning" ? "Retrying" : state === "working" ? "Syncing" : "Healthy";

  return <section className={`svmq ${state}`}>
    <style>{`
      .svmq{border:1px solid var(--theme-line-_303a44,#303a44);border-radius:16px;background:linear-gradient(145deg,var(--theme-bg-_121920,#121920),var(--theme-bg-_0d1217,#0d1217));padding:18px;color:var(--theme-ink-_eef2f5,#eef2f5);display:grid;gap:14px}.svmq.warning{border-color:#735d2d}.svmq.critical{border-color:#7e2b31}.svmq-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}.svmq-head h2{margin:0;font-size:15px}.svmq-head p{margin:5px 0 0;color:var(--theme-ink-_89959f,#89959f);font-size:9px;line-height:1.5}.svmq-state{padding:6px 9px;border-radius:999px;background:#173827;color:#a8dfbb;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.svmq.warning .svmq-state{background:#3c3015;color:#f1cf7a}.svmq.critical .svmq-state{background:#35171a;color:#ffb2b5}.svmq-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.svmq-stat{border:1px solid var(--theme-line-_2d3740,#2d3740);border-radius:10px;padding:11px;background:var(--theme-bg-_0e141a,#0e141a)}.svmq-stat span{display:block;color:var(--theme-ink-_7d8994,#7d8994);font-size:7px;text-transform:uppercase;letter-spacing:.08em}.svmq-stat strong{display:block;margin-top:5px;font-size:18px}.svmq-toolbar{display:flex;justify-content:flex-end}.svmq-toolbar button,.svmq-retry{border:1px solid var(--theme-line-_34404a,#34404a);border-radius:8px;background:var(--theme-bg-_151c23,#151c23);color:var(--theme-ink-_fff,#fff);height:34px;padding:0 11px;font-size:8px;font-weight:900;cursor:pointer}.svmq-jobs{display:grid;gap:8px}.svmq-job{border:1px solid var(--theme-line-_29333c,#29333c);border-radius:10px;padding:11px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;background:var(--theme-bg-_0b1116,#0b1116)}.svmq-job strong{font-size:10px}.svmq-job p{margin:4px 0 0;color:var(--theme-ink-_89959f,#89959f);font-size:8px;line-height:1.45}.svmq-job .err{color:#ffaaa5}.svmq-retry{align-self:center;border-color:#7e2b31;background:#35171a;color:#ffb2b5}.svmq-empty{padding:12px;border:1px dashed var(--theme-line-_34404a,#34404a);border-radius:9px;color:var(--theme-ink-_7d8994,#7d8994);font-size:9px}.svmq-error{padding:10px;border:1px solid #7e2b31;border-radius:8px;color:#ffb2b5;background:#261215;font-size:9px}@media(max-width:800px){.svmq-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.svmq-job{grid-template-columns:1fr}.svmq-retry{width:100%}}
    `}</style>
    <div className="svmq-head">
      <div><h2>Site Visit Media Queue</h2><p>Fallback photos move safely from temporary Supabase storage to Google Drive through a retryable background queue.</p></div>
      <span className="svmq-state">{loading ? "Checking" : label}</span>
    </div>
    {error ? <div className="svmq-error">{error}</div> : null}
    <div className="svmq-stats">
      <div className="svmq-stat"><span>Pending</span><strong>{totals.pending}</strong></div>
      <div className="svmq-stat"><span>Processing</span><strong>{totals.processing}</strong></div>
      <div className="svmq-stat"><span>Retrying / Failed</span><strong>{totals.failed}</strong></div>
      <div className="svmq-stat"><span>Needs Manual Retry</span><strong>{totals.terminalFailed}</strong></div>
      <div className="svmq-stat"><span>Completed 24h</span><strong>{totals.completed24h}</strong></div>
    </div>
    <div className="svmq-toolbar"><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "CHECKING…" : "REFRESH QUEUE"}</button></div>
    <div className="svmq-jobs">
      {activeJobs.slice(0, 12).map((job) => {
        const terminal = String(job.status) === "failed" && Number(job.retry_count || 0) >= Number(job.max_retries || 5);
        return <div className="svmq-job" key={String(job.id)}>
          <div>
            <strong>{job.project_code || "Project"} · {job.visit_code || "Site Visit"} · {String(job.media_kind || "photo").toUpperCase()}</strong>
            <p>Status: {job.status || "pending"} · Attempt {Number(job.retry_count || 0)}/{Number(job.max_retries || 5)} · Next: {dateTime(job.next_retry_at)}</p>
            {job.last_error ? <p className="err">{String(job.last_error)}</p> : null}
          </div>
          {canRetry && terminal ? <button className="svmq-retry" type="button" disabled={retrying === String(job.id)} onClick={() => void retry(String(job.id))}>{retrying === String(job.id) ? "RETRYING…" : "RETRY NOW"}</button> : null}
        </div>;
      })}
      {!loading && !activeJobs.length ? <div className="svmq-empty">Queue is clear. No Site Visit photos are waiting for Google Drive sync.</div> : null}
    </div>
  </section>;
}
