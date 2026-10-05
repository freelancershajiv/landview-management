"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/admin/website-analytics/page.module.css";

type Row = Record<string, any>;
type AnalyticsData = {
  storage?: string;
  totals?: { visitors?: number; sessions?: number; pageViews?: number; preciseLocationEvents?: number };
  recentVisitors?: Row[];
  recentPageViews?: Row[];
  recentLocations?: Row[];
};

function dateTime(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return String(value || "—");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function browserLabel(userAgent: unknown) {
  const ua = String(userAgent || "");
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return "Other";
}

function genericDeviceLabel(userAgent: unknown) {
  const ua = String(userAgent || "");
  if (/bot|crawler|spider|headless/i.test(ua)) return "Bot / automated client";
  if (/iPad/i.test(ua)) return "Apple iPad";
  if (/iPhone/i.test(ua)) return "Apple iPhone";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s[^;()]+;\s*([^;)]+)/i);
    let model = String(match?.[1] || "").replace(/\s+Build\/.*/i, "").replace(/;\s*wv$/i, "").trim();
    if (!model || /^(K|wv|Mobile)$/i.test(model)) return "Android device";
    if (/^SM-[A-Z0-9-]+$/i.test(model)) model = `Samsung ${model}`;
    return model;
  }
  if (/Windows NT/i.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Apple Mac";
  if (/Linux/i.test(ua)) return "Linux computer";
  return "Unknown device";
}

function deviceName(row: Row) {
  return String(row.Device_Name || "").trim() || genericDeviceLabel(row.User_Agent);
}

function platformName(row: Row) {
  const stored = String(row.Platform || "").trim();
  if (stored) return stored;
  const ua = String(row.User_Agent || "");
  const android = ua.match(/Android\s([0-9.]+)/i);
  if (android?.[1]) return `Android ${android[1]}`;
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/iPhone|iPad/i.test(ua)) return "iOS / iPadOS";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "";
}

function sourceLabel(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "Direct / Unknown";
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return host || "Direct / Unknown";
  } catch { return raw.slice(0, 45); }
}

function cityLabel(row: Row) {
  return [row.City, row.Region, row.Country].map((value) => String(value || "").trim()).filter(Boolean).join(", ") || "Unknown";
}

