"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import { buildSheetInvoices, normalizeFileId } from "@/lib/sheet-invoices";
import { listProposals, type ProposalRecord } from "@/lib/proposal-api";
import styles from "@/app/admin/finance/invoices/invoice.module.css";

type AllowanceRow = { id: string; item: string; amount: number };
type ProjectOption = { id: string; name: string; type: string; floor: string };

const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(value) || 0);
const amount = (value: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(Number(value) || 0);
const qty = (value: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(value) || 0);
const uid = () => `allow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const displayDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value || "—" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
const safeTitle = (value: string) => value.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "LAND-VIEW-Summary-Estimate";
const floorCount = (value: unknown) => {
  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : 0;
  return parsed > 0 ? parsed : 0;
};

const defaultAllowances: AllowanceRow[] = [
  { id: "preliminary", item: "Preliminary / Site Setup", amount: 0 },
  { id: "foundation", item: "Foundation / Soil Condition Adjustment", amount: 0 },
  { id: "mep", item: "Special MEP / Fire Safety Allowance", amount: 0 },
  { id: "external", item: "External Works", amount: 0 },
  { id: "other", item: "Other Provisional Sum", amount: 0 },
];

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "1px solid var(--theme-line-_394a55,#394a55)", borderRadius: 7,
  background: "var(--theme-bg-_0a1219,#0a1219)", color: "var(--theme-ink-_fff,#fff)", padding: "10px 11px", fontSize: 11,
};
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 5, fontSize: 9, fontWeight: 900, letterSpacing: ".7px", color: "var(--theme-ink-_94a3ad,#94a3ad)", textTransform: "uppercase" };

export default function SummaryEstimateFinanceWorkspace() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
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
  const [projectTitle, setProjectTitle] = useState("");
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
    async function load() {
      setLoadingSources(true); setSourceError("");
      try {
        const [fileList, proposalRows] = await Promise.all([landViewApi.getFinanceSheet("File List"), listProposals().catch(() => [] as ProposalRecord[])]);
        if (!active) return;
        const rows = (fileList.rows || []).map((row): ProjectOption | null => {
          const id = normalizeFileId(String(row[0] || ""));
          if (!id) return null;
          return { id: `LV-${id}`, name: String(row[1] || "").trim(), floor: String(row[4] || "").trim(), type: String(row[5] || "").trim() };
        }).filter((row): row is ProjectOption => Boolean(row)).sort((a,b) => Number(b.id.slice(3))-Number(a.id.slice(3)));
        setProjects(rows);
        setProposals((proposalRows || []).slice().sort((a,b) => String(b.Proposal_ID || "").localeCompare(String(a.Proposal_ID || ""), undefined, { numeric: true })));
      } catch (error) {
        if (active) setSourceError(error instanceof Error ? error.message : "Could not load project/proposal lists.");
      } finally { if (active) setLoadingSources(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => {
    const totalArea = Math.max(0, floorArea) * Math.max(1, floors);
    const baseCost = totalArea * Math.max(0, ratePerSft);
    const allowanceTotal = allowances.reduce((sum,row) => sum + Math.max(0, Number(row.amount) || 0), 0);
    const subtotal = baseCost + allowanceTotal;
    const contingency = subtotal * Math.max(0, contingencyPct) / 100;
    return { totalArea, baseCost, allowanceTotal, subtotal, contingency, grand: subtotal + contingency };
  }, [floorArea, floors, ratePerSft, allowances, contingencyPct]);

  async function chooseProject(value: string) {
    setSelectedProject(value); setSelectedProposal("");
    if (!value) return;
    const project = projects.find((row) => row.id === value);
    if (project) {
      setReferenceId(project.id); setEstimateId(`EST-${project.id}-01`); setOwnerName(project.name); setProjectTitle(project.name);
      setProjectType(project.type); setFloorStory(project.floor); setStatus("Project");
      const count = floorCount(project.floor); if (count) setFloors(count);
    }
    try {
      const id = normalizeFileId(value);
      if (!id) return;
      const response = await fetch(`/api/project-billing?fileId=${encodeURIComponent(`LV-${id}`)}`, { credentials: "same-origin", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success || !Array.isArray(json?.data?.sheets)) return;
      const billing = buildSheetInvoices(json.data.sheets as FinanceSheetData[], id);
      setOwnerName(billing.client.name || project?.name || ""); setContactNo(billing.client.phone || ""); setReferredBy(billing.client.referredBy || "");
      setRefContact(billing.client.refContact || ""); setAddress(billing.client.address || ""); setProjectType(billing.client.type || project?.type || "");
      setFloorStory(billing.client.floor || project?.floor || ""); setLandArea(billing.client.area || ""); setStatus(billing.client.status || "Project");
    } catch { /* File List identity is enough if billing details are unavailable. */ }
  }

  function chooseProposal(value: string) {
    setSelectedProposal(value); setSelectedProject("");
    if (!value) return;
    const p = proposals.find((row) => String(row.Proposal_ID || "") === value);
    if (!p) return;
    setReferenceId(String(p.Proposal_ID || "")); setEstimateId(`EST-${String(p.Proposal_ID || "NEW")}-01`); setOwnerName(p.Client_Name || "");
    setContactNo(p.Phone || ""); setReferredBy(p.Referred_By || ""); setRefContact(p.Ref_Contact || ""); setAddress(p.Address || "");
    setProjectTitle(p.Project_Title || p.Client_Name || ""); setLocation(p.Project_Location || ""); setProjectType(p.Project_Type || "");
    setFloorStory(p.Floors || ""); setLandArea(p.Plot_Area || ""); setStatus(p.Status || "Draft");
    const count = floorCount(p.Floors); if (count) setFloors(count);
  }

  function clearSource() {
    setSelectedProject(""); setSelectedProposal(""); setEstimateId("EST-NEW"); setOwnerName(""); setContactNo(""); setReferredBy("");
    setRefContact(""); setAddress(""); setReferenceId(""); setProjectTitle(""); setLocation(""); setProjectType(""); setFloorStory(""); setLandArea(""); setStatus("Draft");
  }

  function printEstimate() {
    const previous = document.title;
    document.title = safeTitle(`${estimateId}-${ownerName || projectTitle || "Project"}-Summary-Estimate`);
    const restore = () => { document.title = previous; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore, { once: true });
    window.setTimeout(restore, 60000);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  }

  const activeAllowances = allowances.filter((row) => row.item.trim() || row.amount > 0);
  const printedRows = [
    { description: "Base Construction Cost", rate: ratePerSft, quantity: totals.totalArea, unit: "sft", total: totals.baseCost },
    ...activeAllowances.map((row) => ({ description: row.item || "Allowance", rate: row.amount, quantity: 1, unit: "LS", total: row.amount })),
    ...(totals.contingency > 0 || contingencyPct > 0 ? [{ description: `Contingency (${qty(contingencyPct)}%)`, rate: totals.contingency, quantity: 1, unit: "LS", total: totals.contingency }] : []),
  ];

  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div><Link href="/admin/estimate">← Estimate Types</Link><span className={styles.eyebrow}>LAND VIEW / ESTIMATE & COSTING</span><h1>Summary Estimate</h1><p>Finance Billing style estimate workspace and A4 statement.</p></div>
      <button className={styles.printButton} type="button" onClick={printEstimate}>Print / Save PDF</button>
    </header>

    <section className={styles.lookup}>
      <label>Estimate Source — optional</label>
      <select value={selectedProject} onChange={(e) => void chooseProject(e.target.value)} disabled={loadingSources} style={{...fieldStyle,width:310}}>
        <option value="">{loadingSources ? "Loading projects…" : "Select Project / File ID"}</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name || "Unnamed"} · {p.type || "Project"}</option>)}
      </select>
      <select value={selectedProposal} onChange={(e) => chooseProposal(e.target.value)} disabled={loadingSources} style={{...fieldStyle,width:310}}>
        <option value="">{loadingSources ? "Loading proposals…" : "Select Proposal"}</option>
        {proposals.map((p) => <option key={String(p.Proposal_ID)} value={String(p.Proposal_ID || "")}>{p.Proposal_ID} · {p.Client_Name || "Unnamed"} · {p.Project_Title || p.Project_Type || "Proposal"}</option>)}
      </select>
      <button type="button" onClick={clearSource}>Clear / New Estimate</button>
      <span style={{width:"100%",fontSize:10,color:sourceError?"#ffb4aa":"#94a3ad"}}>{sourceError || "Choose either source, or leave both blank and enter a new estimate manually."}</span>
    </section>

    <section className={styles.projectCard}>
      <div><span>ESTIMATE ID</span><strong>{estimateId || "EST-NEW"}</strong><small>{displayDate(issueDate)}</small></div>
      <div><span>CLIENT</span><strong>{ownerName || "New / Unassigned"}</strong><small>{contactNo || "Manual estimate"}</small></div>
      <div><span>PROJECT TYPE</span><strong>{projectType || "—"}</strong><small>{floorStory || `${floors} Floor${floors===1?"":"s"}`}</small></div>
      <div className={styles.totalDueCard}><span>ESTIMATED COST (BDT)</span><strong>{amount(totals.grand)}</strong></div>
    </section>

    <section className={styles.categoryGrid}>
      <article className={styles.category}>
        <div className={styles.categoryHeader}><div><span>ESTIMATE INFORMATION</span><h2>Project / Client Details</h2></div><div className={styles.paidBadge}>{status || "Draft"}</div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,padding:22}}>
          {[
            ["Estimate ID",estimateId,setEstimateId],["Issue Date",issueDate,setIssueDate],["Owner Name",ownerName,setOwnerName],["Contact No",contactNo,setContactNo],
            ["Referred By",referredBy,setReferredBy],["Ref. Contact",refContact,setRefContact],["Address",address,setAddress],["File / Proposal ID",referenceId,setReferenceId],
            ["Project / Title",projectTitle,setProjectTitle],["Location",location,setLocation],["Project Type",projectType,setProjectType],["Floor / Story",floorStory,setFloorStory],
            ["Land Area",landArea,setLandArea],["Status",status,setStatus],
          ].map(([label,value,setter],index) => <div key={String(label)}><label style={labelStyle}>{label as string}</label><input type={index===1?"date":"text"} value={value as string} onChange={(e)=> (setter as (v:string)=>void)(e.target.value)} style={fieldStyle}/></div>)}
        </div>
      </article>

      <article className={styles.category}>
        <div className={styles.categoryHeader}><div><span>SUMMARY COSTING</span><h2>Area × Rate + Allowances</h2></div></div>
        <div className={styles.metrics}>
          <div><span>TYPICAL FLOOR AREA</span><strong>{qty(floorArea)} sft</strong></div><div><span>NO. OF FLOORS</span><strong>{floors}</strong></div><div><span>RATE / SFT</span><strong>{money(ratePerSft)}</strong></div><div><span>TOTAL BUILT-UP AREA</span><strong>{qty(totals.totalArea)} sft</strong></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,padding:22}}>
          <div><label style={labelStyle}>Typical Floor Area (sft)</label><input type="number" min={0} value={floorArea} onChange={(e)=>setFloorArea(Math.max(0,Number(e.target.value)||0))} style={fieldStyle}/></div>
          <div><label style={labelStyle}>No. of Floors</label><input type="number" min={1} value={floors} onChange={(e)=>setFloors(Math.max(1,Math.floor(Number(e.target.value)||1)))} style={fieldStyle}/></div>
          <div><label style={labelStyle}>Construction Rate (BDT / sft)</label><input type="number" min={0} value={ratePerSft} onChange={(e)=>setRatePerSft(Math.max(0,Number(e.target.value)||0))} style={fieldStyle}/></div>
          <div><label style={labelStyle}>Contingency (%)</label><input type="number" min={0} step="0.1" value={contingencyPct} onChange={(e)=>setContingencyPct(Math.max(0,Number(e.target.value)||0))} style={fieldStyle}/></div>
        </div>
        <div className={styles.split} style={{gridTemplateColumns:"1fr"}}>
          <section><h3>Project Allowances</h3><div className={styles.tableWrap}><table><thead><tr><th>SL.</th><th>Description</th><th>Amount (BDT)</th><th>Action</th></tr></thead><tbody>{allowances.map((row,index)=><tr key={row.id}><td>{index+1}</td><td><input value={row.item} onChange={(e)=>setAllowances((rows)=>rows.map((r)=>r.id===row.id?{...r,item:e.target.value}:r))} style={{...fieldStyle,padding:"7px 8px"}}/></td><td><input type="number" min={0} value={row.amount} onChange={(e)=>setAllowances((rows)=>rows.map((r)=>r.id===row.id?{...r,amount:Math.max(0,Number(e.target.value)||0)}:r))} style={{...fieldStyle,padding:"7px 8px",textAlign:"right"}}/></td><td><button className={styles.printButton} type="button" onClick={()=>setAllowances((rows)=>rows.filter((r)=>r.id!==row.id))} style={{padding:"7px 9px"}}>Remove</button></td></tr>)}</tbody></table></div><button className={styles.printButton} type="button" style={{marginTop:10}} onClick={()=>setAllowances((rows)=>[...rows,{id:uid(),item:"Custom Allowance",amount:0}])}>+ Add Allowance</button></section>
        </div>
        <div className={styles.formula}><span>{money(totals.baseCost)} + {money(totals.allowanceTotal)} + {money(totals.contingency)}</span><strong>= {money(totals.grand)}</strong></div>
      </article>
    </section>

    <section className={styles.grandSummary}>
      <div><span>Base Construction</span><strong>{money(totals.baseCost)}</strong></div><div><span>Allowances</span><strong>{money(totals.allowanceTotal)}</strong></div><div><span>Contingency</span><strong>{money(totals.contingency)}</strong></div><div className={styles.grandDue}><span>Estimated Project Cost</span><strong>{money(totals.grand)}</strong></div>
    </section>

    <section className={styles.printSheets}>
      <article className={styles.printPage}>
        <header className={styles.sheetHeader}>
          <div className={styles.sheetBrand}><div className={styles.sheetBrandLockup}><img className={styles.sheetBrandLogo} src="/land-view-logo.svg" alt="LAND VIEW logo"/><div className={styles.sheetBrandWords}><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div></div><em>Building a safer tomorrow</em></div>
          <div className={styles.sheetContact}><strong>LAND VIEW Architects & Engineers</strong><span>F. Rahman AC Market (2nd Floor)</span><span>SSK Road, Feni Sadar, Feni</span><span>+88 0140 80 80 400 · +88 01902 500 400</span></div>
          <div className={styles.sheetTitle}><small>Page 1 of 1</small><b>Summary Estimate</b><strong>{estimateId || "EST-NEW"}</strong></div>
        </header>

        <section className={styles.sheetInfoBoard}>
          <div className={styles.sheetInfoRow}><span>Estimate ID</span><strong>{estimateId || "—"}</strong><span>Issue Date</span><strong>{displayDate(issueDate)}</strong></div>
          <div className={styles.sheetInfoRow}><span>Owner Name</span><strong>{ownerName || "—"}</strong><span>File ID</span><strong>{referenceId || "—"}</strong></div>
          <div className={styles.sheetInfoRow}><span>Contact No</span><strong>{contactNo || "—"}</strong><span>Project Type</span><strong>{projectType || "—"}</strong></div>
          <div className={styles.sheetInfoRow}><span>Referred By</span><strong>{referredBy || "—"}</strong><span>Floor/Story</span><strong>{floorStory || `${floors} Floor${floors===1?"":"s"}`}</strong></div>
          <div className={styles.sheetInfoRow}><span>Ref. Contact</span><strong>{refContact || "—"}</strong><span>Land Area</span><strong>{landArea || "—"}</strong></div>
          <div className={styles.sheetInfoRow}><span>Address</span><strong>{address || location || "—"}</strong><span>Status</span><strong>{status || "Draft"}</strong></div>
        </section>

        <section className={styles.portraitSection}>
          <div className={styles.sheetMain}>
            <h2>SUMMARY <span>ESTIMATE</span></h2>
            <div className={styles.tableWrap}><table className={styles.billTable}><thead><tr><th>SL.</th><th>Description</th><th>Rate (BDT)</th><th>QTY</th><th>AMOUNT (BDT)</th></tr></thead><tbody>{printedRows.map((row,index)=><tr key={`${row.description}-${index}`}><td>{index+1}</td><td>{row.description}{row.unit?` · ${row.unit}`:""}</td><td>{amount(row.rate)}</td><td>{qty(row.quantity)}</td><td className={styles.moneyCell}>{amount(row.total)}</td></tr>)}</tbody></table></div>
            {projectTitle && <h2 className={styles.depositHeading}>PROJECT <span>REFERENCE</span></h2>}
            {projectTitle && <div className={styles.tableWrap}><table><tbody><tr><td style={{width:"30%",fontWeight:800}}>Project / Title</td><td>{projectTitle}</td></tr>{location&&<tr><td style={{fontWeight:800}}>Location</td><td>{location}</td></tr>}</tbody></table></div>}
          </div>
          <aside className={styles.sheetSummary}><h3>SUMMARY ESTIMATE</h3><div><span>Base Construction (BDT)</span><strong>{amount(totals.baseCost)}</strong></div><div><span>Allowances (BDT)</span><strong>{amount(totals.allowanceTotal)}</strong></div><div><span>Contingency (BDT)</span><strong>{amount(totals.contingency)}</strong></div><div className={styles.sheetGrandDue}><span>Grand Total (BDT)</span><strong>{amount(totals.grand)}</strong></div></aside>
        </section>

        <footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>Estimated Project Cost (BDT): {amount(totals.grand)} · Feni Sadar, Feni · +88 01902 500 400 · landviewcivil@gmail.com · www.landview.com.bd</span></footer>
      </article>
    </section>
  </div>;
}
