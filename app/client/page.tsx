"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi, ProjectBillingData } from "@/lib/api";

type Row = Record<string, any>;

type ProjectFinance = ProjectBillingData & { invoices: Row[] };

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return "";
}

function money(value: any) {
  const n = Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
}

export default function ClientPortalPage() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [finance, setFinance] = useState<Record<string, ProjectFinance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [p, d] = await Promise.all([
          landViewApi.getProjects(),
          landViewApi.getDocuments(),
        ]);

        const rows = p || [];
        const entries = await Promise.all(rows.map(async (project) => {
          const projectId = String(pick(project, ["Project_ID", "Project ID", "ProjectId"]) || "");
          if (!projectId) return [projectId, null] as const;
          const [billing, invoices] = await Promise.all([
            landViewApi.getProjectBilling(projectId),
            landViewApi.getInvoices(projectId),
          ]);
          return [projectId, { ...billing, invoices: invoices || [] }] as const;
        }));

        if (!cancelled) {
          setProjects(rows);
          setDocuments(d || []);
          setFinance(Object.fromEntries(entries.filter(([, value]) => value)) as Record<string, ProjectFinance>);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Unable to load client workspace.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const totals = useMemo(() => {
    return Object.values(finance).reduce(
      (sum, item) => ({
        bill: sum.bill + Number(item.totalBill || 0),
        paid: sum.paid + Number(item.totalPaid || 0),
        due: sum.due + Number(item.due || 0),
        invoices: sum.invoices + (item.invoices?.length || 0),
      }),
      { bill: 0, paid: 0, due: 0, invoices: 0 }
    );
  }, [finance]);

  if (loading) return <div className="role-portal-status">Loading your LAND VIEW projects…</div>;
  if (error) return <div className="role-portal-status role-portal-status-error">{error}</div>;

  return (
    <section className="role-portal-dashboard">
      <div className="role-portal-hero client-portal-hero">
        <span>CLIENT WORKSPACE</span>
        <h1>Your projects. Your documents. Your billing.</h1>
        <p>
          This portal only shows projects specifically linked to your client account.
          Internal LAND VIEW administration remains inaccessible.
        </p>
      </div>

      <div className="role-portal-grid role-portal-stats">
        <article><b>01</b><h2>{projects.length}</h2><p>Linked projects</p><span>MY PROJECTS</span></article>
        <article><b>02</b><h2>৳ {money(totals.paid)}</h2><p>Total paid</p><span>PAYMENTS</span></article>
        <article><b>03</b><h2>৳ {money(totals.due)}</h2><p>Current balance due</p><span>BALANCE</span></article>
      </div>

      <div className="role-portal-section">
        <div className="role-portal-section-head">
          <div><span>CLIENT ACCESS</span><h2>My Projects</h2></div>
          <small>{totals.invoices} invoice{totals.invoices === 1 ? "" : "s"}</small>
        </div>

        {projects.length ? (
          <div className="role-client-projects">
            {projects.map((project) => {
              const id = String(pick(project, ["Project_ID", "Project ID", "ProjectId"]) || "");
              const item = finance[id];
              const invoices = item?.invoices || [];
              return (
                <article key={id || JSON.stringify(project)} className="role-client-project-card">
                  <div className="role-client-project-head">
                    <div><span>{id || "PROJECT"}</span><h3>{pick(project, ["Project_Name", "Project Name", "Client_Name"]) || "LAND VIEW Project"}</h3><p>{pick(project, ["Location"]) || "Location not set"}</p></div>
                    <strong>{pick(project, ["Status"]) || "Active"}</strong>
                  </div>
                  <div className="role-client-finance-row">
                    <div><small>BILLED</small><b>৳ {money(item?.totalBill)}</b></div>
                    <div><small>PAID</small><b>৳ {money(item?.totalPaid)}</b></div>
                    <div><small>DUE</small><b>৳ {money(item?.due)}</b></div>
                  </div>
                  <div className="role-client-invoices">
                    <span>INVOICES</span>
                    {invoices.length ? invoices.slice(-4).reverse().map((invoice, index) => {
                      const url = String(pick(invoice, ["PDF_URL", "Download_URL", "Invoice_URL"]) || "");
                      return (
                        <div key={String(pick(invoice, ["Invoice_ID"]) || index)}>
                          <strong>{pick(invoice, ["Invoice_ID"]) || "Invoice"}</strong>
                          <small>{pick(invoice, ["Invoice_Date"]) || ""}</small>
                          {url ? <a href={url} target="_blank" rel="noreferrer">View PDF</a> : <em>PDF unavailable</em>}
                        </div>
                      );
                    }) : <p>No invoices generated yet.</p>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="role-empty-state">No projects are linked to this client account yet.</div>}
      </div>

      <div className="role-portal-section">
        <div className="role-portal-section-head"><div><span>SHARED FILES</span><h2>Documents</h2></div><small>{documents.length} file{documents.length === 1 ? "" : "s"}</small></div>
        <div className="role-record-list role-record-grid">
          {documents.map((doc, index) => {
            const url = String(pick(doc, ["File_URL", "URL", "Document_URL"]) || "");
            return (
              <article key={String(pick(doc, ["Document_ID"]) || index)}>
                <div><strong>{pick(doc, ["Project_ID"]) || "Project"}</strong><span>{pick(doc, ["Document_Name", "Name"]) || "Document"}</span></div>
                {url ? <a href={url} target="_blank" rel="noreferrer">Open</a> : <small>Not linked</small>}
              </article>
            );
          })}
          {!documents.length && <div className="role-empty-state compact">No client-visible documents are available.</div>}
        </div>
      </div>
    </section>
  );
}
