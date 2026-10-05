"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { normalizeFileId } from "@/lib/sheet-invoices";
import { listProposals, type ProposalRecord } from "@/lib/proposal-api";

type AllowanceRow = { id: string; item: string; amount: number };
type ProjectOption = { id: string; name: string; type: string; floor: string };

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const numberText = (value: number) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);

const uid = () => `allow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const today = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const displayDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const safePdfTitle = (value: string) =>
  value.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "LAND-VIEW-Summary-Estimate";

const parseFloorCount = (value: unknown) => {
  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const defaultAllowances: AllowanceRow[] = [
  { id: "allow-preliminary", item: "Preliminary / Site Setup", amount: 0 },
  { id: "allow-foundation", item: "Foundation / Soil Condition Adjustment", amount: 0 },
  { id: "allow-mep", item: "Special MEP / Fire Safety Allowance", amount: 0 },
  { id: "allow-external", item: "External Works", amount: 0 },
  { id: "allow-other", item: "Other Provisional Sum", amount: 0 },
];

export default function SummaryEstimateWorkspace() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
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

  const [floorArea, setFloorArea] = useState(0);
  const [floors, setFloors] = useState(1);
  const [ratePerSft, setRatePerSft] = useState(0);
  const [allowances, setAllowances] = useState<AllowanceRow[]>(defaultAllowances);
  const [contingencyPct, setContingencyPct] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadSources() {
      setSourcesLoading(true);
      setSourceError("");
      try {
        const [fileList, proposalRows] = await Promise.all([
          landViewApi.getFinanceSheet("File List"),
          listProposals().catch(() => [] as ProposalRecord[]),
        ]);
        if (!active) return;
        const projectRows = (fileList.rows || [])
          .map((row): ProjectOption | null => {
            const normalized = normalizeFileId(String(row[0] || ""));
            if (!normalized) return null;
            return {
              id: `LV-${normalized}`,
              name: String(row[1] || "").trim(),
              floor: String(row[4] || "").trim(),
              type: String(row[5] || "").trim(),
            };
          })
          .filter((item): item is ProjectOption => Boolean(item))
          .sort((a, b) => Number(b.id.replace("LV-", "")) - Number(a.id.replace("LV-", "")));
        setProjects(projectRows);
        setProposals((proposalRows || []).slice().sort((a, b) => String(b.Proposal_ID || "").localeCompare(String(a.Proposal_ID || ""), undefined, { numeric: true })));
      } catch (error) {
        if (active) setSourceError(error instanceof Error ? error.message : "Could not load project and proposal lists.");
      } finally {
        if (active) setSourcesLoading(false);
      }
    }
    void loadSources();
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => {
    const totalArea = Math.max(0, floorArea) * Math.max(0, floors);
    const baseCost = totalArea * Math.max(0, ratePerSft);
    const allowanceTotal = allowances.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
    const subtotal = baseCost + allowanceTotal;
    const contingency = subtotal * (Math.max(0, contingencyPct) / 100);
    return { totalArea, baseCost, allowanceTotal, subtotal, contingency, grand: subtotal + contingency };
  }, [floorArea, floors, ratePerSft, allowances, contingencyPct]);

  const printableRows = useMemo(() => {
    const rows = [{ item: `Base Construction Cost · ${numberText(totals.totalArea)} sft × ${money(ratePerSft)}/sft`, amount: totals.baseCost }];
    allowances.filter((row) => row.item.trim() || row.amount > 0).forEach((row) => rows.push({ item: row.item || "Allowance", amount: Math.max(0, Number(row.amount) || 0) }));
    if (contingencyPct > 0 || totals.contingency > 0) rows.push({ item: `Contingency (${numberText(contingencyPct)}%)`, amount: totals.contingency });
    return rows;
  }, [allowances, contingencyPct, ratePerSft, totals]);

  function resetSourceFields() {
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
  }

  function chooseProject(id: string) {
    setSelectedProject(id);
    setSelectedProposal("");
    if (!id) return;
    const project = projects.find((row) => row.id === id);
    if (!project) return;
    setReferenceId(project.id);
    setEstimateId(`EST-${project.id}-01`);
    setOwnerName(project.name || "");
    setProjectName(project.name || "");
    setProjectType(project.type || "");
    setFloorStory(project.floor || "");
    setStatus("Project");
    const count = parseFloorCount(project.floor);
    if (count) setFloors(count);
  }

  function chooseProposal(id: string) {
    setSelectedProposal(id);
    setSelectedProject("");
    if (!id) return;
    const proposal = proposals.find((row) => String(row.Proposal_ID || "") === id);
    if (!proposal) return;
    setReferenceId(String(proposal.Proposal_ID || ""));
    setEstimateId(`EST-${String(proposal.Proposal_ID || "NEW")}-01`);
    setOwnerName(proposal.Client_Name || "");
    setContactNo(proposal.Phone || "");
    setReferredBy(proposal.Referred_By || "");
    setRefContact(proposal.Ref_Contact || "");
    setAddress(proposal.Address || "");
    setProjectName(proposal.Project_Title || proposal.Client_Name || "");
    setLocation(proposal.Project_Location || "");
    setProjectType(proposal.Project_Type || "");
    setFloorStory(proposal.Floors || "");
    setLandArea(proposal.Plot_Area || "");
    setStatus(proposal.Status || "Draft");
    const count = parseFloorCount(proposal.Floors);
    if (count) setFloors(count);
  }

  function updateAllowance(id: string, change: Partial<AllowanceRow>) {
    setAllowances((rows) => rows.map((row) => row.id === id ? { ...row, ...change } : row));
  }

  function addAllowance() {
    setAllowances((rows) => [...rows, { id: uid(), item: "Custom Allowance", amount: 0 }]);
  }

  function printEstimate() {
    const previousTitle = document.title;
    document.title = safePdfTitle(`${estimateId || referenceId || "Estimate"}-${ownerName || projectName || "Project"}-Summary-Estimate`);
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore, { once: true });
    window.setTimeout(restore, 60000);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  }

  return (
    <div className="se-page">
      <style>{`
        .se-page{max-width:1180px;margin:0 auto;color:var(--theme-ink-_17222b,#17222b)}
        .se-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
        .se-back,.se-switch{font-size:11px;font-weight:900;text-decoration:none;color:inherit}.se-switch{color:#d61f26}
        .se-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:16px}.se-head-actions{display:flex;gap:8px;flex-wrap:wrap}
        .se-head small{color:#d61f26;font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.se-head h1{font-size:34px;margin:5px 0 7px}.se-head p{max-width:760px;margin:0;color:var(--theme-ink-_687783,#687783);font-size:12px;line-height:1.65}
        .se-btn{border:1px solid var(--theme-line-_d5dde2,#d5dde2);border-radius:9px;background:var(--theme-bg-_fff,#fff);color:inherit;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer}.se-btn.red{background:#d61f26;border-color:#d61f26;color:#fff}.se-btn:disabled{opacity:.55;cursor:not-allowed}
        .se-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:start}.se-stack{display:grid;gap:12px}
        .se-card{border:1px solid var(--theme-line-_dfe5e9,#dfe5e9);border-radius:14px;background:var(--theme-bg-_fff,#fff);overflow:hidden;box-shadow:0 7px 20px rgba(16,24,32,.04)}
        .se-card-head{padding:12px 14px;border-bottom:2px solid #d61f26;background:var(--theme-bg-_f7f9fa,#f7f9fa);display:flex;align-items:center;justify-content:space-between;gap:12px}.se-card-head small{display:block;color:#d61f26;font-size:8px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.se-card-head strong{display:block;margin-top:3px;font-size:14px}
        .se-body{padding:14px}.se-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.se-field.span2{grid-column:span 2}.se-field.span3{grid-column:1/-1}.se-field label{display:block;margin:0 0 5px;color:var(--theme-ink-_687783,#687783);font-size:8px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
        .se-field input,.se-field select,.se-table input{width:100%;box-sizing:border-box;border:1px solid var(--theme-line-_d5dde2,#d5dde2);border-radius:8px;background:var(--theme-bg-_fff,#fff);color:inherit;padding:9px 10px;font-size:10px;outline:none}.se-field input:focus,.se-field select:focus,.se-table input:focus{border-color:#d61f26}
        .se-source-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.se-source-help{margin-top:9px;color:var(--theme-ink-_687783,#687783);font-size:9px;line-height:1.55}.se-source-help b{color:inherit}.se-error{margin-top:10px;padding:9px 11px;border:1px solid #efb8b8;border-radius:8px;background:#fff6f6;color:#9f2323;font-size:9px}
        .se-note{margin-top:10px;padding:10px 12px;border-left:3px solid #d61f26;border-radius:6px;background:var(--theme-bg-_f7f9fa,#f7f9fa);color:var(--theme-ink-_687783,#687783);font-size:9px;line-height:1.6}.se-note b{color:inherit}
        .se-table{width:100%;border-collapse:collapse}.se-table th{padding:9px 10px;text-align:left;background:var(--theme-bg-_f7f9fa,#f7f9fa);color:var(--theme-ink-_687783,#687783);font-size:8px;text-transform:uppercase;border-bottom:1px solid var(--theme-line-_e2e7ea,#e2e7ea)}.se-table td{padding:8px 10px;border-bottom:1px solid var(--theme-line-_edf0f2,#edf0f2);font-size:10px}.se-table td:last-child,.se-table th:last-child{text-align:right}.se-table .amount-input{max-width:170px;text-align:right}.se-remove{border:0;background:transparent;color:#d61f26;font-size:10px;font-weight:900;cursor:pointer}.se-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
        .se-side{position:sticky;top:12px}.se-metric{padding:13px 14px;border-bottom:1px solid var(--theme-line-_e7ebee,#e7ebee)}.se-metric span{display:block;color:var(--theme-ink-_687783,#687783);font-size:8px;font-weight:900;text-transform:uppercase}.se-metric strong{display:block;margin-top:5px;font-size:18px}.se-total strong{font-size:25px;color:#d61f26}.se-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--theme-line-_edf0f2,#edf0f2);font-size:10px}.se-row span{color:var(--theme-ink-_687783,#687783)}.se-row.total{font-size:13px;border-bottom:0;padding-top:12px}.se-row.total strong{color:#d61f26}
        .se-preview-label{margin:22px 0 9px;color:#687783;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.se-print-sheet{background:#fff;color:#18222b;border:1px solid #d9dfe3;border-radius:12px;overflow:hidden;box-shadow:0 12px 28px rgba(16,24,32,.07)}
        .se-sheet-header{display:grid;grid-template-columns:1.25fr 1fr;gap:18px;align-items:center;padding:20px 22px 15px;border-bottom:4px solid #c9161d}.se-brand-lockup{display:flex;align-items:center;gap:12px}.se-brand-logo{width:54px;height:54px;object-fit:contain}.se-brand-words strong{display:block;font-size:25px;line-height:1;font-weight:950;letter-spacing:.02em}.se-brand-words strong span{color:#c9161d}.se-brand-words small{display:block;margin-top:5px;font-size:8px;font-weight:800;letter-spacing:.16em;color:#5f6d76}.se-brand-tag{display:block;margin-top:7px;font-size:9px;font-style:italic;color:#6d7880}.se-sheet-title{text-align:right}.se-sheet-title small{display:block;color:#c9161d;font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.se-sheet-title b{display:block;margin-top:6px;font-size:23px;line-height:1.05;text-transform:uppercase}.se-sheet-title strong{display:block;margin-top:5px;font-size:11px;color:#5f6d76}
        .se-info-board{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #d8dde0}.se-info-col{padding:13px 18px}.se-info-col:first-child{border-right:1px solid #d8dde0}.se-info-line{display:grid;grid-template-columns:95px 1fr;gap:10px;padding:5px 0;border-bottom:1px solid #edf0f2;font-size:9px}.se-info-line:last-child{border-bottom:0}.se-info-line span{color:#687783;font-weight:800}.se-info-line strong{font-weight:900;min-width:0;overflow-wrap:anywhere}
        .se-sheet-body{padding:18px 22px 16px}.se-sheet-project{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:12px}.se-sheet-project span{display:block;color:#c9161d;font-size:8px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.se-sheet-project h2{margin:4px 0 0;font-size:17px}.se-sheet-project p{margin:4px 0 0;color:#687783;font-size:9px}.se-sheet-area{text-align:right}.se-sheet-area strong{display:block;margin-top:4px;font-size:15px}
        .se-cost-table{width:100%;border-collapse:collapse}.se-cost-table th{padding:8px 9px;background:#eef1f3;color:#596873;text-align:left;font-size:8px;font-weight:900;text-transform:uppercase;border:1px solid #d9dee2}.se-cost-table td{padding:9px;border:1px solid #e0e4e7;font-size:9px;vertical-align:top}.se-cost-table td:first-child,.se-cost-table th:first-child{width:48px;text-align:center}.se-cost-table td:last-child,.se-cost-table th:last-child{text-align:right;width:165px}.se-cost-table .se-base-row td{font-weight:900}.se-cost-table tfoot td{font-weight:900;background:#fafafa}.se-cost-table tfoot tr:last-child td{background:#18222b;color:#fff;font-size:11px}.se-cost-table tfoot tr:last-child td:last-child{color:#fff}
        .se-sheet-summary{display:grid;grid-template-columns:1fr 290px;gap:20px;margin-top:16px;align-items:start}.se-sheet-note{font-size:9px;line-height:1.6;color:#687783}.se-sheet-note strong{color:#18222b}.se-total-box{border:1px solid #cfd6da;border-radius:7px;overflow:hidden}.se-total-line{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border-bottom:1px solid #e2e6e9;font-size:9px}.se-total-line:last-child{border:0;background:#c9161d;color:#fff;font-size:12px;font-weight:950}.se-total-line span{font-weight:800}.se-total-line strong{text-align:right}
        .se-sheet-footer{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end;margin:18px 22px 0;padding:13px 0 17px;border-top:1px solid #cfd5d9}.se-footer-copy{font-size:8px;line-height:1.65;color:#66747d}.se-footer-copy strong{color:#18222b}.se-sign{text-align:center;min-width:165px}.se-sign-line{border-top:1px solid #18222b;margin-top:22px;padding-top:5px;font-size:8px;font-weight:900;text-transform:uppercase}
        @media(max-width:900px){.se-grid{grid-template-columns:1fr}.se-side{position:static}.se-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.se-source-grid{grid-template-columns:1fr 1fr}.se-source-grid .se-btn{grid-column:1/-1}.se-sheet-summary{grid-template-columns:1fr}}
        @media(max-width:620px){.se-head{align-items:flex-start;flex-direction:column}.se-fields{grid-template-columns:1fr}.se-field.span2,.se-field.span3{grid-column:auto}.se-head h1{font-size:28px}.se-table{min-width:620px}.se-table-wrap{overflow:auto}.se-source-grid{grid-template-columns:1fr}.se-sheet-header{grid-template-columns:1fr}.se-sheet-title{text-align:left}.se-info-board{grid-template-columns:1fr}.se-info-col:first-child{border-right:0;border-bottom:1px solid #d8dde0}.se-sheet-project{align-items:flex-start;flex-direction:column}.se-sheet-area{text-align:left}.se-sheet-footer{grid-template-columns:1fr}.se-sign{justify-self:end}}
        @media print{
          @page{size:A4 portrait;margin:8mm}
          body{background:#fff!important}
          .masthead,.se-toolbar,.se-head,.se-editing,.se-preview-label{display:none!important}
          .admin-main,.tmg-admin-main,.content-wrap,.tmg-content-wrap{margin:0!important;padding:0!important;max-width:none!important}
          .se-page{max-width:none!important;margin:0!important;color:#111!important}
          .se-print-sheet{display:block!important;border:0!important;border-radius:0!important;box-shadow:none!important;width:100%!important;min-height:270mm!important}
          .se-sheet-header{padding:7mm 6mm 4mm}.se-brand-logo{width:15mm;height:15mm}.se-brand-words strong{font-size:20pt}.se-sheet-title b{font-size:17pt}
          .se-info-col{padding:3mm 5mm}.se-info-line{font-size:8pt;padding:1.6mm 0}.se-sheet-body{padding:4mm 6mm}.se-cost-table th{font-size:7.5pt;padding:2mm}.se-cost-table td{font-size:8pt;padding:2.2mm}.se-sheet-summary{margin-top:4mm}.se-sheet-note{font-size:7.5pt}.se-total-line{font-size:8pt;padding:2mm 2.5mm}.se-total-line:last-child{font-size:10pt}.se-sheet-footer{margin:5mm 6mm 0;padding:3mm 0 0}.se-footer-copy,.se-sign-line{font-size:7.5pt}
          .se-cost-table tr,.se-info-line,.se-total-box{break-inside:avoid;page-break-inside:avoid}
        }
      `}</style>

      <div className="se-toolbar">
        <Link className="se-back" href="/admin/estimate">← Estimate Types</Link>
        <Link className="se-switch" href="/admin/estimate/detailed">Open Detailed Estimate →</Link>
      </div>

      <header className="se-head">
        <div>
          <small>LAND VIEW / Summary Estimate</small>
          <h1>Summary Building Estimate</h1>
          <p>Select an existing project or proposal to fill the estimate identity, or ignore both lists and type a completely new estimate. Printing now follows the LAND VIEW billing/invoice document style.</p>
        </div>
        <div className="se-head-actions"><button className="se-btn red" type="button" onClick={printEstimate}>Print / Save PDF</button></div>
      </header>

      <div className="se-editing">
        <section className="se-card" style={{marginBottom:12}}>
          <div className="se-card-head"><div><small>Source</small><strong>Use an existing record or create a new estimate</strong></div><strong>{sourcesLoading ? "Loading…" : "Optional"}</strong></div>
          <div className="se-body">
            <div className="se-source-grid">
              <div className="se-field"><label>Project / File List</label><select value={selectedProject} onChange={(e) => chooseProject(e.target.value)}><option value="">Ignore project / New estimate</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.id} · {project.name || "Unnamed project"}{project.type ? ` · ${project.type}` : ""}</option>)}</select></div>
              <div className="se-field"><label>Proposal</label><select value={selectedProposal} onChange={(e) => chooseProposal(e.target.value)}><option value="">Ignore proposal / New estimate</option>{proposals.map((proposal) => <option key={String(proposal.Proposal_ID || proposal.Prospect_ID || proposal.Client_Name)} value={String(proposal.Proposal_ID || "")}>{proposal.Proposal_ID || "Proposal"} · {proposal.Client_Name || "Unnamed client"}{proposal.Project_Title ? ` · ${proposal.Project_Title}` : ""}</option>)}</select></div>
              <button className="se-btn" type="button" onClick={resetSourceFields}>Clear / New</button>
            </div>
            <div className="se-source-help"><b>Both dropdowns are optional.</b> Selecting a project or proposal only pre-fills the form. You can still edit every field below before printing.</div>
            {sourceError && <div className="se-error">Project/proposal lists could not fully load: {sourceError}. Manual estimate creation still works.</div>}
          </div>
        </section>

        <div className="se-grid">
          <main className="se-stack">
            <section className="se-card">
              <div className="se-card-head"><div><small>Estimate identity</small><strong>Invoice-style project information</strong></div></div>
              <div className="se-body se-fields">
                <div className="se-field"><label>Estimate ID</label><input value={estimateId} onChange={(e) => setEstimateId(e.target.value)} placeholder="EST-LV-001-01" /></div>
                <div className="se-field"><label>Issue Date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
                <div className="se-field"><label>File / Proposal ID</label><input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="LV-001 / PROP-..." /></div>
                <div className="se-field"><label>Owner Name</label><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Client / owner" /></div>
                <div className="se-field"><label>Contact No</label><input value={contactNo} onChange={(e) => setContactNo(e.target.value)} placeholder="01XXXXXXXXX" /></div>
                <div className="se-field"><label>Referred By</label><input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} /></div>
                <div className="se-field"><label>Ref. Contact</label><input value={refContact} onChange={(e) => setRefContact(e.target.value)} /></div>
                <div className="se-field span2"><label>Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
                <div className="se-field span2"><label>Project / Estimate Title</label><input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Residential Building Estimate" /></div>
                <div className="se-field"><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Feni, Bangladesh" /></div>
                <div className="se-field"><label>Project Type</label><input value={projectType} onChange={(e) => setProjectType(e.target.value)} /></div>
                <div className="se-field"><label>Floor / Story</label><input value={floorStory} onChange={(e) => setFloorStory(e.target.value)} /></div>
                <div className="se-field"><label>Land Area</label><input value={landArea} onChange={(e) => setLandArea(e.target.value)} /></div>
                <div className="se-field"><label>Status</label><input value={status} onChange={(e) => setStatus(e.target.value)} /></div>
              </div>
            </section>

            <section className="se-card">
              <div className="se-card-head"><div><small>Quick costing</small><strong>Area × rate calculation</strong></div></div>
              <div className="se-body se-fields">
                <div className="se-field"><label>Typical Floor Area (sft)</label><input type="number" min={0} value={floorArea} onChange={(e) => setFloorArea(Math.max(0, Number(e.target.value) || 0))} /></div>
                <div className="se-field"><label>No. of Floors</label><input type="number" min={1} step={1} value={floors} onChange={(e) => setFloors(Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></div>
                <div className="se-field"><label>Construction Rate (BDT / sft)</label><input type="number" min={0} value={ratePerSft} onChange={(e) => setRatePerSft(Math.max(0, Number(e.target.value) || 0))} /></div>
              </div>
            </section>

            <section className="se-card">
              <div className="se-card-head"><div><small>Allowances</small><strong>Project-specific additions</strong></div><strong>{money(totals.allowanceTotal)}</strong></div>
              <div className="se-table-wrap">
                <table className="se-table">
                  <thead><tr><th>Item</th><th>Amount</th><th style={{width:70}}>Action</th></tr></thead>
                  <tbody>{allowances.map((row) => <tr key={row.id}><td><input value={row.item} onChange={(e) => updateAllowance(row.id, { item: e.target.value })} /></td><td><input className="amount-input" type="number" min={0} value={row.amount} onChange={(e) => updateAllowance(row.id, { amount: Math.max(0, Number(e.target.value) || 0) })} /></td><td><button className="se-remove" type="button" onClick={() => setAllowances((rows) => rows.filter((item) => item.id !== row.id))}>Remove</button></td></tr>)}</tbody>
                </table>
              </div>
              <div className="se-body"><div className="se-actions"><button className="se-btn" type="button" onClick={addAllowance}>+ Add Allowance</button></div><div className="se-note"><b>Allowances are additional to the BDT/sft rate.</b> Use them only for costs not already included in the selected construction rate.</div></div>
            </section>

            <section className="se-card">
              <div className="se-card-head"><div><small>Adjustment</small><strong>Contingency</strong></div></div>
              <div className="se-body se-fields">
                <div className="se-field"><label>Contingency (%)</label><input type="number" min={0} step="0.1" value={contingencyPct} onChange={(e) => setContingencyPct(Math.max(0, Number(e.target.value) || 0))} /></div>
                <div className="se-field"><label>Calculated Contingency</label><input readOnly value={money(totals.contingency)} /></div>
                <div className="se-field"><label>Grand Total</label><input readOnly value={money(totals.grand)} /></div>
              </div>
            </section>
          </main>

          <aside className="se-card se-side">
            <div className="se-card-head"><div><small>Summary</small><strong>{ownerName || projectName || "Unassigned estimate"}</strong></div></div>
            <div className="se-metric"><span>Total built-up area</span><strong>{numberText(totals.totalArea)} sft</strong></div>
            <div className="se-metric"><span>Base construction cost</span><strong>{money(totals.baseCost)}</strong></div>
            <div className="se-body"><div className="se-row"><span>Base Cost</span><strong>{money(totals.baseCost)}</strong></div><div className="se-row"><span>Allowances</span><strong>{money(totals.allowanceTotal)}</strong></div><div className="se-row"><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div><div className="se-row"><span>Contingency</span><strong>{money(totals.contingency)}</strong></div><div className="se-row total"><span>Summary Estimate</span><strong>{money(totals.grand)}</strong></div></div>
            <div className="se-metric se-total"><span>Estimated Project Cost</span><strong>{money(totals.grand)}</strong></div>
            <div className="se-body"><button className="se-btn red" style={{width:"100%"}} type="button" onClick={printEstimate}>Print / Save PDF</button></div>
          </aside>
        </div>
      </div>

      <div className="se-preview-label">Invoice-style print preview</div>
      <article className="se-print-sheet">
        <header className="se-sheet-header">
          <div>
            <div className="se-brand-lockup"><img className="se-brand-logo" src="/land-view-logo.svg" alt="LAND VIEW logo" /><div className="se-brand-words"><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div></div>
            <em className="se-brand-tag">Building a safer tomorrow</em>
          </div>
          <div className="se-sheet-title"><small>Estimate &amp; Costing</small><b>Summary Estimate</b><strong>{estimateId || "EST-NEW"}</strong></div>
        </header>

        <section className="se-info-board">
          <div className="se-info-col">
            <div className="se-info-line"><span>Estimate ID</span><strong>{estimateId || "—"}</strong></div>
            <div className="se-info-line"><span>Owner Name</span><strong>{ownerName || "—"}</strong></div>
            <div className="se-info-line"><span>Contact No</span><strong>{contactNo || "—"}</strong></div>
            <div className="se-info-line"><span>Referred By</span><strong>{referredBy || "—"}</strong></div>
            <div className="se-info-line"><span>Ref. Contact</span><strong>{refContact || "—"}</strong></div>
            <div className="se-info-line"><span>Address</span><strong>{address || "—"}</strong></div>
          </div>
          <div className="se-info-col">
            <div className="se-info-line"><span>Issue Date</span><strong>{displayDate(issueDate)}</strong></div>
            <div className="se-info-line"><span>File / Proposal ID</span><strong>{referenceId || "—"}</strong></div>
            <div className="se-info-line"><span>Project Type</span><strong>{projectType || "—"}</strong></div>
            <div className="se-info-line"><span>Floor / Story</span><strong>{floorStory || `${floors} Floor${floors === 1 ? "" : "s"}`}</strong></div>
            <div className="se-info-line"><span>Land Area</span><strong>{landArea || "—"}</strong></div>
            <div className="se-info-line"><span>Status</span><strong>{status || "Draft"}</strong></div>
          </div>
        </section>

        <div className="se-sheet-body">
          <div className="se-sheet-project"><div><span>Project / Estimate</span><h2>{projectName || ownerName || "Summary Building Estimate"}</h2><p>{location || "Location not specified"}</p></div><div className="se-sheet-area"><span>Total Built-up Area</span><strong>{numberText(totals.totalArea)} sft</strong></div></div>

          <table className="se-cost-table">
            <thead><tr><th>SL.</th><th>Description</th><th>Amount (BDT)</th></tr></thead>
            <tbody>{printableRows.map((row, index) => <tr key={`${row.item}-${index}`} className={index === 0 ? "se-base-row" : ""}><td>{index + 1}</td><td>{row.item}</td><td>{money(row.amount)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={2}>Subtotal</td><td>{money(totals.subtotal)}</td></tr><tr><td colSpan={2}>Estimated Project Cost</td><td>{money(totals.grand)}</td></tr></tfoot>
          </table>

          <div className="se-sheet-summary">
            <div className="se-sheet-note"><strong>Estimate basis:</strong> This summary estimate is prepared from the entered typical floor area, number of floors, construction rate and listed project allowances. It is a preliminary budget and may be refined through the Detailed Estimate / BOQ workflow.</div>
            <div className="se-total-box"><div className="se-total-line"><span>Base Construction</span><strong>{money(totals.baseCost)}</strong></div><div className="se-total-line"><span>Allowances</span><strong>{money(totals.allowanceTotal)}</strong></div><div className="se-total-line"><span>Contingency</span><strong>{money(totals.contingency)}</strong></div><div className="se-total-line"><span>GRAND TOTAL</span><strong>{money(totals.grand)}</strong></div></div>
          </div>
        </div>

        <footer className="se-sheet-footer"><div className="se-footer-copy"><strong>LAND VIEW Architects &amp; Engineers</strong><br />F. Rahman AC Market (2nd Floor), SSK Road, Feni Sadar, Feni<br />Contact: +88 0140 80 80 400 · +88 01902 500 400</div><div className="se-sign"><div className="se-sign-line">Authorized Signature</div></div></footer>
      </article>
    </div>
  );
}
