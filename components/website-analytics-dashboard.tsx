"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "@/app/admin/website-analytics/page.module.css";

type Row = Record<string, any>;
type AnalyticsData = {
  storage?: string;
  totals?: {
    visitors?: number;
    sessions?: number;
    pageViews?: number;
    preciseLocationEvents?: number;
    interactions?: number;
    enquiries?: number;
    convertedLeads?: number;
    qualifiedLeads?: number;
    proposalsCreated?: number;
    projectsConverted?: number;
    openLeads?: number;
    enquiryOpenToSubmitRate?: number | null;
    enquiryToProposalRate?: number | null;
    enquiryToProjectRate?: number | null;
    proposalToProjectRate?: number | null;
  };
  conversions?: {
    interactionCounts?: Record<string, number>;
    targetCounts?: Record<string, number>;
    leadStatuses?: Record<string, number>;
    leadSources?: Record<string, number>;
    serviceDemand?: Record<string, number>;
    projectSources?: Record<string, number>;
    funnel?: Record<string, number>;
    pipelineHealth?: Record<string, number>;
    whatsappClicks?: number;
    callClicks?: number;
    enquiryOpens?: number;
    mapOpens?: number;
    serviceClicks?: number;
    projectClicks?: number;
    mapProjectSelections?: number;
  };
  recentLeadConversions?: Row[];
  recentVisitors?: Row[];
  recentPageViews?: Row[];
  recentLocations?: Row[];
  recentInteractions?: Row[];
};

function fmt(value: unknown) { return Number(value || 0).toLocaleString("en-BD"); }
function pct(value: unknown) { return value == null ? "—" : `${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`; }
function dateTime(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
}
function device(row: Row) { return [row.Device_Name, row.Platform].filter(Boolean).join(" · ") || "Unknown device"; }
function interactionLabel(name: string) {
  return ({ enquiry_open: "Enquiry Opens", whatsapp_click: "WhatsApp Clicks", call_click: "Call Clicks", service_click: "Service Clicks", project_click: "Project Clicks", map_open: "Map Opens", map_project_select: "Map Project Selections" } as Record<string,string>)[name] || name.replace(/_/g," ");
}
function topFromRows(rows: Row[], key: string, limit = 8) {
  const map = new Map<string, number>();
  rows.forEach((row) => { const value = String(row[key] || "").trim(); if (value) map.set(value, (map.get(value) || 0) + 1); });
  return [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0, limit);
}
function recordItems(record?: Record<string, number>, limit = 10) {
  return Object.entries(record || {}).sort((a,b) => b[1]-a[1]).slice(0, limit) as [string, number][];
}
function BarList({ items }: { items: [string, number][] }) {
  if (!items.length) return <div className={styles.empty}>No data yet.</div>;
  const max = Math.max(...items.map(([,count]) => count), 1);
  return <div className={styles.barList}>{items.map(([label,count]) => <div className={styles.barRow} key={label}><span className={styles.barLabel} title={label}>{label}</span><span className={styles.barTrack}><span style={{width:`${Math.max(5,(count/max)*100)}%`}} /></span><strong>{count}</strong></div>)}</div>;
}

