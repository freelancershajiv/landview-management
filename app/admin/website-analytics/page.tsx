"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type AnalyticsRow = Record<string, unknown>;
type AnalyticsData = {
  spreadsheetId?: string;
  totals?: {
    visitors?: number;
    sessions?: number;
    pageViews?: number;
    preciseLocationEvents?: number;
  };
  recentVisitors?: AnalyticsRow[];
  recentPageViews?: AnalyticsRow[];
  recentLocations?: AnalyticsRow[];
};

type Ranked = { label: string; count: number };

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: unknown) {
  const date = dateValue(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

function timeAgo(value: unknown) {
  const date = dateValue(value);
  if (!date) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sameDhakaDay(value: unknown) {
  const date = dateValue(value);
  if (!date) return false;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" });
  return day.format(date) === day.format(new Date());
}

function rank(rows: AnalyticsRow[], picker: (row: AnalyticsRow) => string, limit = 5): Ranked[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const label = picker(row) || "Unknown";
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function referrerLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return "Direct / unknown";
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.slice(0, 60);
  }
}

function browserLabel(uaValue: unknown) {
  const ua = text(uaValue);
  if (!ua) return "Unknown";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return "Other";
}

function deviceLabel(uaValue: unknown) {
  const ua = text(uaValue);
  if (/bot|crawl|spider|slurp|preview/i.test(ua)) return "Bot";
  if (/ipad|tablet|kindle/i.test(ua)) return "Tablet";
  if (/mobile|android|iphone|ipod/i.test(ua)) return "Mobile";
  return "Desktop";
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function BarList({ rows }: { rows: Ranked[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <div className={styles.empty}>No analytics data yet.</div>;
  return (
    <div className={styles.barList}>
      {rows.map((row) => (
        <div className={styles.barRow} key={row.label}>
          <div className={styles.barLabel} title={row.label}>{row.label}</div>
          <div className={styles.barTrack}><span style={{ width: `${Math.max(7, (row.count / max) * 100)}%` }} /></div>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}

export default function WebsiteAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/website-analytics", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(String(json?.error || json?.message || `Analytics request failed (${response.status}).`));
      }
      setData((json.data || {}) as AnalyticsData);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load website analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visitors = data?.recentVisitors || [];
  const pageViews = data?.recentPageViews || [];
  const locations = data?.recentLocations || [];
  const totals = data?.totals || {};

  const snapshot = useMemo(() => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const activeSessions = new Set<string>();
    let todayViews = 0;
    let botViews = 0;

    pageViews.forEach((row) => {
      const visited = dateValue(row.Visited_At)?.getTime() || 0;
      if (visited >= fiveMinutesAgo) activeSessions.add(text(row.Session_ID));
      if (sameDhakaDay(row.Visited_At)) todayViews += 1;
      if (String(row.Is_Bot).toLowerCase() === "true") botViews += 1;
    });

    const returning = visitors.filter((row) => number(row.Total_Sessions) > 1).length;
    return {
      activeNow: [...activeSessions].filter(Boolean).length,
      todayViews,
      returning,
      botViews,
      botShare: percent(botViews, pageViews.length),
    };
  }, [pageViews, visitors]);

  const topPages = useMemo(() => rank(pageViews, (row) => text(row.Page) || "/", 7), [pageViews]);
  const topSources = useMemo(() => rank(pageViews, (row) => referrerLabel(row.Referrer), 7), [pageViews]);
  const topCities = useMemo(() => rank(pageViews, (row) => [text(row.City), text(row.Country)].filter(Boolean).join(", ") || "Unknown", 7), [pageViews]);
  const browsers = useMemo(() => rank(pageViews, (row) => browserLabel(row.User_Agent), 5), [pageViews]);
  const devices = useMemo(() => rank(pageViews, (row) => deviceLabel(row.User_Agent), 5), [pageViews]);

  const recentVisitors = visitors.slice(0, 12);
  const recentViews = pageViews.slice(0, 15);
  const recentLocations = locations.slice(0, 10);
  const sheetUrl = data?.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(data.spreadsheetId)}/edit` : "";

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}><span className={styles.liveDot} /> WEBSITE INTELLIGENCE</div>
          <h1>Website Analytics</h1>
          <p>First-party LAND VIEW visitor activity, traffic sources, page performance and consented location data.</p>
        </div>
        <div className={styles.heroActions}>
          {sheetUrl && <a className={styles.secondaryButton} href={sheetUrl} target="_blank" rel="noreferrer">Open data sheet ↗</a>}
          <button className={styles.primaryButton} type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh analytics"}</button>
        </div>
      </section>

      {error && (
        <section className={styles.errorCard}>
          <strong>Analytics is not available yet.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>Try again</button>
        </section>
      )}

      <section className={styles.statGrid} aria-label="Analytics totals">
        <article className={styles.statCard}><span>Unique visitors</span><strong>{number(totals.visitors).toLocaleString()}</strong><small>All recorded visitors</small></article>
        <article className={styles.statCard}><span>Sessions</span><strong>{number(totals.sessions).toLocaleString()}</strong><small>All recorded sessions</small></article>
        <article className={styles.statCard}><span>Page views</span><strong>{number(totals.pageViews).toLocaleString()}</strong><small>All recorded page loads</small></article>
        <article className={styles.statCard}><span>Precise locations</span><strong>{number(totals.preciseLocationEvents).toLocaleString()}</strong><small>Only with visitor consent</small></article>
      </section>

      <section className={styles.pulseGrid}>
        <article><span>Active now</span><strong>{snapshot.activeNow}</strong><small>Sessions seen in last 5 min</small></article>
        <article><span>Views today</span><strong>{snapshot.todayViews}</strong><small>From the latest 100 page views</small></article>
        <article><span>Returning visitors</span><strong>{snapshot.returning}</strong><small>From latest 50 visitor records</small></article>
        <article><span>Bot traffic</span><strong>{snapshot.botShare}%</strong><small>{snapshot.botViews} of latest {pageViews.length || 0} views</small></article>
      </section>

      <section className={styles.analyticsGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>CONTENT</span><h2>Top pages</h2></div><small>Latest 100 views</small></div>
          <BarList rows={topPages} />
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>ACQUISITION</span><h2>Traffic sources</h2></div><small>Referrer hosts</small></div>
          <BarList rows={topSources} />
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>GEOGRAPHY</span><h2>Top locations</h2></div><small>IP-derived, approximate</small></div>
          <BarList rows={topCities} />
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>TECHNOLOGY</span><h2>Devices & browsers</h2></div><small>Latest 100 views</small></div>
          <div className={styles.splitBars}><div><h3>Devices</h3><BarList rows={devices} /></div><div><h3>Browsers</h3><BarList rows={browsers} /></div></div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>VISITORS</span><h2>Recent visitors</h2></div><small>{visitors.length} recent records loaded</small></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Visitor</th><th>Last seen</th><th>Location</th><th>IP address</th><th>Sessions</th><th>Views</th><th>Device</th></tr></thead>
            <tbody>
              {recentVisitors.map((row, index) => (
                <tr key={text(row.Visitor_ID) || index}>
                  <td><code>{text(row.Visitor_ID).replace(/^vis_/, "").slice(0, 8) || "—"}</code></td>
                  <td><strong>{timeAgo(row.Last_Seen)}</strong><small>{formatDate(row.Last_Seen)}</small></td>
                  <td>{[text(row.City), text(row.Region), text(row.Country)].filter(Boolean).join(", ") || "Unknown"}</td>
                  <td><code>{text(row.Last_IP) || "—"}</code></td>
                  <td>{number(row.Total_Sessions)}</td>
                  <td>{number(row.Total_Page_Views)}</td>
                  <td>{deviceLabel(row.User_Agent)} · {browserLabel(row.User_Agent)}</td>
                </tr>
              ))}
              {!recentVisitors.length && <tr><td colSpan={7} className={styles.emptyCell}>No visitor records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>ACTIVITY STREAM</span><h2>Recent page views</h2></div><small>Newest first</small></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Time</th><th>Page</th><th>Visitor</th><th>Source</th><th>Location</th><th>Device</th></tr></thead>
            <tbody>
              {recentViews.map((row, index) => (
                <tr key={text(row.Event_ID) || index}>
                  <td><strong>{timeAgo(row.Visited_At)}</strong><small>{formatDate(row.Visited_At)}</small></td>
                  <td><span className={styles.pagePath}>{text(row.Page) || "/"}</span><small>{text(row.Title)}</small></td>
                  <td><code>{text(row.Visitor_ID).replace(/^vis_/, "").slice(0, 8) || "—"}</code></td>
                  <td>{referrerLabel(row.Referrer)}</td>
                  <td>{[text(row.City), text(row.Country)].filter(Boolean).join(", ") || "Unknown"}</td>
                  <td>{deviceLabel(row.User_Agent)} · {browserLabel(row.User_Agent)}</td>
                </tr>
              ))}
              {!recentViews.length && <tr><td colSpan={6} className={styles.emptyCell}>No page views recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>LOCATION INTELLIGENCE</span><h2>Consented precise locations</h2></div><small>Browser permission required</small></div>
        <div className={styles.locationGrid}>
          {recentLocations.map((row, index) => {
            const latitude = text(row.Latitude);
            const longitude = text(row.Longitude);
            const mapUrl = latitude && longitude ? `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}` : "";
            return (
              <article className={styles.locationCard} key={text(row.Event_ID) || index}>
                <div><span className={styles.preciseBadge}>PRECISE</span><small>{timeAgo(row.Recorded_At)}</small></div>
                <strong>{latitude || "—"}, {longitude || "—"}</strong>
                <p>Accuracy ±{Math.round(number(row.Accuracy_M)) || "—"} m · IP area: {[text(row.IP_City), text(row.IP_Country)].filter(Boolean).join(", ") || "Unknown"}</p>
                <div className={styles.locationMeta}><code>{text(row.IP) || "IP unavailable"}</code>{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer">Open map ↗</a>}</div>
              </article>
            );
          })}
          {!recentLocations.length && <div className={styles.empty}>No visitor has shared precise location yet.</div>}
        </div>
      </section>

      <footer className={styles.footerNote}>
        <span>IP-based city and coordinates are approximate and may be affected by VPNs, mobile networks or carrier routing. Precise coordinates appear only after browser consent.</span>
        <span>{updatedAt ? `Dashboard refreshed ${formatDate(updatedAt.toISOString())}` : ""}</span>
      </footer>
    </div>
  );
}
