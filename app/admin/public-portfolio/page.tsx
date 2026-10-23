"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WorkflowState = "Draft" | "Needs Attention" | "Ready" | "Published";
type Filter = "all" | "draft" | "needs-attention" | "ready" | "published" | "hidden" | "missing-cover" | "missing-description";
type BulkAction = "publish" | "unpublish" | "feature" | "unfeature" | "set-category" | "set-display-order" | "set-featured-order";

type PortfolioProject = {
  projectId: string;
  projectName?: string;
  projectType?: string;
  public_display: boolean;
  public_display_order: number;
  website_featured: boolean;
  website_featured_order: number;
  public_project_title: string;
  project_category: string;
  public_description: string;
  public_services: string;
  cover_image_url: string;
  gallery_images: string;
  completion_year: string;
  project_area_text: string;
  number_of_stories_text: string;
  division: string;
  district: string;
  upazila_thana: string;
  local_body_type: string;
  local_body_name: string;
  ward_no: string;
  village_area: string;
  road_holding: string;
  location_tag: string;
  title?: string;
  category?: string;
  location?: string;
  currentStage?: string;
  area?: string;
  stories?: string;
  completionYear?: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: string[];
  services?: string[];
  publicReadiness?: number;
  publicReady?: boolean;
  publicMissing?: string[];
  workflowState?: WorkflowState;
  needsAttention?: boolean;
};

const EMPTY_VALUES = new Set(["", "-", "—", "–", "0", "n/a", "na", "nil", "null", "undefined"]);
const WORKFLOW_ORDER: WorkflowState[] = ["Draft", "Needs Attention", "Ready", "Published"];

