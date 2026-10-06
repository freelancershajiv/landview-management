"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader, pick } from "@/components/lv-ui";

type DriveIndexResponse = { projects?: Record<string, any> };

type SourceSummary = {
  supabase: Set<string>;
  fileList: Set<string>;
  drive: Set<string>;
};

const LIMIT = 280;

const css = `
.missing-page{display:grid;gap:18px}.missing-actions{display:flex;gap:8px;flex-wrap:wrap}.missing-btn{height:40px;padding:0 14px;border:1px solid var(--theme-line-rgba_255_255_255__13_,rgba(255,255,255,.13));border-radius:8px;background:var(--theme-bg-_18232d,#18232d);color:var(--theme-ink-_fff,#fff);font-size:11px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.missing-btn.primary{background:#d61f26;border-color:#d61f26}.missing-btn:disabled{opacity:.55;cursor:not-allowed}.missing-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.missing-stat{padding:16px;border:1px solid var(--theme-line-rgba_255_255_255__11_,rgba(255,255,255,.11));border-radius:12px;background:var(--theme-bg-_0e1720,#0e1720)}.missing-stat b{display:block;color:var(--theme-ink-_fff,#fff);font-size:26px;line-height:1}.missing-stat span{display:block;margin-top:7px;color:var(--theme-ink-_85929c,#85929c);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.missing-card{border:1px solid var(--theme-line-rgba_255_255_255__11_,rgba(255,255,255,.11));border-radius:12px;background:var(--theme-bg-_0e1720,#0e1720);overflow:hidden}.missing-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:15px 16px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));background:var(--theme-bg-_141e28,#141e28)}.missing-head strong{display:block;color:var(--theme-ink-_fff,#fff);font-size:13px}.missing-head small{display:block;margin-top:4px;color:var(--theme-ink-_7e8b95,#7e8b95);font-size:11px;line-height:1.55}.missing-groups{display:grid;gap:16px;padding:16px}.missing-group{display:grid;gap:9px}.missing-group-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.missing-group-title strong{color:var(--theme-ink-_cfd7dc,#cfd7dc);font-size:11px}.missing-group-title span{color:var(--theme-ink-_788691,#788691);font-size:10px}.missing-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:7px}.missing-chip{padding:9px 8px;border:1px solid var(--theme-line-rgba_214_31_38__28_,rgba(214,31,38,.28));border-radius:7px;background:var(--theme-bg-rgba_214_31_38__07_,rgba(214,31,38,.07));color:var(--theme-ink-_ff8a84,#ff8a84);font-size:11px;font-weight:900;text-align:center;letter-spacing:.02em}.missing-empty{padding:28px 16px;text-align:center;color:var(--theme-ink-_82909a,#82909a);font-size:12px}.missing-note{padding:12px 16px;border-top:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));background:var(--theme-bg-_0b141c,#0b141c);color:var(--theme-ink-_75828d,#75828d);font-size:11px;line-height:1.6}.source-row{display:flex;gap:8px;flex-wrap:wrap;padding:0 16px 16px}.source-pill{padding:7px 9px;border:1px solid var(--theme-line-rgba_255_255_255__09_,rgba(255,255,255,.09));border-radius:999px;background:var(--theme-bg-_111b24,#111b24);color:var(--theme-ink-_8e9aa4,#8e9aa4);font-size:10px;font-weight:800}@media(max-width:700px){.missing-summary{grid-template-columns:1fr}.missing-head{flex-direction:column}.missing-grid{grid-template-columns:repeat(3,1fr)}}
`;

function normalizeProjectId(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${String(Number(match[1])).padStart(3, "0")}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${String(Number(digits)).padStart(3, "0")}` : "";
}

function financeRows(data: FinanceSheetData) {
  return (data.rows || []).map((row) => {
    const record: Record<string, unknown> = {};
    (data.headers || []).forEach((header, index) => {
      const key = String(header || "").trim();
      if (key) record[key] = row[index] ?? "";
    });
    return record;
  });
}

function value(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = record[key];
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== "") return candidate;
  }
  return "";
}

async function getDriveIndex(category: "Running" | "Paused" | "Completed"): Promise<DriveIndexResponse> {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getProjectServiceFolders");
  url.searchParams.set("bulk", "1");
  url.searchParams.set("category", category);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store", credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Could not load ${category} project folders.`));
  return json.data || { projects: {} };
}

function withinLimit(id: string) {
  const n = Number(id.replace(/\D/g, ""));
  return n >= 1 && n <= LIMIT;
}

