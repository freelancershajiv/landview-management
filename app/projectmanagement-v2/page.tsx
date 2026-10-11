"use client";

import { useEffect, useMemo, useState } from "react";
import { reconcileLegacyWorkspace } from "@/lib/project-management-v2/legacy-adapter";

const money = (value: unknown) => new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const modules = [
  "Control Center",
  "Finance",
  "Suppliers",
  "Contractors",
  "Work Progress",
  "Site Visits",
  "Documents",
  "Reports",
  "Activity",
];

export default function ProjectManagementV2Page() {
  const [data, setData] = useState<any>(null);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(code = "") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(code
        ? `/api/project-management?projectId=${encodeURIComponent(code)}`
        : "/api/project-management", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load Project Management data.");
      setData(json.data);
      if (json.data?.selectedProject?.projectCode) setProjectId(json.data.selectedProject.projectCode);
    } catch (e: any) {
      setError(e?.message || "Could not load Project Management data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("projectId") || "";
    setProjectId(code);
    void load(code);
  }, []);

  const reconciliation = useMemo(() => {
    if (!data?.selectedProject) return null;
    return reconcileLegacyWorkspace(data);
  }, [data]);

  function chooseProject(code: string) {
    setProjectId(code);
    const next = code ? `/projectmanagement-v2?projectId=${encodeURIComponent(code)}` : "/projectmanagement-v2";
    window.history.replaceState(null, "", next);
    void load(code);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7f6", color: "#172329", padding: "22px" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".14em", color: "#1d6b52" }}>LAND VIEW</div>
            <h1 style={{ margin: "4px 0 3px", fontSize: 28 }}>Project Management V2</h1>
            <div style={{ color: "#6c7b80", fontSize: 13 }}>Read-only foundation and balance reconciliation. Production Project Management is untouched.</div>
          </div>
          <div style={{ padding: "8px 12px", borderRadius: 999, background: "#e4f3ed", color: "#1d6b52", fontWeight: 850, fontSize: 11 }}>FOUNDATION · READ ONLY</div>
        </header>

        <nav style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12 }}>
          {modules.map((item, index) => (
            <span key={item} style={{ whiteSpace: "nowrap", padding: "9px 12px", borderRadius: 9, fontSize: 11, fontWeight: 800, background: index === 0 ? "#1d6b52" : "#fff", color: index === 0 ? "#fff" : "#66757b", border: "1px solid #dfe7e4" }}>{item}</span>
          ))}
        </nav>

        <section style={{ background: "#fff", border: "1px solid #dde6e2", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 850, marginBottom: 7, color: "#53646b" }}>Project</label>
          <select value={projectId} onChange={(event) => chooseProject(event.target.value)} style={{ width: "100%", maxWidth: 560, height: 42, border: "1px solid #ccd9d4", borderRadius: 10, padding: "0 12px", background: "#fff", color: "#172329" }}>
            <option value="">Select a Project Management project</option>
            {(data?.projects || []).map((project: any) => <option key={project.id} value={project.projectCode}>{project.projectCode} · {project.projectName}</option>)}
          </select>
        </section>

        {error ? <div style={{ background: "#fff1f0", border: "1px solid #f0c9c5", color: "#8a2e25", padding: 14, borderRadius: 12, marginBottom: 16 }}>{error}</div> : null}
        {loading ? <div style={{ padding: 24, color: "#6c7b80" }}>Loading Project Management V2 foundation…</div> : null}

        {!loading && !data?.selectedProject ? (
          <section style={{ background: "#fff", border: "1px solid #dde6e2", borderRadius: 14, padding: 28 }}>
            <h2 style={{ marginTop: 0 }}>Choose a project to begin reconciliation</h2>
            <p style={{ marginBottom: 0, color: "#68777c" }}>V2 is reading the existing Project Management system only. No V2 database writes are enabled yet.</p>
          </section>
        ) : null}

        {!loading && data?.selectedProject && reconciliation ? (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginBottom: 16 }}>
              {[
                ["V2 Cash Balance", reconciliation.v2.projectCashBalance],
                ["V1 Cash Balance", reconciliation.v1.cashBalance],
                ["Total Deposit", reconciliation.v1.totalDeposit],
                ["Total Expense", reconciliation.v1.totalExpense],
                ["Cheque on Hold", reconciliation.v2.chequeOnHold],
                ["Supplier Advance · V1", reconciliation.v1.supplierAdvance],
                ["Contractor Advance · V1", reconciliation.v1.contractorAdvance],
                ["Contractor Payable · V1", reconciliation.v1.contractorPayable],
              ].map(([label, amount]) => (
                <article key={String(label)} style={{ background: "#fff", border: "1px solid #dde6e2", borderRadius: 13, padding: 16 }}>
                  <div style={{ color: "#748287", fontSize: 10, fontWeight: 850, letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ marginTop: 7, fontSize: 21, fontWeight: 900 }}>{money(amount)}</div>
                </article>
              ))}
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
              <article style={{ background: "#fff", border: `1px solid ${Math.abs(reconciliation.cashDifference) < 0.005 ? "#b9ddce" : "#efc8c4"}`, borderRadius: 13, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 850, color: "#69797f" }}>CASH RECONCILIATION</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 7 }}>{money(reconciliation.cashDifference)}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#68777c" }}>{Math.abs(reconciliation.cashDifference) < 0.005 ? "Matched. V2 cash formula agrees with the current system." : "Mismatch detected. This project must be reconciled before V2 writes are enabled."}</div>
              </article>

              <article style={{ background: "#fff", border: `1px solid ${Math.abs(reconciliation.chequeDifference) < 0.005 ? "#b9ddce" : "#efc8c4"}`, borderRadius: 13, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 850, color: "#69797f" }}>CHEQUE RECONCILIATION</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 7 }}>{money(reconciliation.chequeDifference)}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#68777c" }}>{Math.abs(reconciliation.chequeDifference) < 0.005 ? "Matched." : "Mismatch detected in cheque-on-hold interpretation."}</div>
              </article>
            </section>

            <section style={{ background: "#fff", border: "1px solid #dde6e2", borderRadius: 14, padding: 18, marginTop: 16 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Foundation status</h2>
              <div style={{ color: "#68777c", fontSize: 13, lineHeight: 1.6 }}>
                {reconciliation.transactions.length} existing financial rows were mapped into the V2 transaction model for this read-only comparison. Supplier deliveries and contractor certified-work reconciliation will be connected next using stable party identities.
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
