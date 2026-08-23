"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, any>;

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function dateText(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

export default function EmployeePortalPage() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [visits, setVisits] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [p, d, v] = await Promise.all([
          landViewApi.getProjects(),
          landViewApi.getDocuments(),
          landViewApi.getSiteVisits(),
        ]);
        if (!cancelled) {
          setProjects(p || []);
          setDocuments(d || []);
          setVisits(v || []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Unable to load employee workspace.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const activeProjects = useMemo(
    () => projects.filter((p) => {
      const status = String(pick(p, ["Status", "status"]) || "").toLowerCase();
      return !["completed", "inactive", "cancelled"].includes(status);
    }).length,
    [projects]
  );

  if (loading) {
    return <div className="role-portal-status">Loading assigned LAND VIEW work…</div>;
  }

  if (error) {
    return <div className="role-portal-status role-portal-status-error">{error}</div>;
  }

  return (
    <section className="role-portal-dashboard">
      <div className="role-portal-hero">
        <span>EMPLOYEE WORKSPACE</span>
        <h1>Your assigned LAND VIEW work.</h1>
        <p>
          This portal only receives projects, documents and site activity that your
          employee account is authorized to access.
        </p>
      </div>

      <div className="role-portal-grid role-portal-stats">
        <article><b>01</b><h2>{projects.length}</h2><p>Assigned projects</p><span>MY PROJECTS</span></article>
        <article><b>02</b><h2>{activeProjects}</h2><p>Active assignments</p><span>ACTIVE WORK</span></article>
        <article><b>03</b><h2>{documents.length + visits.length}</h2><p>Documents + site records</p><span>PROJECT ACTIVITY</span></article>
      </div>

      <div className="role-portal-section">
        <div className="role-portal-section-head">
          <div><span>ASSIGNED ACCESS</span><h2>My Projects</h2></div>
          <small>{projects.length} project{projects.length === 1 ? "" : "s"}</small>
        </div>

        {projects.length ? (
          <div className="role-project-list">
            {projects.map((project) => {
              const id = String(pick(project, ["Project_ID", "Project ID", "ProjectId"]) || "");
              return (
                <article key={id || JSON.stringify(project)}>
                  <div>
                    <span>{id || "PROJECT"}</span>
                    <h3>{pick(project, ["Project_Name", "Project Name", "Client_Name"]) || "LAND VIEW Project"}</h3>
                    <p>{pick(project, ["Location", "Project_Location"]) || "Location not set"}</p>
                  </div>
                  <strong>{pick(project, ["Status", "status"]) || "Active"}</strong>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="role-empty-state">No projects are assigned to this employee account yet.</div>
        )}
      </div>

      <div className="role-portal-two-column">
        <div className="role-portal-section">
          <div className="role-portal-section-head"><div><span>RECENT RECORDS</span><h2>Site Activity</h2></div></div>
          <div className="role-record-list">
            {visits.slice(-6).reverse().map((visit, index) => (
              <article key={String(pick(visit, ["Visit_ID"]) || index)}>
                <div><strong>{pick(visit, ["Project_ID"]) || "Project"}</strong><span>{pick(visit, ["Visit_Purpose", "Purpose"]) || "Site visit"}</span></div>
                <small>{dateText(pick(visit, ["Visit_Date", "Date"]))}</small>
              </article>
            ))}
            {!visits.length && <div className="role-empty-state compact">No site visits available.</div>}
          </div>
        </div>

        <div className="role-portal-section">
          <div className="role-portal-section-head"><div><span>PROJECT FILES</span><h2>Documents</h2></div></div>
          <div className="role-record-list">
            {documents.slice(-6).reverse().map((doc, index) => {
              const url = String(pick(doc, ["File_URL", "URL", "Document_URL"]) || "");
              return (
                <article key={String(pick(doc, ["Document_ID"]) || index)}>
                  <div><strong>{pick(doc, ["Project_ID"]) || "Project"}</strong><span>{pick(doc, ["Document_Name", "Name"]) || "Document"}</span></div>
                  {url ? <a href={url} target="_blank" rel="noreferrer">Open</a> : <small>{dateText(pick(doc, ["Document_Date", "Created_At"]))}</small>}
                </article>
              );
            })}
            {!documents.length && <div className="role-empty-state compact">No documents available.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