export default function WebsiteAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/website-analytics", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load website analytics."));
      setData(json.data || {});
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load website analytics."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const pageViews = data?.recentPageViews || [];
  const interactions = data?.recentInteractions || [];
  const locations = data?.recentLocations || [];
  const leadConversions = data?.recentLeadConversions || [];
  const conversions = data?.conversions || {};
  const totals = data?.totals || {};

  const topPages = useMemo(() => topFromRows(pageViews, "Page"), [pageViews]);
  const traffic = useMemo(() => topFromRows(pageViews.map((row) => ({ Source: (() => { try { return row.Referrer ? new URL(String(row.Referrer)).hostname : "Direct"; } catch { return row.Referrer || "Direct"; } })() })), "Source"), [pageViews]);
  const devices = useMemo(() => topFromRows(pageViews.map((row) => ({ Device: device(row) })), "Device"), [pageViews]);
  const interactionRanks = useMemo(() => Object.entries(conversions.interactionCounts || {}).sort((a,b) => b[1]-a[1]).map(([key,count]) => [interactionLabel(key), count] as [string,number]), [conversions.interactionCounts]);
  const targets = useMemo(() => recordItems(conversions.targetCounts), [conversions.targetCounts]);
  const leadStatuses = useMemo(() => recordItems(conversions.leadStatuses), [conversions.leadStatuses]);
  const funnel = useMemo(() => Object.entries(conversions.funnel || {}) as [string,number][], [conversions.funnel]);
  const pipelineHealth = useMemo(() => recordItems(conversions.pipelineHealth), [conversions.pipelineHealth]);
  const leadSources = useMemo(() => recordItems(conversions.leadSources), [conversions.leadSources]);
  const serviceDemand = useMemo(() => recordItems(conversions.serviceDemand), [conversions.serviceDemand]);
  const projectSources = useMemo(() => recordItems(conversions.projectSources), [conversions.projectSources]);

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div><span className={styles.eyebrow}><i className={styles.liveDot}/>LAND VIEW WEBSITE INTELLIGENCE</span><h1>Traffic, Leads & Project Conversion</h1><p>Follow the complete journey from public website activity to enquiry, qualification, proposal and a real LAND VIEW Project ID.</p></div>
      <div className={styles.heroActions}><Link className={styles.secondaryButton} href="/admin/website-leads">Open Enquiry CRM</Link><button className={styles.primaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh Analytics"}</button></div>
    </section>

    {error ? <div className={styles.errorCard}><span>{error}</span><button onClick={() => void load()}>Retry</button></div> : null}

    <section className={styles.statGrid}>
      <article className={styles.statCard}><span>Visitors</span><strong>{fmt(totals.visitors)}</strong><small>Known anonymous website visitors</small></article>
      <article className={styles.statCard}><span>Enquiries</span><strong>{fmt(totals.enquiries)}</strong><small>Submitted website leads</small></article>
      <article className={styles.statCard}><span>Proposals</span><strong>{fmt(totals.proposalsCreated)}</strong><small>Enquiries linked to a proposal</small></article>
      <article className={styles.statCard}><span>Projects Won</span><strong>{fmt(totals.projectsConverted)}</strong><small>Enquiries converted to LV projects</small></article>
    </section>

    <section className={styles.pulseGrid}>
      <article><span>Open → Submit</span><strong>{pct(totals.enquiryOpenToSubmitRate)}</strong><small>Enquiries ÷ tracked form opens</small></article>
      <article><span>Enquiry → Proposal</span><strong>{pct(totals.enquiryToProposalRate)}</strong><small>Proposal creation rate</small></article>
      <article><span>Enquiry → Project</span><strong>{pct(totals.enquiryToProjectRate)}</strong><small>Overall project win rate</small></article>
      <article><span>Proposal → Project</span><strong>{pct(totals.proposalToProjectRate)}</strong><small>Proposal close rate</small></article>
    </section>

    <section className={styles.analyticsGrid}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>SALES FUNNEL</span><h2>Enquiry to project</h2></div><small>{fmt(totals.projectsConverted)} projects won</small></div><BarList items={funnel}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>PIPELINE HEALTH</span><h2>Leads needing attention</h2></div><small>{fmt(totals.openLeads)} open leads</small></div><BarList items={pipelineHealth}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>LEAD ACQUISITION</span><h2>Where enquiries come from</h2></div><small>UTM source or entry path</small></div><BarList items={leadSources}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>SERVICE DEMAND</span><h2>What clients request</h2></div><small>Submitted enquiry selections</small></div><BarList items={serviceDemand}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>WON PROJECT SOURCES</span><h2>Sources producing projects</h2></div><small>Converted website leads</small></div><BarList items={projectSources}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>LEAD STATUS</span><h2>Current CRM stages</h2></div><small>{fmt(totals.enquiries)} enquiries</small></div><BarList items={leadStatuses}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>CONVERSION EVENTS</span><h2>What visitors are doing</h2></div><small>{fmt(totals.interactions)} tracked actions</small></div><BarList items={interactionRanks}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>CONTENT INTENT</span><h2>Popular services & projects</h2></div><small>Clicks and map selections</small></div><BarList items={targets}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>PAGE PERFORMANCE</span><h2>Most viewed pages</h2></div><small>Recent activity sample</small></div><BarList items={topPages}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>TRAFFIC ACQUISITION</span><h2>Visitor sources</h2></div><small>Referrer domains</small></div><BarList items={traffic}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>DEVICE MIX</span><h2>Visitor devices</h2></div><small>Device / platform</small></div><BarList items={devices}/></article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>CRM HAND-OFF</span><h2>Recent proposal & project conversions</h2></div><small>Trace the website lead into LAND VIEW records</small></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Lead</th><th>Client</th><th>Proposal</th><th>Project</th><th>Source</th><th>Updated</th></tr></thead><tbody>{leadConversions.length ? leadConversions.map((row, index) => <tr key={`${row.leadCode || "lead"}-${index}`}><td><strong>{row.leadCode || "—"}</strong><small>{row.status || ""}</small></td><td>{row.name || "—"}</td><td>{row.proposalCode ? <Link className={styles.pagePath} href={`/admin/proposals/${encodeURIComponent(row.proposalCode)}`}>{row.proposalCode}</Link> : "—"}</td><td>{row.projectCode ? <Link className={styles.pagePath} href={`/admin/projects/${encodeURIComponent(row.projectCode)}`}>{row.projectCode}</Link> : "—"}</td><td>{row.source || "—"}</td><td>{dateTime(row.updatedAt || row.createdAt)}</td></tr>) : <tr><td className={styles.emptyCell} colSpan={6}>No website enquiry has been converted yet.</td></tr>}</tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>RECENT CONVERSION ACTIVITY</span><h2>Clicks that indicate project intent</h2></div><small>Latest 200 tracked interactions</small></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Page</th><th>Location</th><th>Device</th></tr></thead><tbody>{interactions.length ? interactions.map((row) => <tr key={row.Event_ID}><td>{dateTime(row.Occurred_At)}</td><td><strong>{interactionLabel(String(row.Interaction_Name || ""))}</strong><small>{row.Interaction_Label || ""}</small></td><td><code>{row.Interaction_Target || "—"}</code></td><td><span className={styles.pagePath}>{row.Page || "/"}</span></td><td>{[row.City,row.Region,row.Country].filter(Boolean).join(", ") || "—"}</td><td>{device(row)}</td></tr>) : <tr><td className={styles.emptyCell} colSpan={6}>No conversion interactions have been recorded yet.</td></tr>}</tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>RECENT PAGE VIEWS</span><h2>Visitor browsing activity</h2></div><small>{fmt(totals.sessions)} sessions</small></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Time</th><th>Page</th><th>Location</th><th>Device</th><th>Referrer</th></tr></thead><tbody>{pageViews.length ? pageViews.slice(0,80).map((row) => <tr key={row.Event_ID}><td>{dateTime(row.Visited_At)}</td><td><span className={styles.pagePath}>{row.Page || "/"}</span><small>{row.Title || ""}</small></td><td>{[row.City,row.Region,row.Country].filter(Boolean).join(", ") || "—"}</td><td>{device(row)}</td><td>{row.Referrer || "Direct"}</td></tr>) : <tr><td className={styles.emptyCell} colSpan={5}>No page views yet.</td></tr>}</tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>CONSENTED LOCATION</span><h2>Recent precise GPS events</h2></div><small>{fmt(totals.preciseLocationEvents)} total events</small></div>
      <div className={styles.locationGrid}>{locations.length ? locations.slice(0,12).map((row) => <article className={styles.locationCard} key={row.Event_ID}><div><span className={styles.preciseBadge}>PRECISE</span><small>{dateTime(row.Recorded_At)}</small></div><strong>{Number(row.Latitude).toFixed(6)}, {Number(row.Longitude).toFixed(6)}</strong><p>{row.Page || "/"} · accuracy ±{Math.round(Number(row.Accuracy_M || 0))} m</p><div className={styles.locationMeta}><code>{row.Visitor_ID || ""}</code><a href={`https://www.google.com/maps?q=${row.Latitude},${row.Longitude}`} target="_blank" rel="noreferrer">Open map ↗</a></div></article>) : <div className={styles.empty}>No visitor has shared precise location in this sample.</div>}</div>
    </section>

    <footer className={styles.footerNote}><span>Storage: {data?.storage || "Supabase"}. Funnel metrics come from actual CRM linkages: submitted enquiry, proposal code and converted LV project code.</span><span>Precise GPS remains permission-based; pipeline health never changes client records automatically.</span></footer>
  </div>;
}