function hasCoordinate(value: unknown) {
  return value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function locationInfo(row: Row) {
  if (hasCoordinate(row.Precise_Latitude) && hasCoordinate(row.Precise_Longitude)) {
    const lat = Number(row.Precise_Latitude);
    const lon = Number(row.Precise_Longitude);
    const accuracy = Number(row.Precise_Accuracy_M);
    return {
      precise: true,
      primary: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      secondary: `${Number.isFinite(accuracy) ? `±${Math.round(accuracy)} m` : "GPS"} · consented browser location`,
      map: `https://www.google.com/maps?q=${lat},${lon}`,
    };
  }
  const ipLat = hasCoordinate(row.IP_Latitude) ? Number(row.IP_Latitude) : null;
  const ipLon = hasCoordinate(row.IP_Longitude) ? Number(row.IP_Longitude) : null;
  return {
    precise: false,
    primary: cityLabel(row),
    secondary: "Approx. IP location",
    map: ipLat !== null && ipLon !== null ? `https://www.google.com/maps?q=${ipLat},${ipLon}` : "",
  };
}

function rank(rows: Row[], value: (row: Row) => string, limit = 8) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = value(row) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function Bars({ rows }: { rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(([, count]) => count));
  if (!rows.length) return <div className={styles.empty}>No data yet.</div>;
  return <div className={styles.barList}>{rows.map(([label, count]) => (
    <div className={styles.barRow} key={label}>
      <span className={styles.barLabel} title={label}>{label}</span>
      <div className={styles.barTrack}><span style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div>
      <strong>{count}</strong>
    </div>
  ))}</div>;
}

function LocationCell({ row }: { row: Row }) {
  const info = locationInfo(row);
  return <div>
    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
      <strong>{info.primary}</strong>
      {info.precise ? <span className={styles.preciseBadge}>PRECISE GPS</span> : null}
    </div>
    <small>{info.secondary}{row.Precise_Location_Updated_At ? ` · ${dateTime(row.Precise_Location_Updated_At)}` : ""}</small>
    {info.map ? <a href={info.map} target="_blank" rel="noreferrer" style={{ color: "#ff8b83", fontSize: 11, fontWeight: 800, display: "inline-block", marginTop: 5 }}>Open map ↗</a> : null}
  </div>;
}

export default function WebsiteAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/website-analytics?t=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load website analytics."));
      setData(json.data || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load website analytics.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const visitors = data?.recentVisitors || [];
  const pageViews = data?.recentPageViews || [];
  const locations = data?.recentLocations || [];
  const totals = data?.totals || {};

  const ranked = useMemo(() => ({
    pages: rank(pageViews, (row) => String(row.Page || "/"), 8),
    sources: rank(pageViews, (row) => sourceLabel(row.Referrer), 8),
    cities: rank(pageViews, cityLabel, 8),
    devices: rank(pageViews, deviceName, 8),
    browsers: rank(pageViews, (row) => browserLabel(row.User_Agent), 6),
  }), [pageViews]);

  const recentPreciseVisitors = visitors.filter((row) => locationInfo(row).precise).length;

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}><i className={styles.liveDot} />LAND VIEW WEBSITE INTELLIGENCE</span>
        <h1>Website Analytics</h1>
        <p>Visitor traffic, device models, referral sources and location. Precise GPS is shown only when the visitor explicitly grants browser location permission; otherwise the dashboard labels IP-derived location as approximate.</p>
      </div>
      <div className={styles.heroActions}>
        <button className={styles.primaryButton} type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh analytics"}</button>
        <a className={styles.secondaryButton} href="https://www.landview.com.bd" target="_blank" rel="noreferrer">Open website ↗</a>
      </div>
    </section>

    {error ? <div className={styles.errorCard}><strong>Analytics unavailable</strong><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div> : null}

    <section className={styles.statGrid}>
      <article className={styles.statCard}><span>Visitors</span><strong>{Number(totals.visitors || 0).toLocaleString("en-BD")}</strong><small>Unique browser visitor IDs</small></article>
      <article className={styles.statCard}><span>Sessions</span><strong>{Number(totals.sessions || 0).toLocaleString("en-BD")}</strong><small>Recorded website sessions</small></article>
      <article className={styles.statCard}><span>Page views</span><strong>{Number(totals.pageViews || 0).toLocaleString("en-BD")}</strong><small>Public-site page loads</small></article>
      <article className={styles.statCard}><span>Precise GPS events</span><strong>{Number(totals.preciseLocationEvents || 0).toLocaleString("en-BD")}</strong><small>{recentPreciseVisitors} recent visitor{recentPreciseVisitors === 1 ? "" : "s"} with consented GPS</small></article>
    </section>

    <section className={styles.analyticsGrid}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>CONTENT</span><h2>Top pages</h2></div><small>Recent sample</small></div><Bars rows={ranked.pages} /></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>ACQUISITION</span><h2>Traffic sources</h2></div><small>Referring host</small></div><Bars rows={ranked.sources} /></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>LOCATION</span><h2>Approximate IP cities</h2></div><small>GPS is displayed below when allowed</small></div><Bars rows={ranked.cities} /></article>
      <article className={styles.panel}>
        <div className={styles.panelHead}><div><span>TECHNOLOGY</span><h2>Devices & browsers</h2></div><small>Model shown when exposed by browser</small></div>
        <div className={styles.splitBars}><div><h3>Device / model</h3><Bars rows={ranked.devices} /></div><div><h3>Browser</h3><Bars rows={ranked.browsers} /></div></div>
      </article>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>VISITORS</span><h2>Recent visitors</h2></div><small>Latest device and best available location</small></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Visitor</th><th>Last seen</th><th>Location</th><th>Device name</th><th>IP address</th><th>Sessions</th><th>Views</th></tr></thead><tbody>
        {visitors.length ? visitors.map((row) => <tr key={String(row.Visitor_ID)}>
          <td><code>{String(row.Visitor_ID || "").replace(/^vis_/, "").slice(0, 8)}</code><small>{row.Language || "—"} · {row.Screen_Width || 0}×{row.Screen_Height || 0}</small></td>
          <td><strong>{dateTime(row.Last_Seen)}</strong><small>First: {dateTime(row.First_Seen)}</small></td>
          <td><LocationCell row={row} /></td>
          <td><strong>{deviceName(row)}</strong><small>{[platformName(row), browserLabel(row.User_Agent)].filter(Boolean).join(" · ")}</small></td>
          <td><code>{row.Last_IP || "—"}</code></td>
          <td><strong>{Number(row.Total_Sessions || 0)}</strong></td>
          <td><strong>{Number(row.Total_Page_Views || 0)}</strong></td>
        </tr>) : <tr><td className={styles.emptyCell} colSpan={7}>No visitor data yet.</td></tr>}
      </tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>ACTIVITY</span><h2>Recent page views</h2></div><small>Latest consented visitor GPS is attached when available</small></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Time</th><th>Page</th><th>Source</th><th>Location</th><th>Device name</th><th>IP</th></tr></thead><tbody>
        {pageViews.length ? pageViews.map((row) => <tr key={String(row.Event_ID)}>
          <td><strong>{dateTime(row.Visited_At)}</strong></td>
          <td><span className={styles.pagePath}>{row.Page || "/"}</span><small>{row.Title || "—"}</small></td>
          <td><strong>{sourceLabel(row.Referrer)}</strong></td>
          <td><LocationCell row={row} /></td>
          <td><strong>{deviceName(row)}</strong><small>{[platformName(row), browserLabel(row.User_Agent)].filter(Boolean).join(" · ")}</small></td>
          <td><code>{row.IP || "—"}</code></td>
        </tr>) : <tr><td className={styles.emptyCell} colSpan={6}>No page views yet.</td></tr>}
      </tbody></table></div>
    </section>

    <section className={styles.panel}>
      <div className={styles.panelHead}><div><span>CONSENTED LOCATION</span><h2>Precise GPS captures</h2></div><small>Only after the visitor selects Allow live location</small></div>
      {locations.length ? <div className={styles.locationGrid}>{locations.map((row) => {
        const lat = Number(row.Latitude);
        const lon = Number(row.Longitude);
        return <article className={styles.locationCard} key={String(row.Event_ID)}>
          <div><span className={styles.preciseBadge}>PRECISE GPS</span><small>{dateTime(row.Recorded_At)}</small></div>
          <strong>{Number.isFinite(lat) ? lat.toFixed(6) : row.Latitude}, {Number.isFinite(lon) ? lon.toFixed(6) : row.Longitude}</strong>
          <p>Accuracy ±{Math.round(Number(row.Accuracy_M || 0))} m · {row.Page || "/"}<br/>IP area: {[row.IP_City, row.IP_Region, row.IP_Country].filter(Boolean).join(", ") || "Unknown"}</p>
          <div className={styles.locationMeta}><code>{String(row.Visitor_ID || "").replace(/^vis_/, "").slice(0, 8)}</code><a href={`https://www.google.com/maps?q=${row.Latitude},${row.Longitude}`} target="_blank" rel="noreferrer">Open map ↗</a></div>
        </article>;
      })}</div> : <div className={styles.empty}>No visitor has shared precise GPS yet.</div>}
    </section>

    <div className={styles.footerNote}>
      <span>Device models depend on what the browser exposes. Privacy-reduced browsers may only report “Android device” or a desktop platform.</span>
      <span>Precise location is permission-based. IP coordinates remain approximate and are never labeled as precise.</span>
    </div>
  </div>;
}
