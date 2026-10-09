import { getVercelOidcToken } from "@vercel/oidc";

const QUEUE_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-site-visit-queue";
const OIDC_AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, any>;

function clean(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

export async function mediaQueueAction<T = any>(action: string, input: Row = {}, timeoutMs = 8_000): Promise<T> {
  const oidc = await getVercelOidcToken({ audience: OIDC_AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(QUEUE_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(clean(json?.error || `Site Visit media queue returned HTTP ${response.status}.`, 800));
  }
  return json.data as T;
}

export function claimMediaJob(lockToken: string) {
  return mediaQueueAction<Row | null>("claim", { lockToken, lockTimeoutMinutes: 10 });
}
export function markMediaJobUploaded(jobId: string, lockToken: string, driveFileId: string, driveFileUrl: string) {
  return mediaQueueAction<Row>("markUploaded", { jobId, lockToken, driveFileId, driveFileUrl });
}
export function releaseMediaJob(jobId: string, lockToken: string) {
  return mediaQueueAction<{ released: boolean }>("release", { jobId, lockToken });
}
export function completeMediaJob(jobId: string, lockToken: string, driveFileId: string, driveFileUrl: string) {
  return mediaQueueAction<{ completed: boolean }>("complete", { jobId, lockToken, driveFileId, driveFileUrl });
}
export function failMediaJob(jobId: string, lockToken: string, error: string) {
  return mediaQueueAction<Row | null>("fail", { jobId, lockToken, error: clean(error, 2000) });
}
export function retryMediaJob(jobId: string) {
  return mediaQueueAction<{ retried: boolean }>("retry", { jobId });
}
export function getMediaQueueStats() {
  return mediaQueueAction<{
    totals: { pending: number; processing: number; failed: number; terminalFailed: number; completed: number; completed24h: number; total: number };
    jobs: Row[];
    recentCompleted: Row[];
  }>("stats");
}
