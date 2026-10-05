"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DetailedEstimateWorkspace from "@/components/detailed-estimate-workspace";
import { landViewApi } from "@/lib/api";
import { normalizeFileId } from "@/lib/sheet-invoices";
import { listProposals, type ProposalRecord } from "@/lib/proposal-api";

type ProjectOption = { id: string; name: string; type: string; floor: string };

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const displayDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

function setControlledInput(placeholder: string, value: string) {
  const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((element) => element.placeholder === placeholder);
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function DetailedEstimateShell() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedProposal, setSelectedProposal] = useState("");

  const [estimateId, setEstimateId] = useState("EST-NEW");
  const [issueDate, setIssueDate] = useState(today());
  const [ownerName, setOwnerName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [refContact, setRefContact] = useState("");
  const [address, setAddress] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [projectType, setProjectType] = useState("");
  const [floorStory, setFloorStory] = useState("");
  const [landArea, setLandArea] = useState("");
  const [status, setStatus] = useState("Draft");

  useEffect(() => {
    let active = true;
    async function loadSources() {
      setLoading(true);
      setSourceError("");
      try {
        const [fileList, proposalRows] = await Promise.all([
          landViewApi.getFinanceSheet("File List"),
          listProposals().catch(() => [] as ProposalRecord[]),
        ]);
        if (!active) return;
        setProjects((fileList.rows || []).map((row): ProjectOption | null => {
          const normalized = normalizeFileId(String(row[0] || ""));
          if (!normalized) return null;
          return { id: `LV-${normalized}`, name: String(row[1] || "").trim(), floor: String(row[4] || "").trim(), type: String(row[5] || "").trim() };
        }).filter((item): item is ProjectOption => Boolean(item)).sort((a, b) => Number(b.id.replace("LV-", "")) - Number(a.id.replace("LV-", ""))));
        setProposals((proposalRows || []).slice().sort((a, b) => String(b.Proposal_ID || "").localeCompare(String(a.Proposal_ID || ""), undefined, { numeric: true })));
      } catch (error) {
        if (active) setSourceError(error instanceof Error ? error.message : "Could not load project and proposal lists.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSources();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target) return;
      if (target.placeholder === "LV-#### · Client / project name") setProjectName(target.value);
      if (target.placeholder === "Feni, Dhaka…") setLocation(target.value);
    };
    document.addEventListener("input", handler, true);
    return () => document.removeEventListener("input", handler, true);
  }, []);

  function syncWorkspace(name: string, place: string) {
    window.setTimeout(() => {
      setControlledInput("LV-#### · Client / project name", name);
      setControlledInput("Feni, Dhaka…", place);
    }, 0);
  }

  function clearSource() {
    setSelectedProject("");
    setSelectedProposal("");
    setEstimateId("EST-NEW");
    setOwnerName("");
    setContactNo("");
    setReferredBy("");
    setRefContact("");
    setAddress("");
    setReferenceId("");
    setProjectName("");
    setLocation("");
    setProjectType("");
    setFloorStory("");
    setLandArea("");
    setStatus("Draft");
    syncWorkspace("", "");
  }

  function chooseProject(id: string) {
    setSelectedProject(id);
    setSelectedProposal("");
    if (!id) return;
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    setEstimateId(`EST-${project.id}-01`);
    setReferenceId(project.id);
    setOwnerName(project.name || "");
    setProjectName(project.name || "");
    setProjectType(project.type || "");
    setFloorStory(project.floor || "");
    setStatus("Project");
    syncWorkspace(`${project.id} · ${project.name || "Project"}`, location);
  }

  function chooseProposal(id: string) {
    setSelectedProposal(id);
    setSelectedProject("");
    if (!id) return;
    const proposal = proposals.find((item) => String(item.Proposal_ID || "") === id);
    if (!proposal) return;
    const name = proposal.Project_Title || proposal.Client_Name || "Proposal Estimate";
    const place = proposal.Project_Location || "";
    setEstimateId(`EST-${String(proposal.Proposal_ID || "NEW")}-01`);
    setReferenceId(String(proposal.Proposal_ID || ""));
    setOwnerName(proposal.Client_Name || "");
    setContactNo(proposal.Phone || "");
    setReferredBy(proposal.Referred_By || "");
    setRefContact(proposal.Ref_Contact || "");
    setAddress(proposal.Address || "");
    setProjectName(name);
    setLocation(place);
    setProjectType(proposal.Project_Type || "");
    setFloorStory(proposal.Floors || "");
    setLandArea(proposal.Plot_Area || "");
    setStatus(proposal.Status || "Draft");
    syncWorkspace(`${proposal.Proposal_ID || "Proposal"} · ${name}`, place);
  }

  function printDetailed() {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.includes("Print Detailed BOQ"));
    if (button) button.click();
    else window.print();
  }

  return (
    <div className="des-shell">
      <style>{`
        .des-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.des-toolbar a{font-size:11px;font-weight:900;text-decoration:none;color:inherit}.des-toolbar a:last-child{color:#d61f26}
        .des-source{margin-bottom:14px;border:1px solid var(--theme-line-_dfe5e9,#dfe5e9);border-radius:13px;background:var(--theme-bg-_fff,#fff);overflow:hidden}.des-source-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 14px;background:var(--theme-bg-_f7f9fa,#f7f9fa);border-bottom:2px solid #d61f26}.des-source-head small{display:block;color:#d61f26;font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.des-source-head strong{display:block;margin-top:3px;font-size:13px}.des-source-body{padding:13px}.des-source-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:9px;align-items:end}.des-field label{display:block;margin-bottom:5px;color:var(--theme-ink-_687783,#687783);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.des-field input,.des-field select{width:100%;box-sizing:border-box;border:1px solid var(--theme-line-_d5dde2,#d5dde2);border-radius:8px;background:var(--theme-bg-_fff,#fff);color:inherit;padding:9px 10px;font-size:10px}.des-btn{border:1px solid var(--theme-line-_d5dde2,#d5dde2);border-radius:8px;background:var(--theme-bg-_fff,#fff);color:inherit;padding:9px 11px;font-size:10px;font-weight:900;cursor:pointer}.des-btn.red{background:#d61f26;border-color:#d61f26;color:#fff}.des-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:11px}.des-meta .span2{grid-column:span 2}.des-help{margin-top:9px;color:var(--theme-ink-_687783,#687783);font-size:9px;line-height:1.5}.des-error{margin-top:9px;color:#9f2323;font-size:9px}
        .des-print-header,.des-print-footer{display:none}.des-print-header{background:#fff;color:#18222b}.des-ph-top{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:center;padding:6mm 6mm 4mm;border-bottom:4px solid #c9161d}.des-brand{display:flex;gap:11px;align-items:center}.des-logo{width:14mm;height:14mm;object-fit:contain}.des-brand strong{display:block;font-size:19pt;line-height:1;font-weight:950}.des-brand strong span{color:#c9161d}.des-brand small{display:block;margin-top:4px;font-size:7pt;letter-spacing:.14em;color:#5f6d76;font-weight:800}.des-ph-title{text-align:right}.des-ph-title small{display:block;color:#c9161d;font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.des-ph-title b{display:block;margin-top:5px;font-size:16pt;text-transform:uppercase}.des-ph-title strong{display:block;margin-top:4px;font-size:9pt;color:#5f6d76}.des-info{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #d8dde0}.des-info-col{padding:3mm 5mm}.des-info-col:first-child{border-right:1px solid #d8dde0}.des-info-line{display:grid;grid-template-columns:28mm 1fr;gap:3mm;padding:1.5mm 0;border-bottom:1px solid #edf0f2;font-size:7.5pt}.des-info-line:last-child{border-bottom:0}.des-info-line span{color:#687783;font-weight:800}.des-info-line strong{font-weight:900;overflow-wrap:anywhere}.des-print-footer{grid-template-columns:1fr auto;gap:15mm;align-items:end;border-top:1px solid #cfd5d9;margin-top:5mm;padding-top:3mm;color:#65737c;font-size:7.3pt;line-height:1.55}.des-print-footer strong{color:#18222b}.des-sign{min-width:45mm;text-align:center;border-top:1px solid #18222b;padding-top:2mm;font-weight:900;text-transform:uppercase}
        @media(max-width:900px){.des-source-grid{grid-template-columns:1fr 1fr}.des-source-grid>.des-btn{grid-column:1/-1}.des-meta{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:620px){.des-source-grid,.des-meta{grid-template-columns:1fr}.des-meta .span2{grid-column:auto}}
        @media print{
          @page{size:A4 portrait;margin:8mm}
          .des-toolbar,.des-source{display:none!important}.des-print-header{display:block!important}.des-print-footer{display:grid!important}.des-shell .de-print-title{display:none!important}.des-shell .de-table{min-width:0!important;width:100%!important}.des-shell .de-table th{font-size:6.7pt!important;padding:1.5mm!important}.des-shell .de-table td{font-size:7pt!important;padding:1.5mm!important}.des-shell .de-card{break-inside:auto!important}.des-shell .de-summary-row{font-size:8pt!important}.des-shell .de-summary-row.total{font-size:10pt!important}
        }
      `}</style>

      <div className="des-toolbar"><Link href="/admin/estimate">← Estimate Types</Link><div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}><button className="des-btn red" type="button" onClick={printDetailed}>Print / Save PDF</button><Link href="/admin/estimate/summary">Open Summary Estimate →</Link></div></div>

      <section className="des-source">
        <div className="des-source-head"><div><small>Estimate source</small><strong>Existing project, proposal, or new estimate</strong></div><strong>{loading ? "Loading…" : "Optional"}</strong></div>
        <div className="des-source-body">
          <div className="des-source-grid">
            <div className="des-field"><label>Project / File List</label><select value={selectedProject} onChange={(e)=>chooseProject(e.target.value)}><option value="">Ignore project / New estimate</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.id} · {project.name || "Unnamed project"}{project.type ? ` · ${project.type}` : ""}</option>)}</select></div>
            <div className="des-field"><label>Proposal</label><select value={selectedProposal} onChange={(e)=>chooseProposal(e.target.value)}><option value="">Ignore proposal / New estimate</option>{proposals.map((proposal)=><option key={String(proposal.Proposal_ID || proposal.Prospect_ID || proposal.Client_Name)} value={String(proposal.Proposal_ID || "")}>{proposal.Proposal_ID || "Proposal"} · {proposal.Client_Name || "Unnamed client"}{proposal.Project_Title ? ` · ${proposal.Project_Title}` : ""}</option>)}</select></div>
            <button className="des-btn" type="button" onClick={clearSource}>Clear / New</button>
          </div>

          <div className="des-meta">
            <div className="des-field"><label>Estimate ID</label><input value={estimateId} onChange={(e)=>setEstimateId(e.target.value)} /></div>
            <div className="des-field"><label>Issue Date</label><input type="date" value={issueDate} onChange={(e)=>setIssueDate(e.target.value)} /></div>
            <div className="des-field"><label>File / Proposal ID</label><input value={referenceId} onChange={(e)=>setReferenceId(e.target.value)} /></div>
            <div className="des-field"><label>Status</label><input value={status} onChange={(e)=>setStatus(e.target.value)} /></div>
            <div className="des-field"><label>Owner Name</label><input value={ownerName} onChange={(e)=>setOwnerName(e.target.value)} /></div>
            <div className="des-field"><label>Contact No</label><input value={contactNo} onChange={(e)=>setContactNo(e.target.value)} /></div>
            <div className="des-field"><label>Referred By</label><input value={referredBy} onChange={(e)=>setReferredBy(e.target.value)} /></div>
            <div className="des-field"><label>Ref. Contact</label><input value={refContact} onChange={(e)=>setRefContact(e.target.value)} /></div>
            <div className="des-field span2"><label>Address</label><input value={address} onChange={(e)=>setAddress(e.target.value)} /></div>
            <div className="des-field"><label>Project Type</label><input value={projectType} onChange={(e)=>setProjectType(e.target.value)} /></div>
            <div className="des-field"><label>Floor / Story</label><input value={floorStory} onChange={(e)=>setFloorStory(e.target.value)} /></div>
            <div className="des-field"><label>Land Area</label><input value={landArea} onChange={(e)=>setLandArea(e.target.value)} /></div>
          </div>
          <div className="des-help">Both source dropdowns are optional. Selecting a source pre-fills the estimate identity; the Detailed Estimate calculation below remains fully editable.</div>
          {sourceError && <div className="des-error">Project/proposal list issue: {sourceError}. Manual creation still works.</div>}
        </div>
      </section>

      <section className="des-print-header">
        <div className="des-ph-top"><div className="des-brand"><img className="des-logo" src="/land-view-logo.svg" alt="LAND VIEW logo"/><div><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div></div><div className="des-ph-title"><small>Estimate &amp; Costing</small><b>Detailed Estimate</b><strong>{estimateId || "EST-NEW"}</strong></div></div>
        <div className="des-info">
          <div className="des-info-col"><div className="des-info-line"><span>Estimate ID</span><strong>{estimateId || "—"}</strong></div><div className="des-info-line"><span>Owner Name</span><strong>{ownerName || "—"}</strong></div><div className="des-info-line"><span>Contact No</span><strong>{contactNo || "—"}</strong></div><div className="des-info-line"><span>Referred By</span><strong>{referredBy || "—"}</strong></div><div className="des-info-line"><span>Ref. Contact</span><strong>{refContact || "—"}</strong></div><div className="des-info-line"><span>Address</span><strong>{address || "—"}</strong></div></div>
          <div className="des-info-col"><div className="des-info-line"><span>Issue Date</span><strong>{displayDate(issueDate)}</strong></div><div className="des-info-line"><span>File / Proposal ID</span><strong>{referenceId || "—"}</strong></div><div className="des-info-line"><span>Project Type</span><strong>{projectType || "—"}</strong></div><div className="des-info-line"><span>Floor / Story</span><strong>{floorStory || "—"}</strong></div><div className="des-info-line"><span>Land Area</span><strong>{landArea || "—"}</strong></div><div className="des-info-line"><span>Status</span><strong>{status || "Draft"}</strong></div></div>
        </div>
      </section>

      <DetailedEstimateWorkspace />

      <footer className="des-print-footer"><div><strong>LAND VIEW Architects &amp; Engineers</strong><br/>F. Rahman AC Market (2nd Floor), SSK Road, Feni Sadar, Feni<br/>Contact: +88 0140 80 80 400 · +88 01902 500 400</div><div className="des-sign">Authorized Signature</div></footer>
    </div>
  );
}
