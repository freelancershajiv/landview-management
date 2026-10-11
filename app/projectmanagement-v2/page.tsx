"use client";

import { useState } from "react";

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

const metricCards = [
  ["Project Cash Balance", "Protected"],
  ["Total Received", "Protected"],
  ["Total Expense", "Protected"],
  ["Supplier Advance", "Protected"],
  ["Supplier Payable", "Protected"],
  ["Contractor Advance", "Protected"],
  ["Contractor Payable", "Protected"],
  ["Cheque on Hold", "Protected"],
];

export default function ProjectManagementV2PublicPreview() {
  const [activeModule, setActiveModule] = useState("Control Center");

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7f6", color: "#172329", padding: 22 }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".14em", color: "#1d6b52" }}>LAND VIEW</div>
            <h1 style={{ margin: "4px 0 3px", fontSize: 28 }}>Project Management V2</h1>
            <div style={{ color: "#6c7b80", fontSize: 13 }}>Public preview of the new Project Management workspace. No login is required for this page.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <a href="/" style={{ textDecoration: "none", padding: "8px 12px", borderRadius: 999, background: "#fff", border: "1px solid #d9e4df", color: "#42545b", fontWeight: 800, fontSize: 11 }}>MAIN WEBSITE</a>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#e4f3ed", color: "#1d6b52", fontWeight: 850, fontSize: 11 }}>V2 · PUBLIC PREVIEW</div>
          </div>
        </header>

        <nav style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12 }} aria-label="Project Management V2 modules">
          {modules.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActiveModule(item)}
              style={{
                whiteSpace: "nowrap",
                padding: "9px 12px",
                borderRadius: 9,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                background: activeModule === item ? "#1d6b52" : "#fff",
                color: activeModule === item ? "#fff" : "#66757b",
                border: "1px solid #dfe7e4",
              }}
            >
              {item}
            </button>
          ))}
        </nav>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, background: "#fff", border: "1px solid #dde6e2", borderRadius: 14, padding: 16, marginBottom: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 850, color: "#748287", letterSpacing: ".06em", textTransform: "uppercase" }}>Preview Project</div>
            <div style={{ marginTop: 4, fontSize: 19, fontWeight: 900 }}>LV-157 · Project Management V2</div>
            <div style={{ marginTop: 4, color: "#6c7b80", fontSize: 12 }}>The final version will let you select any Project Management project here.</div>
          </div>
          <div style={{ borderRadius: 10, background: "#f2f6f4", padding: "10px 12px", color: "#56676d", fontSize: 11, fontWeight: 800 }}>READ ONLY</div>
        </section>

        {activeModule === "Control Center" ? (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginBottom: 16 }}>
              {metricCards.map(([label, value]) => (
                <article key={label} style={{ background: "#fff", border: "1px solid #dde6e2", borderRadius: 13, padding: 16 }}>
                  <div style={{ color: "#748287", fontSize: 10, fontWeight: 850, letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ marginTop: 7, fontSize: 21, fontWeight: 900, color: "#415158" }}>{value}</div>
                </article>
              ))}
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
              <article style={{ background: "#fff", border: "1px solid #b9ddce", borderRadius: 13, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 850, color: "#69797f" }}>FINANCE RECONCILIATION</div>
                <div style={{ fontSize: 23, fontWeight: 900, marginTop: 7, color: "#1d6b52" }}>V1 ↔ V2</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#68777c", lineHeight: 1.6 }}>V2 will compare every important finance figure against the current Project Management system before write access is enabled.</div>
              </article>

              <article style={{ background: "#fff", border: "1px solid #d9e4df", borderRadius: 13, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 850, color: "#69797f" }}>PARTY ACCOUNTS</div>
                <div style={{ fontSize: 23, fontWeight: 900, marginTop: 7 }}>Supplier + Contractor</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#68777c", lineHeight: 1.6 }}>Payments, deliveries, certified bills, advances and payables will connect to one stable party identity.</div>
              </article>
            </section>
          </>
        ) : (
          <section style={{ background: "#fff", border: "1px solid #dde6e2", borderRadius: 14, padding: 28, minHeight: 260 }}>
            <div style={{ fontSize: 10, fontWeight: 850, color: "#748287", letterSpacing: ".06em", textTransform: "uppercase" }}>Project Management V2</div>
            <h2 style={{ margin: "7px 0 8px", fontSize: 22 }}>{activeModule}</h2>
            <p style={{ margin: 0, color: "#68777c", lineHeight: 1.7, maxWidth: 760 }}>This module is part of the V2 rebuild. Its public preview is intentionally read-only; live internal records and editing controls stay protected while the new architecture is being reconciled.</p>
          </section>
        )}

        <section style={{ background: "#fff8e8", border: "1px solid #ead8aa", borderRadius: 14, padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#7a5a13" }}>PUBLIC PREVIEW SAFETY</div>
          <div style={{ marginTop: 5, color: "#745f31", fontSize: 12, lineHeight: 1.6 }}>The layout is public so you can review it without logging in. Actual project balances, ledgers, supplier payments and contractor financial records are not exposed on this public page.</div>
        </section>
      </div>
    </main>
  );
}
