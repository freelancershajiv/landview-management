"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "@/app/admin/website-analytics/page.module.css";

type Row = Record<string, any>;
type AnalyticsData = {
  storage?: string;
  totals?: { visitors?: number; sessions?: number; pageViews?: number; preciseLocationEvents?: number; interactions?: number; enquiries?: number; convertedLeads?: number; enquiryOpenToSubmitRate?: number | null };
  conversions?: { interactionCounts?: Record<string, number>; targetCounts?: Record<string, number>; leadStatuses?: Record<string, number>; whatsappClicks?: number; callClicks?: number; enquiryOpens?: number; mapOpens?: number; serviceClicks?: number; projectClicks?: number; mapProjectSelections?: number };
  recentVisitors?: Row[];
  recentPageViews?: Row[];
  recentLocations?: Row[];
  recentInteractions?: Row[];
};

function fmt(value: unknown) { return Number(value || 0).toLocaleString("en-BD"); }
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
  const conversions = data?.conversions || {};
  const totals = data?.totals || {};

  const topPages = useMemo(() => topFromRows(pageViews, "Page"), [pageViews]);
  const traffic = useMemo(() => topFromRows(pageViews.map((row) => ({ Source: (() => { try { return row.Referrer ? new URL(String(row.Referrer)).hostname : "Direct"; } catch { return row.Referrer || "Direct"; } })() })), "Source"), [pageViews]);
  const devices = useMemo(() => topFromRows(pageViews.map((row) => ({ Device: device(row) })), "Device"), [pageViews]);
  const interactionRanks = useMemo(() => Object.entries(conversions.interactionCounts || {}).sort((a,b) => b[1]-a[1]).map(([key,count]) => [interactionLabel(key), count] as [string,number]), [conversions.interactionCounts]);
  const targets = useMemo(() => Object.entries(conversions.targetCounts || {}).sort((a,b) => b[1]-a[1]).slice(0,10) as [string,number][], [conversions.targetCounts]);
  const leadStatuses = useMemo(() => Object.entries(conversions.leadStatuses || {}).sort((a,b) => b[1]-a[1]) as [string,number][], [conversions.leadStatuses]);

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div><span className={styles.eyebrow}><i className={styles.liveDot}/>LAND VIEW WEBSITE INTELLIGENCE</span><h1>Traffic & Conversion Analytics</h1><p>See not only who visits the public website, but which actions actually move visitors toward a LAND VIEW project enquiry.</p></div>
      <div className={styles.heroActions}><Link className={styles.secondaryButton} href="/admin/website-leads">Open Enquiry CRM</Link><button className={styles.primaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh Analytics"}</button></div>
    </section>

    {error ? <div className={styles.errorCard}><span>{error}</span><button onClick={() => void load()}>Retry</button></div> : null}

    <section className={styles.statGrid}>
      <article className={styles.statCard}><span>Visitors</span><strong>{fmt(totals.visitors)}</strong><small>Known anonymous website visitors</small></article>
      <article className={styles.statCard}><span>Page Views</span><strong>{fmt(totals.pageViews)}</strong><small>Public page activity</small></article>
      <article className={styles.statCard}><span>Project Enquiries</span><strong>{fmt(totals.enquiries)}</strong><small>Actual enquiry submissions</small></article>
      <article className={styles.statCard}><span>Converted Leads</span><strong>{fmt(totals.convertedLeads)}</strong><small>CRM status marked Converted</small></article>
    </section>

    <section className={styles.pulseGrid}>
      <article><span>WhatsApp</span><strong>{fmt(conversions.whatsappClicks)}</strong><small>Public WhatsApp clicks</small></article>
      <article><span>Calls</span><strong>{fmt(conversions.callClicks)}</strong><small>Phone CTA clicks</small></article>
      <article><span>Enquiry Opens</span><strong>{fmt(conversions.enquiryOpens)}</strong><small>Visitors who opened the form</small></article>
      <article><span>Open → Submit</span><strong>{totals.enquiryOpenToSubmitRate == null ? "—" : `${totals.enquiryOpenToSubmitRate}%`}</strong><small>Enquiries ÷ tracked form opens</small></article>
    </section>

    <section className={styles.analyticsGrid}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>CONVERSION EVENTS</span><h2>What visitors are doing</h2></div><small>{fmt(totals.interactions)} tracked actions</small></div><BarList items={interactionRanks}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>CRM FUNNEL</span><h2>Lead status</h2></div><small>{fmt(totals.enquiries)} submitted enquiries</small></div><BarList items={leadStatuses}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>CONTENT INTENT</span><h2>Popular services & projects</h2></div><small>Clicks and map selections</small></div><BarList items={targets}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>PAGE PERFORMANCE</span><h2>Most viewed pages</h2></div><small>Recent activity sample</small></div><BarList items={topPages}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>ACQUISITION</span><h2>Traffic sources</h2></div><small>Referrer domains</small></div><BarList items={traffic}/></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>DEVICE MIX</span><h2>Visitor devices</h2></div><small>Device / platform</small></div><BarList items={devices}/></article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>RECENT CONVERSION ACTIVITY</span><h2>Clicks that indicate project intent</h2></div><small>Latest 200 tracked interactions</small></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Page</th><th>Location</th><th>Device</th></tr></thead><tbody>{interactions.length ? interactions.map((row) => <tr key={row.Event_ID}><td>{dateTime(row.Occurred_At)}</td><td><strong>{interactionLabel(String(row.Interaction_Name || ""))}</strong><small>{row.Interaction_Label || ""}</small></td><td><code>{row.Interaction_Target || "—"}</code></td><td><span className={styles.pagePath}>{row.Page || "/"}</span></td><td>{[row.City,row.Region,row.Country].filter(Boolean).join(", ") || "—"}</td><td>{device(row)}</td></tr>) : <tr><td className={styles.emptyCell} colSpan={6}>No conversion interactions have been recorded yet. New clicks will appear after this release.</td></tr>}</tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>RECENT PAGE VIEWS</span><h2>Visitor browsing activity</h2></div><small>{fmt(totals.sessions)} sessions</small></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Time</th><th>Page</th><th>Location</th><th>Device</th><th>Referrer</th></tr></thead><tbody>{pageViews.length ? pageViews.slice(0,80).map((row) => <tr key={row.Event_ID}><td>{dateTime(row.Visited_At)}</td><td><span className={styles.pagePath}>{row.Page || "/"}</span><small>{row.Title || ""}</small></td><td>{[row.City,row.Region,row.Country].filter(Boolean).join(", ") || "—"}</td><td>{device(row)}</td><td>{row.Referrer || "Direct"}</td></tr>) : <tr><td className={styles.emptyCell} colSpan={5}>No page views yet.</td></tr>}</tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>CONSENTED LOCATION</span><h2>Recent precise GPS events</h2></div><small>{fmt(totals.preciseLocationEvents)} total events</small></div>
      <div className={styles.locationGrid}>{locations.length ? locations.slice(0,12).map((row) => <article className={styles.locationCard} key={row.Event_ID}><div><span className={styles.preciseBadge}>PRECISE</span><small>{dateTime(row.Recorded_At)}</small></div><strong>{Number(row.Latitude).toFixed(6)}, {Number(row.Longitude).toFixed(6)}</strong><p>{row.Page || "/"} · accuracy ±{Math.round(Number(row.Accuracy_M || 0))} m</p><div className={styles.locationMeta}><code>{row.Visitor_ID || ""}</code><a href={`https://www.google.com/maps?q=${row.Latitude},${row.Longitude}`} target="_blank" rel="noreferrer">Open map ↗</a></div></article>) : <div className={styles.empty}>No visitor has shared precise location in this sample.</div>}</div>
    </section>

    <footer className={styles.footerNote}><span>Storage: {data?.storage || "Supabase"}. Public interaction events contain anonymous visitor/session IDs and server-derived coarse location; precise GPS remains permission-based in the existing location flow.</span><span>CRM enquiries are counted from actual submitted records, not button clicks.</span></footer>
  </div>;
}