export default function MissingProjectSerialsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<SourceSummary>({ supabase: new Set(), fileList: new Set(), drive: new Set() });
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [dbProjects, fileList, running, paused, completed] = await Promise.all([
        landViewApi.getProjects().catch(() => []),
        landViewApi.getFinanceSheet("File List"),
        getDriveIndex("Running").catch(() => ({ projects: {} })),
        getDriveIndex("Paused").catch(() => ({ projects: {} })),
        getDriveIndex("Completed").catch(() => ({ projects: {} })),
      ]);

      const supabase = new Set<string>();
      (dbProjects || []).forEach((row: Record<string, unknown>) => {
        const id = normalizeProjectId(pick(row, ["Project_ID", "Project ID", "ProjectId"], ""));
        if (id && withinLimit(id)) supabase.add(id);
      });

      const fileIds = new Set<string>();
      financeRows(fileList).forEach((row) => {
        const id = normalizeProjectId(value(row, ["FILE ID", "File ID", "File_ID", "Project_ID", "Project ID"]));
        if (id && withinLimit(id)) fileIds.add(id);
      });

      const drive = new Set<string>();
      for (const response of [running, paused, completed]) {
        Object.entries(response.projects || {}).forEach(([rawId, item]) => {
          const id = normalizeProjectId(rawId || item?.projectId || item?.projectFolderName);
          if (id && withinLimit(id)) drive.add(id);
        });
      }

      setSources({ supabase, fileList: fileIds, drive });
    } catch (e: any) {
      setError(e?.message || "Could not calculate missing project serials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const present = useMemo(() => {
    const all = new Set<string>();
    sources.supabase.forEach((id) => all.add(id));
    sources.fileList.forEach((id) => all.add(id));
    sources.drive.forEach((id) => all.add(id));
    return all;
  }, [sources]);

  const missing = useMemo(() => Array.from({ length: LIMIT }, (_, index) => `LV-${String(index + 1).padStart(3, "0")}`).filter((id) => !present.has(id)), [present]);

  const groups = useMemo(() => {
    const ranges = [
      [1, 50], [51, 100], [101, 150], [151, 200], [201, 250], [251, 280],
    ] as const;
    return ranges.map(([start, end]) => ({
      start,
      end,
      ids: missing.filter((id) => {
        const n = Number(id.replace(/\D/g, ""));
        return n >= start && n <= end;
      }),
    }));
  }, [missing]);

  async function copyMissing() {
    try {
      await navigator.clipboard.writeText(missing.join(", "));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy the missing serial list. Your browser may have blocked clipboard access.");
    }
  }

  if (loading) return <LoadingState label="Finding empty project serials up to LV-280..." />;
  if (error && !present.size) return <ErrorState message={error} onRetry={load} />;

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <div className="missing-page">
      <PageHeader
        eyebrow="LAND VIEW PROJECT REGISTER"
        title="Missing Project Serials"
        description="Unused LV serials from LV-001 through LV-280. A serial is treated as occupied if it exists in Supabase, Auto Invoice / File List, or any Running, Paused or Completed Google Drive project folder."
        action={<div className="missing-actions"><button className="missing-btn" type="button" onClick={load}>Refresh</button><button className="missing-btn primary" type="button" disabled={!missing.length} onClick={() => void copyMissing()}>{copied ? "Copied" : "Copy Missing Serials"}</button></div>}
      />

      {error && <div className="missing-note" style={{border:"1px solid rgba(214,31,38,.35)",borderRadius:8}}>{error}</div>}

      <div className="missing-summary">
        <div className="missing-stat"><b>{LIMIT}</b><span>Serials checked</span></div>
        <div className="missing-stat"><b>{present.size}</b><span>Projects found</span></div>
        <div className="missing-stat"><b>{missing.length}</b><span>Empty serials</span></div>
      </div>

      <section className="missing-card">
        <div className="missing-head">
          <div><strong>Empty serials to search on your local drive</strong><small>Check these LV numbers against your local project folders. When you find an old project, use Legacy Registration to add it with the original serial.</small></div>
          <Link className="missing-btn" href="/admin/projects/legacy">Open Legacy Registration →</Link>
        </div>
        <div className="source-row">
          <span className="source-pill">Supabase: {sources.supabase.size}</span>
          <span className="source-pill">Auto Invoice / File List: {sources.fileList.size}</span>
          <span className="source-pill">Google Drive folders: {sources.drive.size}</span>
        </div>
        {missing.length ? <div className="missing-groups">{groups.map((group) => <div className="missing-group" key={group.start}>
          <div className="missing-group-title"><strong>LV-{String(group.start).padStart(3,"0")} — LV-{String(group.end).padStart(3,"0")}</strong><span>{group.ids.length} empty</span></div>
          {group.ids.length ? <div className="missing-grid">{group.ids.map((id) => <div className="missing-chip" key={id}>{id}</div>)}</div> : <div className="missing-empty" style={{padding:10}}>No empty serials in this range.</div>}
        </div>)}</div> : <div className="missing-empty">No empty serials were found between LV-001 and LV-280.</div>}
        <div className="missing-note">This page does not create or reserve project IDs. It is only a finder for gaps in the current project register, so you can locate historical files locally before registering and uploading them.</div>
      </section>
    </div>
  </>;
}
