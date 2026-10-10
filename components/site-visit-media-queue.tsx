"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [processing, setProcessing] = useState(false);
  const autoProcessAttempted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/site-visits/media-queue", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load media queue.");
      setData(json.data);
      return json.data as QueueData;
    } catch (err: any) {
      setError(err?.message || "Could not load media queue.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (!canRetry || processing) return;
    setProcessing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/site-visits/media-queue", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process" }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not process media queue.");
      if (json?.data?.queue) setData(json.data.queue);
      else await load();
    } catch (err: any) {
      setError(err?.message || "Could not process media queue.");
    } finally {
      setProcessing(false);
    }
  }, [canRetry, load, processing]);

  useEffect(() => { void load(); }, [load]);

  // Admin dashboard visits should heal an overdue queue automatically. This is
  // especially important on the current Hobby deployment where frequent cron
  // execution is not available. Only one automatic attempt is made per mount.
  useEffect(() => {
    if (!canRetry || loading || processing || autoProcessAttempted.current || !data) return;
    const due = (data.jobs || []).some((job) => {
      const status = String(job.status || "").toLowerCase();
      if (status !== "pending" && status !== "failed") return false;
      const retryAt = new Date(String(job.next_retry_at || "")).getTime();
      return !Number.isFinite(retryAt) || retryAt <= Date.now();
    });
    if (!due) return;
    autoProcessAttempted.current = true;
    void processQueue();
  }, [canRetry, data, loading, processQueue, processing]);

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
      await processQueue();
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
      .svmq{border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);padding:18px;color:var(--lv-text-primary);display:grid;gap:14px;box-shadow:var(--lv-shadow-sm)}
      .svmq.warning{border-color:var(--lv-warning-border)}
      .svmq.critical{border-color:var(--lv-danger-border)}
      .svmq-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .svmq-head h2{margin:0;font-size:15px;color:var(--lv-text-strong)}
      .svmq-head p{margin:5px 0 0;color:var(--lv-text-muted);font-size:9px;line-height:1.5}
      .svmq-state{padding:6px 9px;border-radius:var(--lv-radius-pill);background:var(--lv-success-soft);border:1px solid var(--lv-success-border);color:var(--lv-success);font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
      .svmq.warning .svmq-state{background:var(--lv-warning-soft);border-color:var(--lv-warning-border);color:var(--lv-warning)}
      .svmq.critical .svmq-state{background:var(--lv-danger-soft);border-color:var(--lv-danger-border);color:var(--lv-danger)}
      .svmq.working .svmq-state{background:var(--lv-info-soft);border-color:var(--lv-info-border);color:var(--lv-info)}
      .svmq-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      .svmq-stat{border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);padding:11px;background:var(--lv-surface-muted)}
      .svmq-stat span{display:block;color:var(--lv-text-muted);font-size:7px;text-transform:uppercase;letter-spacing:.08em}
      .svmq-stat strong{display:block;margin-top:5px;font-size:18px;color:var(--lv-text-strong)}
      .svmq-toolbar{display:flex;justify-content:flex-end;gap:8px}
      .svmq-toolbar button,.svmq-retry{border:1px solid var(--lv-control-border);border-radius:var(--lv-radius-sm);background:var(--lv-control-bg);color:var(--lv-text-primary);height:34px;padding:0 11px;font-size:8px;font-weight:900;cursor:pointer;transition:background var(--lv-motion-fast),border-color var(--lv-motion-fast),color var(--lv-motion-fast)}
      .svmq-toolbar button:hover:not(:disabled){background:var(--lv-control-bg-hover);border-color:var(--lv-border-strong)}
      .svmq-toolbar button:disabled,.svmq-retry:disabled{opacity:.55;cursor:wait}
      .svmq-toolbar .svmq-sync{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
      .svmq-toolbar .svmq-sync:hover:not(:disabled){background:var(--lv-brand-primary-hover);border-color:var(--lv-brand-primary-hover)}
      .svmq-jobs{display:grid;gap:8px}
      .svmq-job{border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);padding:11px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;background:var(--lv-surface-muted)}
      .svmq-job strong{font-size:10px;color:var(--lv-text-strong)}
      .svmq-job p{margin:4px 0 0;color:var(--lv-text-muted);font-size:8px;line-height:1.45}
      .svmq-job .err{color:var(--lv-danger)}
      .svmq-retry{align-self:center;border-color:var(--lv-danger-border);background:var(--lv-danger-soft);color:var(--lv-danger)}
      .svmq-retry:hover:not(:disabled){border-color:var(--lv-danger)}
      .svmq-empty{padding:12px;border:1px dashed var(--lv-border-default);border-radius:var(--lv-radius-sm);background:var(--lv-surface-muted);color:var(--lv-text-muted);font-size:9px}
      .svmq-error{padding:10px;border:1px solid var(--lv-danger-border);border-radius:var(--lv-radius-sm);color:var(--lv-danger);background:var(--lv-danger-soft);font-size:9px}
      @media(max-width:800px){.svmq-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.svmq-job{grid-template-columns:1fr}.svmq-retry{width:100%}}
    `}</style>
    <div className="svmq-head">
      <div><h2>Site Visit Media Queue</h2><p>Fallback photos move safely from temporary Supabase storage to private Cloudflare R2 through a retryable background queue.</p></div>
      <span className="svmq-state">{processing ? "Processing" : loading ? "Checking" : label}</span>
    </div>
    {error ? <div className="svmq-error">{error}</div> : null}
    <div className="svmq-stats">
      <div className="svmq-stat"><span>Pending</span><strong>{totals.pending}</strong></div>
      <div className="svmq-stat"><span>Processing</span><strong>{totals.processing}</strong></div>
      <div className="svmq-stat"><span>Retrying / Failed</span><strong>{totals.failed}</strong></div>
      <div className="svmq-stat"><span>Needs Manual Retry</span><strong>{totals.terminalFailed}</strong></div>
      <div className="svmq-stat"><span>Completed 24h</span><strong>{totals.completed24h}</strong></div>
    </div>
    <div className="svmq-toolbar">
      {canRetry ? <button className="svmq-sync" type="button" onClick={() => void processQueue()} disabled={processing}>{processing ? "SYNCING…" : "SYNC NOW"}</button> : null}
      <button type="button" onClick={() => void load()} disabled={loading || processing}>{loading ? "CHECKING…" : "REFRESH QUEUE"}</button>
    </div>
    <div className="svmq-jobs">
      {activeJobs.slice(0, 12).map((job) => {
        const terminal = String(job.status) === "failed" && Number(job.retry_count || 0) >= Number(job.max_retries || 5);
        return <div className="svmq-job" key={String(job.id)}>
          <div>
            <strong>{job.project_code || "Project"} · {job.visit_code || "Site Visit"} · {String(job.media_kind || "photo").toUpperCase()}</strong>
            <p>Status: {job.status || "pending"} · Attempt {Number(job.retry_count || 0)}/{Number(job.max_retries || 5)} · Next: {dateTime(job.next_retry_at)}</p>
            {job.last_error ? <p className="err">{String(job.last_error)}</p> : null}
          </div>
          {canRetry && terminal ? <button className="svmq-retry" type="button" disabled={retrying === String(job.id) || processing} onClick={() => void retry(String(job.id))}>{retrying === String(job.id) ? "RETRYING…" : "RETRY NOW"}</button> : null}
        </div>;
      })}
      {!loading && !activeJobs.length ? <div className="svmq-empty">Queue is clear. No Site Visit photos are waiting for R2 sync.</div> : null}
    </div>
  </section>;
}