function clean(value: unknown) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return EMPTY_VALUES.has(result.toLowerCase()) ? "" : result;
}
function splitList(value: unknown) {
  return String(value ?? "").split(/[\n,;]+/).map(clean).filter(Boolean);
}
function address(project: PortfolioProject) {
  const ward = clean(project.ward_no).replace(/^ward\s*/i, "");
  const localName = clean(project.local_body_name);
  const localType = clean(project.local_body_type).toLowerCase();
  let local = localName;
  if (localName && !/union|paurashava|pourashava|municipality|city corporation/i.test(localName)) {
    if (localType.includes("union")) local = `${localName} Union`;
    else if (localType.includes("city")) local = `${localName} City Corporation`;
    else if (localType.includes("paur") || localType.includes("pour") || localType.includes("municip")) local = `${localName} Paurashava`;
  }
  const parts = [clean(project.road_holding), clean(project.village_area), ward ? `Ward ${ward.padStart(2, "0")}` : "", local, clean(project.upazila_thana), clean(project.district), clean(project.division)].filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((part) => { const key = part.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).join(" · ");
}
function liveReadiness(project: PortfolioProject) {
  const title = clean(project.public_project_title) || clean(project.projectName) || project.projectId;
  const category = clean(project.project_category) || clean(project.projectType);
  const location = address(project);
  const cover = clean(project.cover_image_url);
  const description = clean(project.public_description);
  const services = splitList(project.public_services);
  const checks = [
    { label: "Public title", ok: Boolean(clean(project.public_project_title)) },
    { label: "Project category", ok: Boolean(category) },
    { label: "Structured address", ok: Boolean(location) },
    { label: "Cover image", ok: Boolean(cover) },
    { label: "Public description", ok: Boolean(description && description.length >= 40) },
    { label: "Services", ok: Boolean(services.length) },
    { label: "Project ID", ok: Boolean(project.projectId) },
  ];
  const missing = checks.filter((item) => !item.ok).map((item) => item.label);
  const score = Math.round((checks.length - missing.length) / checks.length * 100);
  return { title, category, location, cover, description, services, score, ready: missing.length === 0, missing };
}
function hasPortfolioWork(project: PortfolioProject) {
  return Boolean([
    project.public_project_title, project.project_category, project.public_description, project.public_services,
    project.cover_image_url, project.gallery_images, project.completion_year, project.project_area_text,
    project.number_of_stories_text, project.division, project.district, project.upazila_thana,
    project.local_body_name, project.ward_no, project.village_area, project.road_holding, project.location_tag,
  ].some((value) => clean(value)) || project.website_featured);
}
function stateOf(project: PortfolioProject): WorkflowState {
  if (project.workflowState) return project.workflowState;
  if (project.public_display) return "Published";
  if (project.publicReady) return "Ready";
  if (hasPortfolioWork(project)) return "Needs Attention";
  return "Draft";
}
function scoreClass(score: number) { return score === 100 ? "good" : score >= 57 ? "mid" : "low"; }
function stateClass(state: WorkflowState) { return state.toLowerCase().replace(/\s+/g, "-"); }
function actionNeedsValue(action: BulkAction) { return action === "set-category" || action === "set-display-order" || action === "set-featured-order"; }

export default function PublicPortfolioPage() {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<PortfolioProject | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("needs-attention");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction>("unpublish");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkStart, setBulkStart] = useState(0);
  const [canOverride, setCanOverride] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load(preferId = selectedId) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/public-portfolio", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load public portfolio."));
      const rows = (Array.isArray(json.data) ? json.data : []) as PortfolioProject[];
      setProjects(rows);
      setCanOverride(Boolean(json?.meta?.canOverride));
      setSelectedIds((current) => current.filter((id) => rows.some((row) => row.projectId === id)));
      const nextId = rows.some((row) => row.projectId === preferId) ? preferId : String(rows[0]?.projectId || "");
      setSelectedId(nextId);
      const next = rows.find((row) => row.projectId === nextId);
      setDraft(next ? { ...next } : null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load public portfolio."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(""); }, []);

  const stats = useMemo(() => ({
    total: projects.length,
    published: projects.filter((project) => project.public_display).length,
    ready: projects.filter((project) => !project.public_display && project.publicReady).length,
    attention: projects.filter((project) => !project.publicReady).length,
    draft: projects.filter((project) => stateOf(project) === "Draft").length,
  }), [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = projects.filter((project) => {
      const state = stateOf(project);
      if (filter === "draft" && state !== "Draft") return false;
      if (filter === "needs-attention" && project.publicReady) return false;
      if (filter === "ready" && state !== "Ready") return false;
      if (filter === "published" && !project.public_display) return false;
      if (filter === "hidden" && project.public_display) return false;
      if (filter === "missing-cover" && !project.publicMissing?.includes("Cover image")) return false;
      if (filter === "missing-description" && !project.publicMissing?.includes("Public description")) return false;
      if (!q) return true;
      return [project.projectId, project.projectName, project.title, project.category, project.location, project.public_project_title]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
    return [...rows].sort((a, b) => {
      if (filter === "needs-attention") {
        const score = Number(a.publicReadiness || 0) - Number(b.publicReadiness || 0);
        if (score) return score;
        const missing = Number(b.publicMissing?.length || 0) - Number(a.publicMissing?.length || 0);
        if (missing) return missing;
      }
      const state = WORKFLOW_ORDER.indexOf(stateOf(a)) - WORKFLOW_ORDER.indexOf(stateOf(b));
      if (state) return state;
      return Number(a.public_display_order || 0) - Number(b.public_display_order || 0) || a.projectId.localeCompare(b.projectId);
    });
  }, [filter, projects, query]);

  function select(project: PortfolioProject) {
    setSelectedId(project.projectId); setDraft({ ...project }); setMessage(""); setError("");
  }
  function patch(changes: Partial<PortfolioProject>) { setDraft((current) => current ? { ...current, ...changes } : current); }
  function toggleSelected(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function selectVisible() { setSelectedIds((current) => [...new Set([...current, ...visible.map((project) => project.projectId)])]); }

  function saveBody(project: PortfolioProject, overridePublish = false) {
    return {
      projectId: project.projectId,
      publicDisplay: project.public_display,
      publicDisplayOrder: project.public_display_order,
      websiteFeatured: project.website_featured,
      websiteFeaturedOrder: project.website_featured_order,
      publicTitle: project.public_project_title,
      projectCategory: project.project_category,
      publicDescription: project.public_description,
      publicServices: project.public_services,
      coverImageUrl: project.cover_image_url,
      galleryImages: project.gallery_images,
      completionYear: project.completion_year,
      projectAreaText: project.project_area_text,
      numberOfStoriesText: project.number_of_stories_text,
      division: project.division,
      district: project.district,
      upazilaThana: project.upazila_thana,
      localBodyType: project.local_body_type,
      localBodyName: project.local_body_name,
      wardNo: project.ward_no,
      villageArea: project.village_area,
      roadHolding: project.road_holding,
      locationTag: project.location_tag,
      overridePublish,
    };
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      let overridePublish = false;
      for (;;) {
        const response = await fetch("/api/admin/public-portfolio", {
          method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
          body: JSON.stringify(saveBody(draft, overridePublish)),
        });
        const json = await response.json();
        if (response.status === 409 && json?.code === "PUBLISH_NOT_READY" && json?.canOverride && canOverride && !overridePublish) {
          const missing = Array.isArray(json.missing) ? json.missing.join(", ") : "required public fields";
          if (window.confirm(`This project is not website-ready. Missing: ${missing}.\n\nPublish anyway using Admin override?`)) { overridePublish = true; continue; }
        }
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save public portfolio project.") + (Array.isArray(json?.missing) ? ` Missing: ${json.missing.join(", ")}.` : ""));
        const saved = json.data as PortfolioProject;
        setProjects((current) => current.map((project) => project.projectId === saved.projectId ? saved : project));
        setDraft({ ...saved });
        setMessage(`${saved.projectId} public portfolio details saved.`);
        break;
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save public portfolio project."); }
    finally { setSaving(false); }
  }

  async function applyBulk() {
    if (!selectedIds.length || bulkBusy) return;
    if (!window.confirm(`Apply “${bulkAction}” to ${selectedIds.length} selected project${selectedIds.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(true); setError(""); setMessage("");
    try {
      let overridePublish = false;
      for (;;) {
        const response = await fetch("/api/admin/public-portfolio", {
          method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: bulkAction, projectIds: selectedIds, value: bulkValue, start: bulkStart, overridePublish }),
        });
        const json = await response.json();
        if (response.status === 409 && json?.code === "PUBLISH_NOT_READY" && json?.canOverride && canOverride && !overridePublish) {
          const blocked = Array.isArray(json.blocked) ? json.blocked.map((item: any) => `${item.projectId} (${(item.missing || []).join(", ")})`).join("\n") : "Selected projects are incomplete.";
          if (window.confirm(`${json.error}\n\n${blocked}\n\nPublish them anyway using Admin override?`)) { overridePublish = true; continue; }
        }
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not update selected projects."));
        setMessage(String(json.message || `${selectedIds.length} projects updated.`));
        setSelectedIds([]);
        await load(selectedId);
        break;
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update selected projects."); }
    finally { setBulkBusy(false); }
  }

  const live = draft ? liveReadiness(draft) : null;
  const selectedSaved = projects.find((project) => project.projectId === selectedId);
  const dirty = Boolean(draft && selectedSaved && JSON.stringify(draft) !== JSON.stringify(selectedSaved));
  const currentState = draft ? stateOf({ ...draft, publicReady: live?.ready, workflowState: undefined }) : "Draft";

  return <main className="ppm-page">
    <style>{`
      .ppm-page{min-height:100vh;padding:26px;background:var(--lv-page-bg,#f4f6f8);color:var(--lv-text-primary,#18222c)}.ppm-wrap{width:min(100% - 28px,1600px);margin:0 auto}.ppm-head{display:flex;justify-content:space-between;align-items:flex-end;gap:22px;margin-bottom:14px}.ppm-kicker{display:block;color:#c6252b;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}.ppm-head h1{margin:0;font-size:clamp(28px,4vw,44px);line-height:1}.ppm-head p{max-width:820px;margin:10px 0 0;color:var(--lv-text-secondary,#64727e);font-size:13px;line-height:1.6}.ppm-actions{display:flex;gap:8px;flex-wrap:wrap}.ppm-btn{min-height:42px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid var(--lv-border-default,#cbd3d9);border-radius:9px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-primary,#1b2731)!important;text-decoration:none;font-size:11px;font-weight:900;cursor:pointer}.ppm-btn.primary{border-color:#c6252b;background:#c6252b;color:#fff!important}.ppm-btn.danger{border-color:#d8a5a5;color:#a32525!important}.ppm-btn:disabled{opacity:.5;cursor:not-allowed}.ppm-workflow{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:12px;padding:11px 13px;border:1px solid var(--lv-border-default,#dce2e7);border-radius:11px;background:var(--lv-surface-panel,#fff)}.ppm-step{display:flex;align-items:center;gap:7px;color:var(--lv-text-secondary,#6c7983);font-size:10px;font-weight:900}.ppm-step b{display:grid;place-items:center;min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:var(--lv-surface-subtle,#eef1f3)}.ppm-step.active b{background:#c6252b;color:#fff}.ppm-arrow{color:#9ca6ae}.ppm-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:12px}.ppm-stat{padding:14px 16px;border:1px solid var(--lv-border-default,#dce2e7);border-radius:11px;background:var(--lv-surface-panel,#fff);cursor:pointer;text-align:left;color:inherit}.ppm-stat:hover{border-color:#c6252b}.ppm-stat small{display:block;color:var(--lv-text-secondary,#7a8791);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.ppm-stat strong{display:block;margin-top:5px;font-size:25px}.ppm-toolbar,.ppm-bulk{display:flex;gap:8px;padding:11px;border:1px solid var(--lv-border-default,#dce2e7);border-radius:11px;background:var(--lv-surface-panel,#fff);margin-bottom:12px;align-items:center}.ppm-search,.ppm-filter,.ppm-bulk input,.ppm-bulk select{min-height:42px;border:1px solid var(--lv-border-default,#cbd3da);border-radius:8px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-primary,#18222c);padding:0 11px;font:inherit}.ppm-search{flex:1}.ppm-filter{min-width:190px}.ppm-bulk strong{font-size:11px;white-space:nowrap}.ppm-bulk-spacer{flex:1}.ppm-alert{margin-bottom:12px;padding:11px 13px;border-radius:9px;font-size:12px}.ppm-alert.err{background:#fff0f0;color:#8e2222;border:1px solid #f0caca}.ppm-alert.ok{background:#edf9f1;color:#196c39;border:1px solid #cae8d4}.ppm-layout{display:grid;grid-template-columns:360px minmax(0,1fr);gap:12px;align-items:start}.ppm-list{position:sticky;top:12px;max-height:calc(100vh - 130px);overflow:auto;border:1px solid var(--lv-border-default,#dce2e7);border-radius:12px;background:var(--lv-surface-panel,#fff)}.ppm-list-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--lv-border-default,#e7ebee);background:var(--lv-surface-panel,#fff);font-size:10px;font-weight:900;color:var(--lv-text-secondary,#67747e)}.ppm-row-wrap{display:grid;grid-template-columns:34px 1fr;border-bottom:1px solid var(--lv-border-default,#eef1f3)}.ppm-check{display:grid;place-items:start center;padding-top:15px}.ppm-check input{width:17px;height:17px;accent-color:#c6252b}.ppm-row{display:block;width:100%;padding:12px 12px 12px 0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.ppm-row-wrap:hover,.ppm-row-wrap.active{background:rgba(198,37,43,.055)}.ppm-row-wrap.active{box-shadow:inset 3px 0 #c6252b}.ppm-row-top{display:flex;justify-content:space-between;gap:8px}.ppm-row strong{font-size:12px}.ppm-row small{display:block;margin-top:4px;color:var(--lv-text-secondary,#71808b);font-size:10px;line-height:1.4}.ppm-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.ppm-badge{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:var(--lv-surface-subtle,#f0f2f4);color:var(--lv-text-secondary,#5d6972);font-size:8px;font-weight:900}.ppm-badge.published,.ppm-score.good,.ppm-badge.ready{background:#e6f6ec;color:#19703a}.ppm-badge.draft{background:#edf0f2;color:#56636d}.ppm-badge.needs-attention,.ppm-score.low{background:#fde8e8;color:#a32525}.ppm-score.mid{background:#fff4d8;color:#865f00}.ppm-workspace{display:grid;gap:12px}.ppm-editor-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--lv-border-default,#dce2e7);border-radius:12px;background:var(--lv-surface-panel,#fff)}.ppm-editor-head h2{margin:0;font-size:18px}.ppm-editor-head p{margin:4px 0 0;color:var(--lv-text-secondary,#74818c);font-size:10px}.ppm-save-state{font-size:9px;font-weight:900;color:#c6252b}.ppm-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:12px;align-items:start}.ppm-form{display:grid;gap:10px}.ppm-section{padding:15px;border:1px solid var(--lv-border-default,#dce2e7);border-radius:12px;background:var(--lv-surface-panel,#fff)}.ppm-section h3{margin:0 0 3px;font-size:13px}.ppm-section>p{margin:0 0 12px;color:var(--lv-text-secondary,#76838d);font-size:10px;line-height:1.5}.ppm-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ppm-field{display:grid;gap:5px;color:var(--lv-text-secondary,#65727c);font-size:8px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.ppm-field.span{grid-column:1/-1}.ppm-field input,.ppm-field select,.ppm-field textarea{width:100%;border:1px solid var(--lv-border-default,#cbd3da);border-radius:8px;padding:9px 10px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-primary,#18222c);font:inherit;font-size:11px;letter-spacing:0;text-transform:none}.ppm-field input,.ppm-field select{min-height:40px}.ppm-field textarea{min-height:86px;resize:vertical}.ppm-toggle{display:flex;align-items:center;gap:9px;min-height:42px;padding:0 10px;border:1px solid var(--lv-border-default,#d6dde2);border-radius:8px;background:var(--lv-surface-subtle,#f8fafb);color:var(--lv-text-primary,#26333d);font-size:10px;font-weight:800;letter-spacing:0;text-transform:none}.ppm-toggle input{width:18px;height:18px;accent-color:#c6252b}.ppm-warning{padding:10px 12px;border-left:3px solid #c6252b;border-radius:8px;background:#fff4f4;color:#8b2929;font-size:10px;line-height:1.55}.ppm-preview{position:sticky;top:12px;display:grid;gap:10px}.ppm-preview-card{overflow:hidden;border:1px solid var(--lv-border-default,#dce2e7);border-radius:13px;background:var(--lv-surface-panel,#fff)}.ppm-cover{aspect-ratio:16/10;background:linear-gradient(135deg,#182631,#0a1117);background-position:center;background-size:cover;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.ppm-preview-body{padding:15px}.ppm-preview-body h3{margin:8px 0 0;font-size:18px;line-height:1.25}.ppm-preview-body p{margin:6px 0 0;color:var(--lv-text-secondary,#687681);font-size:11px;line-height:1.5}.ppm-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.ppm-chip{padding:5px 7px;border-radius:6px;background:var(--lv-surface-subtle,#f1f3f5);color:var(--lv-text-secondary,#5c6871);font-size:8px;font-weight:800}.ppm-readiness{padding:14px;border:1px solid var(--lv-border-default,#dce2e7);border-radius:12px;background:var(--lv-surface-panel,#fff)}.ppm-readiness-top{display:flex;justify-content:space-between;align-items:center}.ppm-readiness strong{font-size:20px}.ppm-meter{height:7px;margin:9px 0;background:var(--lv-surface-subtle,#edf0f2);border-radius:99px;overflow:hidden}.ppm-meter span{display:block;height:100%;background:#c6252b;border-radius:99px}.ppm-missing{display:flex;gap:5px;flex-wrap:wrap}.ppm-empty{padding:50px 20px;text-align:center;border:1px solid var(--lv-border-default,#dce2e7);border-radius:12px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-secondary,#6e7a84)}.ppm-help{padding:11px 13px;border-left:3px solid #c6252b;border-radius:8px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-secondary,#5c6974);font-size:10px;line-height:1.6}@media(max-width:1180px){.ppm-layout{grid-template-columns:310px minmax(0,1fr)}.ppm-grid{grid-template-columns:1fr}.ppm-preview{position:static;grid-template-columns:1fr 1fr}}@media(max-width:820px){.ppm-page{padding:18px 0}.ppm-head{align-items:flex-start;flex-direction:column}.ppm-stats{grid-template-columns:repeat(2,1fr)}.ppm-toolbar,.ppm-bulk{flex-direction:column;align-items:stretch}.ppm-filter{min-width:0}.ppm-bulk-spacer{display:none}.ppm-layout{grid-template-columns:1fr}.ppm-list{position:static;max-height:430px}.ppm-preview{grid-template-columns:1fr}.ppm-fields{grid-template-columns:1fr}.ppm-field.span{grid-column:auto}.ppm-editor-head{align-items:flex-start;flex-direction:column}.ppm-actions{width:100%}.ppm-actions .ppm-btn{flex:1}}@media(max-width:480px){.ppm-wrap{width:min(100% - 18px,1600px)}.ppm-stats{grid-template-columns:1fr 1fr}.ppm-stat{padding:12px}.ppm-stat strong{font-size:21px}}
    `}</style>
    <div className="ppm-wrap">
      <header className="ppm-head"><div><span className="ppm-kicker">Website · Central Control</span><h1>Public Portfolio Management</h1><p>One authoritative workspace for public project quality, publishing, ranking, media, location and content. Existing published projects remain published until you change them.</p></div><div className="ppm-actions"><Link className="ppm-btn" href="/admin/projects">Project List</Link><Link className="ppm-btn" href="/admin/projects/locations">Location Tools</Link><a className="ppm-btn primary" href="/projects" target="_blank" rel="noreferrer">Open Public Portfolio</a></div></header>

      <div className="ppm-workflow" aria-label="Public portfolio workflow">{WORKFLOW_ORDER.map((state, index) => <span className={`ppm-step ${draft && currentState === state ? "active" : ""}`} key={state}><b>{index + 1}</b>{state}{index < WORKFLOW_ORDER.length - 1 ? <i className="ppm-arrow">→</i> : null}</span>)}</div>

      <section className="ppm-stats">
        <button className="ppm-stat" onClick={() => setFilter("all")}><small>Total Projects</small><strong>{stats.total}</strong></button>
        <button className="ppm-stat" onClick={() => setFilter("published")}><small>Published</small><strong>{stats.published}</strong></button>
        <button className="ppm-stat" onClick={() => setFilter("ready")}><small>Ready to Publish</small><strong>{stats.ready}</strong></button>
        <button className="ppm-stat" onClick={() => setFilter("needs-attention")}><small>Needs Attention</small><strong>{stats.attention}</strong></button>
        <button className="ppm-stat" onClick={() => setFilter("draft")}><small>Draft</small><strong>{stats.draft}</strong></button>
      </section>

      <div className="ppm-toolbar"><input className="ppm-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search File ID, project title, category or location"/><select className="ppm-filter" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="needs-attention">Needs attention queue</option><option value="all">All projects</option><option value="draft">Draft</option><option value="ready">Ready to publish</option><option value="published">Published</option><option value="hidden">All hidden</option><option value="missing-cover">Missing cover image</option><option value="missing-description">Missing description</option></select><button className="ppm-btn" onClick={() => void load(selectedId)} disabled={loading}>Refresh</button></div>

      <div className="ppm-bulk"><strong>{selectedIds.length} selected</strong><button className="ppm-btn" onClick={selectVisible} disabled={!visible.length}>Select matching ({visible.length})</button><button className="ppm-btn" onClick={() => setSelectedIds([])} disabled={!selectedIds.length}>Clear</button><span className="ppm-bulk-spacer"/><select value={bulkAction} onChange={(event) => setBulkAction(event.target.value as BulkAction)}><option value="publish">Publish</option><option value="unpublish">Unpublish</option><option value="feature">Feature</option><option value="unfeature">Remove featured</option><option value="set-category">Set category</option><option value="set-display-order">Sequence display order</option><option value="set-featured-order">Sequence featured order</option></select>{bulkAction === "set-category" ? <input value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} placeholder="Category"/> : null}{actionNeedsValue(bulkAction) && bulkAction !== "set-category" ? <input type="number" min="0" value={bulkStart} onChange={(event) => setBulkStart(Number(event.target.value) || 0)} placeholder="Start order"/> : null}<button className="ppm-btn primary" onClick={() => void applyBulk()} disabled={!selectedIds.length || bulkBusy || (bulkAction === "set-category" && !clean(bulkValue))}>{bulkBusy ? "Applying…" : "Apply Bulk Action"}</button></div>

      {error ? <div className="ppm-alert err">{error}</div> : null}{message ? <div className="ppm-alert ok">{message}</div> : null}

      <div className="ppm-layout">
        <aside className="ppm-list"><div className="ppm-list-head"><span>{loading ? "Loading projects…" : filter === "needs-attention" ? `${visible.length} projects · weakest first` : `${visible.length} matching projects`}</span><span>{selectedIds.length ? `${selectedIds.length} selected` : ""}</span></div>{visible.map((project) => { const state = stateOf(project); return <div key={project.projectId} className={`ppm-row-wrap ${project.projectId === selectedId ? "active" : ""}`}><label className="ppm-check" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${project.projectId}`} checked={selectedIds.includes(project.projectId)} onChange={() => toggleSelected(project.projectId)}/></label><button type="button" className="ppm-row" onClick={() => select(project)}><div className="ppm-row-top"><strong>{project.projectId}</strong><span className={`ppm-badge ${stateClass(state)}`}>{state}</span></div><small>{project.public_project_title || project.title || project.projectName || "Untitled project"}</small><small>{project.project_category || project.category || "No category"} · {project.location || "No public address"}</small><div className="ppm-badges"><span className={`ppm-badge ppm-score ${scoreClass(Number(project.publicReadiness || 0))}`}>{Number(project.publicReadiness || 0)}% ready</span>{!project.publicReady ? <span className="ppm-badge needs-attention">{project.publicMissing?.length || 0} missing</span> : null}{project.website_featured ? <span className="ppm-badge">Featured #{project.website_featured_order || "—"}</span> : null}</div></button></div>})}</aside>

        {!draft || !live ? <div className="ppm-empty">Select a project to manage its public portfolio details.</div> : <section className="ppm-workspace">
          <div className="ppm-editor-head"><div><span className={`ppm-badge ${stateClass(currentState)}`}>{currentState}</span><h2>{draft.projectId} · {live.title || "Untitled project"}</h2><p>{draft.projectName || "No internal project name"} · {draft.currentStage || "Stage unavailable"}</p></div><div className="ppm-actions">{dirty ? <span className="ppm-save-state">Unsaved changes</span> : null}<Link className="ppm-btn" href={`/admin/projects/${encodeURIComponent(draft.projectId)}`}>Internal Project</Link>{draft.public_display ? <a className="ppm-btn" href={`/projects/${encodeURIComponent(draft.projectId)}`} target="_blank" rel="noreferrer">Public Page</a> : null}<button className="ppm-btn primary" onClick={() => void save()} disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}</button></div></div>

          <div className="ppm-grid"><div className="ppm-form">
            <section className="ppm-section"><h3>Publishing & ranking</h3><p>Draft → Needs Attention → Ready → Published. A hidden project must pass all required checks before publishing; Main Admin can explicitly override the warning.</p>{!live.ready && !draft.public_display ? <div className="ppm-warning">Publishing safeguard active. Complete: {live.missing.join(", ")}.</div> : null}<div className="ppm-fields" style={{marginTop:10}}><label className="ppm-field span"><span className="ppm-toggle"><input type="checkbox" checked={draft.public_display} onChange={(event) => patch({ public_display: event.target.checked })}/>{draft.public_display ? "Published on the public website" : live.ready ? "Ready — enable to publish" : "Hidden — complete required fields before publishing"}</span></label><label className="ppm-field">Public display order<input type="number" min="0" max="9999" value={draft.public_display_order || 0} onChange={(event) => patch({ public_display_order: Number(event.target.value) || 0 })}/></label><label className="ppm-field"><span className="ppm-toggle"><input type="checkbox" checked={draft.website_featured} onChange={(event) => patch({ website_featured: event.target.checked })}/>Feature on website</span></label><label className="ppm-field">Featured order<input type="number" min="0" max="999" value={draft.website_featured_order || 0} onChange={(event) => patch({ website_featured_order: Number(event.target.value) || 0 })}/></label></div></section>

            <section className="ppm-section"><h3>Public identity</h3><p>Use client-safe naming and public-facing project facts.</p><div className="ppm-fields"><label className="ppm-field span">Public project title<input value={draft.public_project_title || ""} onChange={(event) => patch({ public_project_title: event.target.value })} placeholder="e.g. 7-Storey Residential Building · Feni"/></label><label className="ppm-field">Project category<input value={draft.project_category || ""} onChange={(event) => patch({ project_category: event.target.value })} placeholder="Residential"/></label><label className="ppm-field">Completion year<input value={draft.completion_year || ""} onChange={(event) => patch({ completion_year: event.target.value })} placeholder="2026"/></label><label className="ppm-field">Public area<input value={draft.project_area_text || ""} onChange={(event) => patch({ project_area_text: event.target.value })} placeholder="1960 sq ft · 4.5 Decimal"/></label><label className="ppm-field">Stories / floors<input value={draft.number_of_stories_text || ""} onChange={(event) => patch({ number_of_stories_text: event.target.value })} placeholder="G+7"/></label></div></section>

            <section className="ppm-section"><h3>Structured public address & map</h3><p>This address is shown publicly. Location Tools remains available for map-coordinate verification.</p><div className="ppm-fields"><label className="ppm-field">Division<input value={draft.division || ""} onChange={(event) => patch({ division: event.target.value })}/></label><label className="ppm-field">District<input value={draft.district || ""} onChange={(event) => patch({ district: event.target.value })}/></label><label className="ppm-field">Upazila / Thana<input value={draft.upazila_thana || ""} onChange={(event) => patch({ upazila_thana: event.target.value })}/></label><label className="ppm-field">Local body type<select value={draft.local_body_type || ""} onChange={(event) => patch({ local_body_type: event.target.value })}><option value="">Select type</option><option>Union Parishad</option><option>Paurashava / Municipality</option><option>City Corporation</option></select></label><label className="ppm-field">Local body name<input value={draft.local_body_name || ""} onChange={(event) => patch({ local_body_name: event.target.value })}/></label><label className="ppm-field">Ward no.<input value={draft.ward_no || ""} onChange={(event) => patch({ ward_no: event.target.value })}/></label><label className="ppm-field">Village / area<input value={draft.village_area || ""} onChange={(event) => patch({ village_area: event.target.value })}/></label><label className="ppm-field">Road / holding<input value={draft.road_holding || ""} onChange={(event) => patch({ road_holding: event.target.value })}/></label><label className="ppm-field span">Google Maps location tag<input value={draft.location_tag || ""} onChange={(event) => patch({ location_tag: event.target.value })} placeholder="Google Maps URL or verified location tag"/></label></div></section>

            <section className="ppm-section"><h3>Media</h3><p>A cover image is required for Ready status. Gallery images are optional.</p><div className="ppm-fields"><label className="ppm-field span">Cover image URL<input value={draft.cover_image_url || ""} onChange={(event) => patch({ cover_image_url: event.target.value })}/></label><label className="ppm-field span">Gallery image URLs<textarea value={draft.gallery_images || ""} onChange={(event) => patch({ gallery_images: event.target.value })} placeholder="One URL per line or comma-separated"/></label></div></section>

            <section className="ppm-section"><h3>Public content</h3><p>A public description of at least 40 characters and at least one service are required for Ready status.</p><div className="ppm-fields"><label className="ppm-field span">Public services<textarea value={draft.public_services || ""} onChange={(event) => patch({ public_services: event.target.value })} placeholder="Architectural Design, Structural Design, 3D Design - Exterior"/></label><label className="ppm-field span">Public description<textarea value={draft.public_description || ""} onChange={(event) => patch({ public_description: event.target.value })} placeholder="Client-safe project summary, design intent and delivery scope."/></label></div></section>

            <div className="ppm-help"><strong>Centralized control:</strong> public portfolio fields, visibility, quality state and ranking are controlled here. Internal project/client/workflow/finance data stays on the normal project pages.</div>
          </div>

          <aside className="ppm-preview"><div className="ppm-preview-card"><div className="ppm-cover" style={live.cover ? { backgroundImage: `url(${live.cover})` } : undefined}>{live.cover ? null : <span>{live.category || "LAND VIEW Project"}</span>}</div><div className="ppm-preview-body"><span className={`ppm-badge ${stateClass(currentState)}`}>{currentState}</span><h3>{live.title || "Untitled public project"}</h3><p>{draft.projectId} · {live.category || "No category"}</p><p>{live.location || "No structured public address"}</p>{live.description ? <p>{live.description}</p> : null}<div className="ppm-meta">{live.services.slice(0, 5).map((service) => <span className="ppm-chip" key={service}>{service}</span>)}{draft.completion_year ? <span className="ppm-chip">{draft.completion_year}</span> : null}{draft.project_area_text ? <span className="ppm-chip">{draft.project_area_text}</span> : null}{draft.number_of_stories_text ? <span className="ppm-chip">{draft.number_of_stories_text}</span> : null}</div></div></div><div className="ppm-readiness"><div className="ppm-readiness-top"><div><span className="ppm-kicker" style={{margin:0}}>Publish readiness</span><strong>{live.score}%</strong></div><span className={`ppm-badge ppm-score ${scoreClass(live.score)}`}>{live.ready ? "Ready" : "Needs attention"}</span></div><div className="ppm-meter"><span style={{width:`${live.score}%`}}/></div><div className="ppm-missing">{live.missing.length ? live.missing.map((item) => <span className="ppm-chip" key={item}>{item}</span>) : <span className="ppm-chip">All required checks complete</span>}</div>{draft.public_display && !live.ready ? <div className="ppm-warning" style={{marginTop:10}}>Legacy published project: it remains live, but this quality warning stays visible until the missing fields are completed.</div> : null}</div></aside>
          </div>
        </section>}
      </div>
    </div>
  </main>;
}
