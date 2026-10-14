"use client";

import { useEffect, useMemo, useState } from "react";

type CategoryName = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";
type CategoryTotal = { gross: number; discount: number; net: number; items: number };
type Totals = Record<CategoryName, CategoryTotal>;

const CATEGORIES: CategoryName[] = ["Engineering Bill", "Supervision Bill", "Other Services Bill"];

function emptyTotals(): Totals {
  return {
    "Engineering Bill": { gross: 0, discount: 0, net: 0, items: 0 },
    "Supervision Bill": { gross: 0, discount: 0, net: 0, items: 0 },
    "Other Services Bill": { gross: 0, discount: 0, net: 0, items: 0 },
  };
}

function amount(value: string | undefined) {
  const parsed = Number(String(value || "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function readTotalsFromBillTable(): Totals {
  const totals = emptyTotals();
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>(".direct-bill-page .db-table tbody tr"));

  for (const row of rows) {
    const categorySelect = row.querySelector<HTMLSelectElement>("select");
    const inputs = row.querySelectorAll<HTMLInputElement>("input");
    const category = String(categorySelect?.value || "") as CategoryName;
    if (!CATEGORIES.includes(category)) continue;

    const gross = amount(inputs[1]?.value);
    const discount = Math.min(gross, amount(inputs[2]?.value));
    if (gross <= 0) continue;

    totals[category].gross += gross;
    totals[category].discount += discount;
    totals[category].net += Math.max(0, gross - discount);
    totals[category].items += 1;
  }

  return totals;
}

export default function CategorizedTotalBill() {
  const [totals, setTotals] = useState<Totals>(emptyTotals);

  useEffect(() => {
    const update = () => setTotals(readTotalsFromBillTable());
    const onInput = () => update();

    update();
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);

    const observer = new MutationObserver(update);
    const target = document.querySelector(".direct-bill-page");
    if (target) observer.observe(target, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      observer.disconnect();
    };
  }, []);

  const grand = useMemo(() => CATEGORIES.reduce((sum, category) => ({
    gross: sum.gross + totals[category].gross,
    discount: sum.discount + totals[category].discount,
    net: sum.net + totals[category].net,
    items: sum.items + totals[category].items,
  }), { gross: 0, discount: 0, net: 0, items: 0 }), [totals]);

  return <section className="categorized-total-bill" aria-label="Categorized total bill">
    <style>{`
      .categorized-total-bill{border:1px solid var(--theme-line-_313b44,#313b44);border-radius:11px;background:var(--theme-bg-_11181e,#11181e);padding:16px;margin:0 0 14px;color:var(--theme-ink-_e8edf1,#e8edf1)}
      .ctb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}
      .ctb-head h2{margin:0;font-size:18px;color:var(--theme-ink-_f8fafc,#f8fafc)}
      .ctb-head p{margin:3px 0 0;font-size:11px;color:var(--theme-ink-_9da9b2,#9da9b2)}
      .ctb-count{font-size:10px;font-weight:900;color:var(--theme-ink-_aab5bd,#aab5bd);text-transform:uppercase;letter-spacing:.05em}
      .ctb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .ctb-card{border:1px solid var(--theme-line-_35414a,#35414a);border-radius:9px;background:var(--theme-bg-_0f171d,#0f171d);padding:12px}
      .ctb-card h3{margin:0 0 9px;font-size:12px;color:var(--theme-ink-_f3f6f8,#f3f6f8)}
      .ctb-line{display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:11px;color:var(--theme-ink-_9da9b2,#9da9b2)}
      .ctb-line strong{color:var(--theme-ink-_e8edf1,#e8edf1)}
      .ctb-line.net{margin-top:5px;padding-top:8px;border-top:1px solid var(--theme-line-_2c3740,#2c3740);font-weight:900}
      .ctb-line.net strong{font-size:16px;color:#a9deb8}
      .ctb-grand{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--theme-line-_35414a,#35414a)}
      .ctb-grand div{border:1px solid var(--theme-line-_35414a,#35414a);border-radius:8px;background:var(--theme-bg-_0f171d,#0f171d);padding:10px}
      .ctb-grand span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--theme-ink-_8f9aa3,#8f9aa3)}
      .ctb-grand strong{display:block;margin-top:4px;font-size:16px}.ctb-grand .net strong{color:#a9deb8}
      @media(max-width:800px){.ctb-grid{grid-template-columns:1fr}.ctb-grand{grid-template-columns:1fr 1fr}}
      @media(max-width:520px){.ctb-head{align-items:flex-start;flex-direction:column}.ctb-grand{grid-template-columns:1fr}}
    `}</style>

    <div className="ctb-head">
      <div><h2>Categorized Total Bill</h2><p>Live totals from the services currently included in this Direct / Full Bill.</p></div>
      <div className="ctb-count">{grand.items} billed item{grand.items === 1 ? "" : "s"}</div>
    </div>

    <div className="ctb-grid">
      {CATEGORIES.map((category) => {
        const total = totals[category];
        return <div className="ctb-card" key={category}>
          <h3>{category}</h3>
          <div className="ctb-line"><span>Gross</span><strong>{money(total.gross)}</strong></div>
          <div className="ctb-line"><span>Discount</span><strong>{money(total.discount)}</strong></div>
          <div className="ctb-line"><span>Items</span><strong>{total.items}</strong></div>
          <div className="ctb-line net"><span>Category Total</span><strong>{money(total.net)}</strong></div>
        </div>;
      })}
    </div>

    <div className="ctb-grand">
      <div><span>Total Gross</span><strong>{money(grand.gross)}</strong></div>
      <div><span>Total Discount</span><strong>{money(grand.discount)}</strong></div>
      <div><span>Total Items</span><strong>{grand.items}</strong></div>
      <div className="net"><span>Grand Total Bill</span><strong>{money(grand.net)}</strong></div>
    </div>
  </section>;
}
