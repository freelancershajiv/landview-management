"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./billing-exception-queue.module.css";

type Brief = {
  dateLabel: string;
  finance: { received: number; spent: number };
  operations: { tasksDue: number; siteVisits: number; proposals: number; websiteEnquiries: number; projectStageChanges: number };
  actionCenter: { counts: { total: number; critical: number } };
};

const bdt = new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" });

export default function ManagementScorecard() {
  const [data, setData] = useState<Brief | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/daily-brief", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error("Daily brief unavailable.");
        if (!controller.signal.aborted) setData(payload.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  const metrics = data ? [
    { name: "Open exceptions", value: data.actionCenter.counts.total, href: "/admin/action-center" },
    { name: "Critical exceptions", value: data.actionCenter.counts.critical, href: "/admin/action-center" },
    { name: "Tasks due today", value: data.operations.tasksDue, href: "/admin/todo" },
    { name: "Site visits today", value: data.operations.siteVisits, href: "/admin/site-visits" },
    { name: "New proposals today", value: data.operations.proposals, href: "/admin/proposals" },
    { name: "New website enquiries today", value: data.operations.websiteEnquiries, href: "/admin/website-leads" },
    { name: "Project stage changes today", value: data.operations.projectStageChanges, href: "/admin/lifecycle" },
    { name: "Received today", value: bdt.format(data.finance.received), href: "/admin/billing/reports" },
    { name: "Expenses today", value: bdt.format(data.finance.spent), href: "/admin/expenses" },
  ] : [];

  return (
    <section className={styles.queue} aria-labelledby="management-scorecard-title">
      <div className={styles.header}>
        <div>
          <h1 id="management-scorecard-title">Operations Scorecard</h1>
          {data && <p>{data.dateLabel} · Asia/Dhaka</p>}
        </div>
        <Link href="/admin/website-analytics">Website Analytics</Link>
      </div>
      {error ? <p role="alert">Could not load the daily scorecard.</p>
        : !data ? <p role="status">Loading today’s operations…</p> : (
          <ul className={styles.metrics}>
            {metrics.map((metric) => <li key={metric.name}>
              <Link href={metric.href}><strong>{metric.value}</strong><span>{metric.name}</span></Link>
            </li>)}
          </ul>
        )}
    </section>
  );
}
