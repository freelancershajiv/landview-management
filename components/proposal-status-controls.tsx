"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  convertAcceptedProposal,
  getProposal,
  getProposalConversionPreview,
  getProposalPermissions,
  updateProposalAction,
  type ProposalBundle,
  type ProposalConversionPreview,
} from "@/lib/proposal-api";

const FINAL_STATUSES = ["Prepared", "Sent", "Negotiating", "Accepted", "Rejected", "Expired"] as const;

function money(value: unknown) {
  const n = Number(value || 0);
  return `BDT ${Number.isFinite(n) ? n.toLocaleString("en-BD", { maximumFractionDigits: 2 }) : "0"}`;
}

export default function ProposalStatusControls({ proposalId }: { proposalId: string }) {
  const [bundle, setBundle] = useState<ProposalBundle | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ProposalConversionPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  async function loadPreview(id: string, status: string) {
    if (!["Accepted", "Converted"].includes(status)) {
      setPreview(null);
      return;
    }
    setPreviewBusy(true);
    try {
      setPreview(await getProposalConversionPreview(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not preview project registration.");
    } finally {
      setPreviewBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    void Promise.all([getProposal(proposalId), getProposalPermissions()])
      .then(([proposal, access]) => {
        if (!live) return;
        setBundle(proposal);
        setPermissions(access?.permissions || {});
        setRole(String(access?.role || "").toLowerCase());
        void loadPreview(proposalId, String(proposal?.proposal?.Status || "Draft"));
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load proposal workflow."));
    return () => { live = false; };
  }, [proposalId]);

  const full = role === "admin" || role === "manager";
  const canEdit = full || Boolean(permissions["proposals.edit"]);
  const canConvert = full || Boolean(permissions["proposals.convert"]);
  const status = String(bundle?.proposal?.Status || "Draft");
  const convertedProjectId = String(bundle?.proposal?.Converted_Project_ID || preview?.alreadyConvertedProjectId || "");

  async function setStatus(next: string) {
    if (!canEdit || !proposalId || next === status) return;
    setBusy(next);
    setError("");
    try {
      const data = await updateProposalAction(proposalId, "status", { status: next });
      setBundle(data);
      await loadPreview(proposalId, String(data?.proposal?.Status || next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update proposal status.");
    } finally {
      setBusy("");
    }
  }

  async function convert() {
    if (!canConvert || status !== "Accepted" || busy) return;
    const expected = preview?.nextProjectId || "the next LAND VIEW File ID";
    const accepted = window.confirm(`Create ${expected} from ${proposalId}?\n\nThis will register the project, create billing lines, and prepare its design / approval workflow automatically.`);
    if (!accepted) return;
    setBusy("Converted");
    setError("");
    try {
      const result = await convertAcceptedProposal(proposalId);
      window.location.assign(`/admin/projects/${encodeURIComponent(result.projectId)}/lifecycle`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not convert proposal.");
      await loadPreview(proposalId, status);
    } finally {
      setBusy("");
    }
  }

  if (!bundle) return error ? <div className="psf-error">{error}</div> : null;

  return <section className="psf-shell">
    <style>{`
      .psf-shell{margin-top:14px;padding:15px 16px;border:1px solid var(--theme-line-_303b44,#303b44);border-radius:12px;background:var(--theme-bg-_101820,#101820);color:var(--theme-ink-_eef2f5,#eef2f5)}
      .psf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.psf-head h3{margin:0;font-size:15px}.psf-head p{margin:5px 0 0;color:var(--theme-ink-_8996a0,#8996a0);font-size:10px;line-height:1.55}.psf-status{padding:6px 9px;border-radius:999px;background:var(--theme-bg-_251719,#251719);color:var(--theme-ink-_ff8a83,#ff8a83);font-size:9px;font-weight:900}
      .psf-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.psf-btn{display:inline-flex;min-height:35px;align-items:center;justify-content:center;border:1px solid var(--theme-line-_3a4650,#3a4650);border-radius:7px;background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_dce3e8,#dce3e8);padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer;text-decoration:none}.psf-btn.primary{border-color:var(--theme-line-_d61f26,#d61f26);background:#d61f26;color:#fff}.psf-btn.good{border-color:var(--theme-line-_346148,#346148);background:var(--theme-bg-_173423,#173423);color:var(--theme-ink-_b5e8c5,#b5e8c5)}.psf-btn.danger{border-color:var(--theme-line-_6b3438,#6b3438);background:var(--theme-bg-_351b1e,#351b1e);color:var(--theme-ink-_ffaaa6,#ffaaa6)}.psf-btn:disabled{opacity:.4;cursor:not-allowed}
      .psf-error{margin-top:10px;padding:9px 11px;border:1px solid var(--theme-line-_71373b,#71373b);border-radius:7px;background:var(--theme-bg-_351b1e,#351b1e);color:var(--theme-ink-_ffaaa6,#ffaaa6);font-size:10px}.psf-note{margin-top:10px;color:var(--theme-ink-_76838d,#76838d);font-size:9px}.psf-note strong{color:var(--theme-ink-_cfd7dd,#cfd7dd)}
      .psf-convert{margin-top:14px;border:1px solid var(--theme-line-_33513d,#33513d);border-radius:10px;background:linear-gradient(135deg,var(--theme-bg-_111e17,#111e17),var(--theme-bg-_101820,#101820));overflow:hidden}.psf-convert-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 13px;border-bottom:1px solid var(--theme-line-_2f3c34,#2f3c34)}.psf-convert-head small{display:block;color:var(--theme-ink-_83a58e,#83a58e);font-size:8px;font-weight:900;letter-spacing:.1em}.psf-convert-head strong{display:block;margin-top:4px;font-size:16px;color:var(--theme-ink-_e9f6ed,#e9f6ed)}.psf-file-id{font-size:18px!important;color:var(--theme-ink-_b5e8c5,#b5e8c5)!important}.psf-convert-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--theme-line-_2f3c34,#2f3c34)}.psf-convert-grid div{padding:11px 12px;background:var(--theme-bg-_111920,#111920)}.psf-convert-grid span{display:block;color:var(--theme-ink-_75838d,#75838d);font-size:7px;font-weight:900;text-transform:uppercase}.psf-convert-grid b{display:block;margin-top:5px;color:var(--theme-ink-_e0e8ed,#e0e8ed);font-size:10px}.psf-convert-list{padding:11px 13px}.psf-convert-list p{margin:0 0 6px;color:var(--theme-ink-_81909a,#81909a);font-size:8px;line-height:1.5}.psf-convert-list p:last-child{margin-bottom:0}.psf-convert-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-top:1px solid var(--theme-line-_2f3c34,#2f3c34)}.psf-convert-foot span{color:var(--theme-ink-_7e8a93,#7e8a93);font-size:8px;line-height:1.45}
      @media(max-width:720px){.psf-head,.psf-convert-head,.psf-convert-foot{align-items:flex-start;flex-direction:column}.psf-convert-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>

    <div className="psf-head">
      <div><h3>Proposal workflow</h3><p>Review → send → client decision → automatic project registration.</p></div>
      <span className="psf-status">{status}</span>
    </div>

    {error && <div className="psf-error">{error}</div>}

    {canEdit && status !== "Converted" && <div className="psf-actions">
      {FINAL_STATUSES.map((next) => <button key={next} className={`psf-btn ${next === "Prepared" ? "primary" : next === "Accepted" ? "good" : ["Rejected", "Expired"].includes(next) ? "danger" : ""}`} disabled={Boolean(busy) || next === status} onClick={() => void setStatus(next)}>{busy === next ? "Updating…" : next === "Prepared" ? "✓ Mark reviewed / Prepared" : next}</button>)}
    </div>}

    {canConvert && status === "Accepted" && <div className="psf-convert">
      <div className="psf-convert-head">
        <div><small>ACCEPTED PROPOSAL · READY TO REGISTER</small><strong>Convert proposal into the master project record</strong></div>
        <strong className="psf-file-id">{previewBusy ? "Checking…" : preview?.nextProjectId || "Next LV ID"}</strong>
      </div>
      <div className="psf-convert-grid">
        <div><span>Accepted Value</span><b>{money(preview?.netAmount ?? bundle.proposal.Net_Amount)}</b></div>
        <div><span>Design Deliverables</span><b>{preview?.designDeliverables.length ?? 0}</b></div>
        <div><span>Approval Requirements</span><b>{preview?.approvalRequirements.length ?? 0}</b></div>
        <div><span>Supervision</span><b>{preview?.supervisionRequired ? "Required" : "Not selected"}</b></div>
      </div>
      <div className="psf-convert-list">
        {!!preview?.designDeliverables.length && <p><strong>Design:</strong> {preview.designDeliverables.join(" · ")}</p>}
        {!!preview?.approvalRequirements.length && <p><strong>Approval:</strong> {preview.approvalRequirements.join(" · ")}</p>}
        {!!preview?.workflowTasks.length && <p><strong>Other workflow:</strong> {preview.workflowTasks.join(" · ")}</p>}
        {Number(preview?.discount || 0) > 0 && <p><strong>Proposal discount:</strong> {money(preview?.discount)} will be distributed across generated billing lines so the project billed total matches the accepted proposal.</p>}
      </div>
      <div className="psf-convert-foot">
        <span>The File ID is assigned automatically at conversion. If another project is registered first, the system safely uses the next available LV number.</span>
        <button className="psf-btn good" disabled={Boolean(busy) || previewBusy || !preview} onClick={() => void convert()}>{busy === "Converted" ? "Registering Project…" : `Create ${preview?.nextProjectId || "Project"}`}</button>
      </div>
    </div>}

    {status === "Converted" && convertedProjectId && <div className="psf-convert">
      <div className="psf-convert-head"><div><small>PROJECT REGISTERED</small><strong>This proposal is permanently linked to the project.</strong></div><strong className="psf-file-id">{convertedProjectId}</strong></div>
      <div className="psf-convert-foot"><span>Continue all Design, Approval, Finance, Supervision, Handover and Activity work from the master project workspace.</span><Link className="psf-btn good" href={`/admin/projects/${encodeURIComponent(convertedProjectId)}/lifecycle`}>Open Project Workspace</Link></div>
    </div>}

    <div className="psf-note"><strong>Sequence:</strong> Draft → Prepared → Sent → Negotiating / Accepted → automatic Project Registration. Rejected or expired proposals remain proposals and do not create projects.</div>
  </section>;
}
