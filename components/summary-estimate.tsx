"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { label: string; amount: number };

function parseAmount(value: string) {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export default function SummaryEstimate() {
  const [rows, setRows] = useState<Row[]>([]);
  const [grand, setGrand] = useState(0);
  const [project, setProject] = useState("Project");

  useEffect(() => {
    const sync = () => {
      const root = document.querySelector(".de-page");
      if (!root) return;

      const next: Row[] = Array.from(root.querySelectorAll(".de-subtotal"))
        .map((node) => {
          const parts = node.querySelectorAll("span, strong");
          return {
            label: parts[0]?.textContent?.trim() || "",
            amount: parseAmount(parts[1]?.textContent || "0"),
          };
        })
        .filter((x) => x.label);

      const total = root.querySelector(".de-metric.de-total strong");
      const title = root.querySelector(".de-print-title p");

      setRows(next);
      setGrand(parseAmount(total?.textContent || "0"));
      if (title?.textContent?.trim()) setProject(title.textContent.trim());
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);

  const total = grand || rows.reduce((sum, row) => sum + row.amount, 0);
  const floorTotal = rows.find((row) => /all floors/i.test(row.label))?.amount || 0;

  const foundation = useMemo(
    () => rows.find((row) => /foundation/i.test(row.label))?.amount || 0,
    [rows],
  );
  const preliminary = rows.find((row) => /preliminary/i.test(row.label))?.amount || 0;
  const grade = rows.find((row) => /grade/i.test(row.label))?.amount || 0;

  return (
    <section
      className="de-card"
      style={{ marginTop: 16, breakBefore: "page" }}
    >
      <div className="de-card-head">
        <div>
          <small>CLIENT-FACING SUMMARY</small>
          <strong>Summary Estimate</strong>
        </div>
        <div style={{ textAlign: "right" }}>
          <small>Project</small>
          <strong>{project}</strong>
        </div>
      </div>

      <div style={{ padding: 14 }}>
        <table className="de-table">
          <thead>
            <tr>
              <th>Work Section</th>
              <th className="num">Estimated Amount</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="num"><strong>{money(row.amount)}</strong></td>
                <td className="num">
                  {total ? ((row.amount / total) * 100).toFixed(1) + "%" : "0.0%"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", padding: 28 }}>
                  Enter quantities and rates above. The Summary Estimate will update automatically.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="de-summary-row total" style={{ marginTop: 10 }}>
          <span>Total Estimated Construction Cost</span>
          <strong>{money(total)}</strong>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          {[
            ["Preliminary", preliminary],
            ["Foundation", foundation],
            ["Grade & Ground", grade],
            ["All Floors", floorTotal],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="de-card"
              style={{ padding: 12, background: "#101820" }}
            >
              <small style={{ color: "#8f9ba5", fontWeight: 900 }}>{label}</small>
              <strong style={{ display: "block", marginTop: 5 }}>
                {money(Number(value))}
              </strong>
            </div>
          ))}
        </div>

        <p style={{ color: "#8d99a2", fontSize: 9, lineHeight: 1.6, margin: "14px 0 0" }}>
          This summary is derived from the existing Detailed Estimate calculation, so quantities and rates are entered only once.
        </p>
      </div>
    </section>
  );
}
