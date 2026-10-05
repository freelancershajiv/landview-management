"use client";

import { useEffect, useState } from "react";
import { getProposal, getProposalPermissions, updateProposalAction, type ProposalBundle } from "@/lib/proposal-api";

const FINAL_STATUSES = ["Prepared", "Sent", "Negotiating", "Accepted", "Rejected", "Expired"] as const;

export default function ProposalStatusControls({ proposalId }: { proposalId: string }) {
  const [bundle, setBundle] = useState<ProposalBundle | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void Promise.all([getProposal(proposalId), getProposalPermissions()])
      .then(([proposal, access]) => {
        if (!live) return;
        setBundle(proposal);
        setPermissions(access?.permissions || {});
        setRole(String(access?.role || "").toLowerCase());
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load proposal workflow."));
    return () => { live = false; };
  }, [proposalId]);

  const full = role === "admin" || role === "manager";
  const canEdit = full || Boolean(permissions["proposals.edit"]);
  const canConvert = full || Boolean(permissions["proposals.convert"]);
  const status = String(bundle?.proposal?.Status || "Draft");

  async function setStatus(next: string) {
    if (!canEdit || !proposalId || next === status) return;
    setBusy(next); setError("");
    try {
      const data = await updateProposalAction(proposalId, "status", { status: next });
      setBundle(data);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update proposal status.");
    } finally { setBusy(""); }
  }

  async function convert() {
    if (!canConvert || status !== "Accepted") return;
    const projectId = window.prompt("Enter the LAND VIEW Project ID for this accepted proposal (example: LV-281):", String(bundle?.proposal?.Converted_Project_ID || ""));
    if (!projectId?.trim()) return;
    setBusy("Converted"); setError("");
    try {
      const data = await updateProposalAction(proposalId, "convert", { projectId: projectId.trim().toUpperCase() });
      setBundle(data);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not convert proposal.");
    } finally { setBusy(""); }
  }

  if (!bundle) return error ? <div className="psf-error">{error}</div> : null;

  return <section className="psf-shell">
    <style>{`
      .psf-shell{margin-top:14px;padding:15px 16px;border:1px solid var(--theme-line-_303b44, #303b44);border-radius:12px;background:var(--theme-bg-_101820, #101820);color:var(--theme-ink-_eef2f5, #eef2f5)}.psf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.psf-head h3{margin:0;font-size:15px}.psf-head p{margin:5px 0 0;color:var(--theme-ink-_8996a0, #8996a0);font-size:10px;line-height:1.55}.psf-status{padding:6px 9px;border-radius:999px;background:var(--theme-bg-_251719, #251719);color:var(--theme-ink-_ff8a83, #ff8a83);font-size:9px;font-weight:900}.psf-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.psf-btn{border:1px solid var(--theme-line-_3a4650, #3a4650);border-radius:7px;background:var(--theme-bg-_17222b, #17222b);color:var(--theme-ink-_dce3e8, #dce3e8);padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer}.psf-btn.primary{border-color:var(--theme-line-_d61f26, #d61f26);background:#d61f26;color:#fff}.psf-btn.good{border-color:var(--theme-line-_346148, #346148);background:var(--theme-bg-_173423, #173423);color:var(--theme-ink-_b5e8c5, #b5e8c5)}.psf-btn.danger{border-color:var(--theme-line-_6b3438, #6b3438);background:var(--theme-bg-_351b1e, #351b1e);color:var(--theme-ink-_ffaaa6, #ffaaa6)}.psf-btn:disabled{opacity:.4;cursor:not-allowed}.psf-error{margin-top:10px;padding:9px 11px;border:1px solid var(--theme-line-_71373b, #71373b);border-radius:7px;background:var(--theme-bg-_351b1e, #351b1e);color:var(--theme-ink-_ffaaa6, #ffaaa6);font-size:10px}.psf-note{margin-top:10px;color:var(--theme-ink-_76838d, #76838d);font-size:9px}.psf-note strong{color:var(--theme-ink-_cfd7dd, #cfd7dd)}@media(max-width:650px){.psf-head{flex-direction:column}}
    `}</style>
    <div className="psf-head"><div><h3>Proposal workflow</h3><p>Stage 2 must be completed before Print / Save PDF. Any edit returns the proposal to Draft for a fresh review.</p></div><span className="psf-status">{status}</span></div>
    {error && <div className="psf-error">{error}</div>}
    {canEdit && <div className="psf-actions">
      {FINAL_STATUSES.map((next) => <button key={next} className={`psf-btn ${next === "Prepared" ? "primary" : next === "Accepted" ? "good" : ["Rejected","Expired"].includes(next) ? "danger" : ""}`} disabled={Boolean(busy) || next === status} onClick={() => void setStatus(next)}>{busy === next ? "Updating…" : next === "Prepared" ? "✓ Mark reviewed / Prepared" : next}</button>)}
      {canConvert && <button className="psf-btn good" disabled={Boolean(busy) || status !== "Accepted"} onClick={() => void convert()}>{busy === "Converted" ? "Converting…" : "Convert to Project"}</button>}
    </div>}
    <div className="psf-note"><strong>Required sequence:</strong> Draft → Prepared → Print/PDF (becomes Sent). Client outcome can then be Negotiating, Accepted, Rejected or Expired. Conversion is only available after Accepted.</div>
  </section>;
}
