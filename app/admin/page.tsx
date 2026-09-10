"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { landViewApi, DashboardData, FinanceSheetData } from "@/lib/api";
import { ErrorState, Money, pick } from "@/components/lv-ui";
import styles from "./dashboard.module.css";

function amount(value: unknown) {
  const number = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function normalizeProjectId(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return "";
  return text.startsWith("LV-") ? text : /^\d+$/.test(text) ? `LV-${text}` : text;
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
  const [finance, setFinance] = useState<FinanceSheetData | null>(null);
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
      const [result, financeSummary] = await Promise.all([
        landViewApi.getDashboard(),
        landViewApi.getFinanceSheet("Summary"),
      ]);
      if (!result?.stats || !Array.isArray(result.recentProjects)) {
        throw new Error("Dashboard data is unavailable. Please retry.");
      }
      if (id !== request.current) return;
      setData(result);
      setFinance(financeSummary);
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
  const financeTotals = finance?.totals;
  const billed = finance ? amount(financeTotals?.billed) : amount(stats?.totalBill);
  const paid = finance ? amount(financeTotals?.paid) : amount(stats?.totalPaid);
  const due = finance ? amount(financeTotals?.due) : amount(stats?.pendingPayments);
  const totalProjects = amount(stats?.projectCount);
  const activeProjects = amount(stats?.activeProjectCount);
  const employees = amount(stats?.employeeCount);
  const percentage = billed > 0 ? Math.max(0, Math.round((paid / billed) * 100)) : null;
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

  const financeByProject = useMemo(() => {
    const map = new Map<string, { billed: number; paid: number; due: number; status: string }>();
    (finance?.rows ?? []).forEach((row) => {
      const id = normalizeProjectId(row[0]);
      if (!id) return;
      const gross = amount(row[3]) + amount(row[7]) + amount(row[11]);
      const discount = amount(row[4]) + amount(row[8]) + amount(row[12]);
      const paidValue = amount(row[5]) + amount(row[9]) + amount(row[13]);
      const dueValue = amount(row[15]);
      map.set(id, {
        billed: gross - discount,
        paid: paidValue,
        due: dueValue,
        status: String(row[16] || (dueValue > 0 ? "Due" : "Full Paid")).trim(),
      });
    });
    return map;
  }, [finance]);

  const commercialDues = useMemo(() => {
    return (finance?.rows ?? []).reduce(
      (totals, row) => {
        totals.engineering += amount(row[6]);
        totals.supervision += amount(row[10]);
        totals.others += amount(row[14]);
        return totals;
      },
      { engineering: 0, supervision: 0, others: 0 }
    );
  }, [finance]);

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
  const healthyRecent = recent.length ? Math.round(((statusSummary.active + statusSummary.complete) / recent.length) * 100) : 0;
  const dueProjectCount = useMemo(() => Array.from(financeByProject.values()).filter((item) => item.due > 0).length, [financeByProject]);
  const fullPaidProjectCount = useMemo(() => Array.from(financeByProject.values()).filter((item) => item.due <= 0 && item.billed > 0).length, [financeByProject]);
  const attentionCount = dueProjectCount + statusSummary.paused + statusSummary.other;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>LAND VIEW ERP</span>
          <h1>Command center<span aria-hidden="true">.</span></h1>
          <span className={styles.timestamp} role="status">
            {refreshing
              ? "Updating project & finance data…"
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
        refreshing && <div className={styles.skeleton} role="status" aria-label="Loading dashboard"><span /><span /><span /><span /><span /><span /></div>
      ) : (
        <>
          <section className={styles.metrics} aria-label="Business totals">
            <Link href="/admin/projects" className={styles.metric}>
              <span className={styles.metricTitle}>Total projects <i aria-hidden="true">↗</i></span>
              <strong>{totalProjects}</strong>
              <small>Complete project portfolio</small>
            </Link>
            <Link href="/admin/projects" className={styles.metric}>
              <span className={styles.metricTitle}>Ongoing <i aria-hidden="true">↗</i></span>
              <strong>{activeProjects}</strong>
              <small><em className={styles.dot} />{activeShare}% of portfolio</small>
            </Link>
            <Link href="/admin/finance" className={`${styles.metric} ${styles.dueMetric}`}>
              <span className={styles.metricTitle}>{due < 0 ? "Credit balance" : "Receivables"} <i aria-hidden="true">↗</i></span>
              <strong><Money value={Math.abs(due)} /></strong>
              <small>{dueProjectCount} project{dueProjectCount === 1 ? "" : "s"} with outstanding balance</small>
            </Link>
            <Link href="/admin/finance" className={styles.metric}>
              <span className={styles.metricTitle}>Collected <i aria-hidden="true">↗</i></span>
              <strong><Money value={paid} /></strong>
              <small>{collectionLabel}</small>
            </Link>
            <Link href="/admin/employees" className={styles.metric}>
              <span className={styles.metricTitle}>People <i aria-hidden="true">↗</i></span>
              <strong>{employees}</strong>
              <small>Employees in workspace</small>
            </Link>
            <Link href="/admin/finance" className={styles.metric}>
              <span className={styles.metricTitle}>Collection rate <i aria-hidden="true">↗</i></span>
              <strong>{percentage === null ? "—" : `${percentage}%`}</strong>
              <small>{billed > 0 ? <><Money value={billed} /> net billed · {fullPaidProjectCount} full paid</> : "No billing data"}</small>
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
              <div><small>COMMERCIAL</small><strong>Finance & accounts</strong><p>Live billing, collections, dues and project balances.</p></div>
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
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:20}}>
                <Link href="/admin/finance" style={{display:"flex",flexDirection:"column",gap:8,padding:16,border:"1px solid #4a3d3b",borderRadius:10,background:"linear-gradient(145deg,#302827,#272727)",color:"#f4f4f4"}}>
                  <span style={{fontSize:10,color:"#b7b7b7",textTransform:"uppercase",letterSpacing:".08em"}}>Engineering Bill</span>
                  <strong style={{fontSize:24,fontWeight:650,color:"#ff9187"}}><Money value={commercialDues.engineering} /></strong>
                  <small style={{fontSize:10,color:"#9f9f9f"}}>Engineering / design due</small>
                </Link>
                <Link href="/admin/finance" style={{display:"flex",flexDirection:"column",gap:8,padding:16,border:"1px solid #4a3d3b",borderRadius:10,background:"linear-gradient(145deg,#302827,#272727)",color:"#f4f4f4"}}>
                  <span style={{fontSize:10,color:"#b7b7b7",textTransform:"uppercase",letterSpacing:".08em"}}>Supervision Bill</span>
                  <strong style={{fontSize:24,fontWeight:650,color:"#ff9187"}}><Money value={commercialDues.supervision} /></strong>
                  <small style={{fontSize:10,color:"#9f9f9f"}}>Site supervision due</small>
                </Link>
                <Link href="/admin/finance" style={{display:"flex",flexDirection:"column",gap:8,padding:16,border:"1px solid #4a3d3b",borderRadius:10,background:"linear-gradient(145deg,#302827,#272727)",color:"#f4f4f4"}}>
                  <span style={{fontSize:10,color:"#b7b7b7",textTransform:"uppercase",letterSpacing:".08em"}}>Other Services Bill</span>
                  <strong style={{fontSize:24,fontWeight:650,color:"#ff9187"}}><Money value={commercialDues.others} /></strong>
                  <small style={{fontSize:10,color:"#9f9f9f"}}>Other services due</small>
                </Link>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",marginTop:14,paddingTop:14,borderTop:"1px solid #3d3d3d",fontSize:11,color:"#aaa"}}>
                <span>Total outstanding <strong style={{color:"#f4f4f4",marginLeft:6}}><Money value={due} /></strong></span>
                <span>Collected <strong style={{color:"#f4f4f4",marginLeft:6}}><Money value={paid} /></strong> · {percentage === null ? "—" : `${percentage}%`}</span>
              </div>
            </section>

            <section className={styles.launcher} aria-labelledby="workspace-heading">
              <div className={styles.panelTop}><h2 id="workspace-heading">Quick actions</h2><span aria-hidden="true">↗</span></div>
              <Link href="/admin/projects"><span className={styles.launchIcon} aria-hidden="true">◇</span><span>Open project register</span><b aria-hidden="true">→</b></Link>
              <Link href="/admin/finance/invoices"><span className={styles.launchIcon} aria-hidden="true">৳</span><span>Open project billing lookup</span><b aria-hidden="true">→</b></Link>
            </section>
          </div>

          <section className={styles.focusGrid} aria-label="Management attention">
            <div className={styles.attentionPanel}>
              <div className={styles.panelTop}><div><small className={styles.panelKicker}>NEEDS ATTENTION</small><h2>Management queue</h2></div><strong className={styles.attentionBadge}>{attentionCount}</strong></div>
              <div className={styles.attentionList}>
                <Link href="/admin/finance"><span className={styles.attentionIcon}>৳</span><div><strong>Outstanding receivables</strong><small>{due > 0 ? <>{dueProjectCount} project{dueProjectCount === 1 ? "" : "s"} · <Money value={due} /> requires collection follow-up</> : "No outstanding client balance"}</small></div><b>→</b></Link>
                <Link href="/admin/projects"><span className={styles.attentionIcon}>!</span><div><strong>Hold / inactive projects</strong><small>{statusSummary.paused} recent project{statusSummary.paused === 1 ? "" : "s"} need review</small></div><b>→</b></Link>
                <Link href="/admin/projects"><span className={styles.attentionIcon}>?</span><div><strong>Unclassified status</strong><small>{statusSummary.other} recent project{statusSummary.other === 1 ? "" : "s"} need a clear status</small></div><b>→</b></Link>
              </div>
            </div>

            <div className={styles.healthPanel}>
              <div className={styles.panelTop}><div><small className={styles.panelKicker}>PROJECT HEALTH</small><h2>Portfolio condition</h2></div><strong>{healthyRecent}%</strong></div>
              <div className={styles.healthBar}><span style={{ width: `${healthyRecent}%` }} /></div>
              <div className={styles.healthStats}>
                <div><span>On track</span><strong>{statusSummary.active}</strong></div>
                <div><span>Completed</span><strong>{statusSummary.complete}</strong></div>
                <div><span>Finance due</span><strong>{dueProjectCount}</strong></div>
              </div>
              <p>Operational health comes from project status; finance due comes directly from the live Finance Summary.</p>
            </div>
          </section>

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
              <div><span className={styles.panelKicker}>PROJECT + FINANCE REGISTER</span><h2 id="projects-heading">Recent projects <span>{recent.length}</span></h2></div>
              <div className={styles.projectTools}>
                <input type="search" aria-label="Search recent projects" placeholder="Search project, client or status…" value={query} onChange={(event) => setQuery(event.target.value)} />
                <Link href="/admin/projects">View all ↗</Link>
              </div>
            </div>
            {projects.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Project</th><th>Client</th><th>Project status</th><th>Finance status</th><th>Received</th><th>Due</th><th><span className={styles.srOnly}>Open project</span></th></tr></thead>
                  <tbody>
                    {projects.map((project, index) => {
                      const id = pick(project, ["Project_ID", "Project ID", "ProjectId"]);
                      const normalizedId = normalizeProjectId(id);
                      const projectFinance = financeByProject.get(normalizedId);
                      const name = pick(project, ["Project_Name", "Project Name", "Name", "Location"], id || "Unnamed project");
                      const status = pick(project, ["Status", "status"], "Unspecified");
                      const financeStatus = projectFinance?.status || "No finance row";
                      return (
                        <tr key={id || index}>
                          <td>{id ? <Link className={styles.projectName} href={`/admin/projects/${encodeURIComponent(id)}`}>{name}</Link> : <strong>{name}</strong>}<small>{id || "No project ID"}</small></td>
                          <td>{pick(project, ["Client_Name", "Client Name", "Client"], "—")}</td>
                          <td><span className={`${styles.status} ${stateClass(status)}`}><i aria-hidden="true" />{status}</span></td>
                          <td><span className={`${styles.status} ${projectFinance?.due && projectFinance.due > 0 ? styles.paused : projectFinance ? styles.complete : styles.other}`}><i aria-hidden="true" />{financeStatus}</span></td>
                          <td>{projectFinance ? <Money value={projectFinance.paid} /> : "—"}</td>
                          <td>{projectFinance ? <Money value={projectFinance.due} /> : "—"}</td>
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
