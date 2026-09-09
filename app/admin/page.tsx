"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { landViewApi, DashboardData } from "@/lib/api";
import { ErrorState, Money, pick, formatDate } from "@/components/lv-ui";
import styles from "./dashboard.module.css";

function amount(value: unknown) {
  const number = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function stateClass(status: string) {
  const value = status.toLowerCase();
  if (/cancel|inactive|hold/.test(value)) return styles.paused;
  if (/complete/.test(value)) return styles.complete;
  if (/active|ongoing|progress/.test(value)) return styles.active;
  return styles.other;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    setError("");
    try {
      const result = await landViewApi.getDashboard();
      if (!result?.stats || !Array.isArray(result.recentProjects)) {
        throw new Error("Dashboard data is unavailable. Please retry.");
      }
      if (id !== request.current) return;
      setData(result);
      setUpdated(new Date());
    } catch (e: unknown) {
      if (id === request.current) {
        setError(e instanceof Error ? e.message : "Could not refresh the dashboard.");
      }
    } finally {
      if (id === request.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);

  const stats = data?.stats;
  const billed = amount(stats?.totalBill);
  const paid = amount(stats?.totalPaid);
  const due = amount(stats?.pendingPayments);
  const totalProjects = amount(stats?.projectCount);
  const activeProjects = amount(stats?.activeProjectCount);
  const employees = amount(stats?.employeeCount);
  const percentage = billed > 0 ? Math.max(0, Math.round((paid / billed) * 100)) : null;
  const meter = Math.min(100, percentage ?? 0);
  const term = query.trim().toLowerCase();
  const recent = data?.recentProjects ?? [];
  const projects = recent.filter((project) =>
    [
      pick(project, ["Project_ID", "Project ID", "ProjectId"]),
      pick(project, ["Project_Name", "Project Name", "Name", "Location"]),
      pick(project, ["Client_Name", "Client Name", "Client"]),
      pick(project, ["Status", "status"]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(term)
  );
  const role = String(data?.user?.role || data?.user?.Role || "").toLowerCase();
  const canManage = role === "admin" || role === "manager";

  const statusSummary = useMemo(() => {
    const summary = { active: 0, complete: 0, paused: 0, other: 0 };
    recent.forEach((project) => {
      const status = pick(project, ["Status", "status"], "").toLowerCase();
      if (/cancel|inactive|hold/.test(status)) summary.paused++;
      else if (/complete/.test(status)) summary.complete++;
      else if (/active|ongoing|progress/.test(status)) summary.active++;
      else summary.other++;
    });
    return summary;
  }, [recent]);

  const collectionLabel = percentage === null ? "No billing data" : percentage >= 90 ? "Healthy collection" : percentage >= 60 ? "Collection needs attention" : "Collection priority";
  const activeShare = totalProjects > 0 ? Math.round((activeProjects / totalProjects) * 100) : 0;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>LAND VIEW ERP</span>
          <h1>Command center<span aria-hidden="true">.</span></h1>
          <span className={styles.timestamp} role="status">
            {refreshing
              ? "Updating business data…"
              : updated
                ? `Updated ${updated.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })} · Dhaka`
                : "Management workspace"}
          </span>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.refresh} onClick={load} disabled={refreshing} aria-label="Refresh dashboard">
            <span aria-hidden="true">↻</span> {refreshing ? "Updating…" : "Refresh"}
          </button>
          {canManage && <Link className={styles.primary} href="/admin/projects/new">+ New project</Link>}
        </div>
      </header>

      {error && (
        <div role="alert" className={styles.error}>
          <ErrorState message={data ? `Refresh failed. Showing last loaded data. ${error}` : error} onRetry={refreshing ? undefined : load} />
        </div>
      )}

      {!data ? (
        refreshing && <div className={styles.skeleton} role="status" aria-label="Loading dashboard"><span /><span /><span /><span /></div>
      ) : (
        <>
          <section className={styles.metrics} aria-label="Business totals">
            <Link href="/admin/projects" className={styles.metric}>
              <span className={styles.metricTitle}>Projects <i aria-hidden="true">↗</i></span>
              <strong>{totalProjects}</strong>
              <small><em className={styles.dot} />{activeProjects} active · {activeShare}% portfolio</small>
            </Link>
            <Link href="/admin/employees" className={styles.metric}>
              <span className={styles.metricTitle}>People <i aria-hidden="true">↗</i></span>
              <strong>{employees}</strong>
              <small>Employees in workspace</small>
            </Link>
            <Link href="/admin/finance" className={styles.metric}>
              <span className={styles.metricTitle}>Total billed <i aria-hidden="true">↗</i></span>
              <strong><Money value={billed} /></strong>
              <small>{collectionLabel}</small>
            </Link>
            <Link href="/admin/finance" className={`${styles.metric} ${styles.dueMetric}`}>
              <span className={styles.metricTitle}>{due < 0 ? "Credit balance" : "Receivables"} <i aria-hidden="true">↗</i></span>
              <strong><Money value={Math.abs(due)} /></strong>
              <small>{due > 0 ? "Outstanding client balance" : due < 0 ? "Payments exceed billing" : "No outstanding balance"}</small>
            </Link>
          </section>

          <section className={styles.moduleGrid} aria-label="ERP modules">
            <Link href="/admin/projects" className={styles.moduleCard}>
              <span className={styles.moduleIcon}>01</span>
              <div><small>CORE OPERATIONS</small><strong>Project control</strong><p>Projects, teams, files, site records and delivery status.</p></div>
              <b aria-hidden="true">→</b>
            </Link>
            <Link href="/admin/finance" className={styles.moduleCard}>
              <span className={styles.moduleIcon}>02</span>
              <div><small>COMMERCIAL</small><strong>Finance & accounts</strong><p>Billing, collections, dues and financial records.</p></div>
              <b aria-hidden="true">→</b>
            </Link>
            <Link href="/admin/employees" className={styles.moduleCard}>
              <span className={styles.moduleIcon}>03</span>
              <div><small>ORGANIZATION</small><strong>People & assignments</strong><p>Team directory and project responsibility management.</p></div>
              <b aria-hidden="true">→</b>
            </Link>
          </section>

          <div className={styles.middle}>
            <section className={styles.collection} aria-labelledby="collection-heading">
              <div className={styles.panelTop}><h2 id="collection-heading">Commercial health</h2><Link href="/admin/finance">Open finance ↗</Link></div>
              <div className={styles.collectionBody}>
                <div className={styles.ring} style={{ background: `conic-gradient(#ef493b ${meter}%, #424242 0)` }} aria-hidden="true">
                  <div><strong>{percentage === null ? "—" : `${percentage}%`}</strong><span>collected</span></div>
                </div>
                <div className={styles.collectionFigures}>
                  <span>Cash received</span><strong><Money value={paid} /></strong>
                  <small>{billed > 0 ? <><Money value={billed} /> billed across records</> : "No bills recorded"}</small>
                  <div className={styles.track} role="progressbar" aria-label="Bill collection" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter} aria-valuetext={percentage === null ? "No bills recorded" : `${percentage}% collected`}><span style={{ width: `${meter}%` }} /></div>
                </div>
              </div>
            </section>

            <section className={styles.launcher} aria-labelledby="workspace-heading">
              <div className={styles.panelTop}><h2 id="workspace-heading">Quick actions</h2><span aria-hidden="true">↗</span></div>
              <Link href="/admin/projects"><span className={styles.launchIcon} aria-hidden="true">◇</span><span>Open project register</span><b aria-hidden="true">→</b></Link>
              <Link href={canManage ? "/admin/employees" : "/admin/finance"}><span className={styles.launchIcon} aria-hidden="true">◎</span><span>{canManage ? "Manage project team" : "Review billing & payments"}</span><b aria-hidden="true">→</b></Link>
            </section>
          </div>

          <section className={styles.portfolioPanel} aria-labelledby="portfolio-heading">
            <div className={styles.panelTop}>
              <div><small className={styles.panelKicker}>PORTFOLIO PULSE</small><h2 id="portfolio-heading">Recent project status</h2></div>
              <span className={styles.portfolioCount}>{recent.length} recent records</span>
            </div>
            <div className={styles.statusGrid}>
              <div><span className={`${styles.statusDot} ${styles.activeDot}`} /><small>Active / ongoing</small><strong>{statusSummary.active}</strong></div>
              <div><span className={`${styles.statusDot} ${styles.completeDot}`} /><small>Completed</small><strong>{statusSummary.complete}</strong></div>
              <div><span className={`${styles.statusDot} ${styles.pausedDot}`} /><small>Hold / inactive</small><strong>{statusSummary.paused}</strong></div>
              <div><span className={`${styles.statusDot} ${styles.otherDot}`} /><small>Other / unclassified</small><strong>{statusSummary.other}</strong></div>
            </div>
          </section>

          <section className={styles.projects} aria-labelledby="projects-heading">
            <div className={styles.projectHeader}>
              <div><span className={styles.panelKicker}>PROJECT REGISTER</span><h2 id="projects-heading">Recent projects <span>{recent.length}</span></h2></div>
              <div className={styles.projectTools}>
                <input type="search" aria-label="Search recent projects" placeholder="Search project, client or status…" value={query} onChange={(event) => setQuery(event.target.value)} />
                <Link href="/admin/projects">View all ↗</Link>
              </div>
            </div>
            {projects.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Start date</th><th><span className={styles.srOnly}>Open project</span></th></tr></thead>
                  <tbody>
                    {projects.map((project, index) => {
                      const id = pick(project, ["Project_ID", "Project ID", "ProjectId"]);
                      const name = pick(project, ["Project_Name", "Project Name", "Name", "Location"], id || "Unnamed project");
                      const status = pick(project, ["Status", "status"], "Unspecified");
                      return (
                        <tr key={id || index}>
                          <td>{id ? <Link className={styles.projectName} href={`/admin/projects/${encodeURIComponent(id)}`}>{name}</Link> : <strong>{name}</strong>}<small>{id || "No project ID"}</small></td>
                          <td>{pick(project, ["Client_Name", "Client Name", "Client"], "—")}</td>
                          <td><span className={`${styles.status} ${stateClass(status)}`}><i aria-hidden="true" />{status}</span></td>
                          <td>{formatDate(project.Start_Date || project["Start Date"] || project.Created_Date)}</td>
                          <td>{id && <Link className={styles.open} aria-label={`Open project ${id}`} href={`/admin/projects/${encodeURIComponent(id)}`}>↗</Link>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <span aria-hidden="true">◇</span><h3>{term ? "No matching projects" : "Your next project starts here"}</h3>
                {term ? <button type="button" onClick={() => setQuery("")}>Clear search</button> : canManage ? <Link className={styles.primary} href="/admin/projects/new">+ New project</Link> : <Link href="/admin/projects">Browse projects →</Link>}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
