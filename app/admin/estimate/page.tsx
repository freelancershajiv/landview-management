import Link from "next/link";

const estimateTypes = [
  {
    title: "Detailed Estimate",
    eyebrow: "Quantity & BOQ Based",
    description:
      "Prepare a complete quantity-driven building estimate with foundation, grade beam, RCC, floor-by-floor work, finishing items and a generated detailed BOQ.",
    href: "/admin/estimate/detailed",
    action: "Open Detailed Estimate",
    points: ["Item quantities", "Material + labour rates", "Floor-by-floor costing", "Detailed BOQ"],
  },
  {
    title: "Summary Estimate",
    eyebrow: "Quick Cost Planning",
    description:
      "Prepare a fast preliminary construction estimate from building area, floor count, rate per square foot and project-specific allowances without entering a full BOQ.",
    href: "/admin/estimate/summary",
    action: "Open Summary Estimate",
    points: ["Area × rate costing", "Project allowances", "Contingency", "Printable summary"],
  },
];

export default function EstimatePage() {
  return (
    <div className="estimate-home">
      <style>{`
        .estimate-home{max-width:1180px;margin:0 auto;color:var(--theme-ink-_17222b,#17222b)}
        .estimate-hero{padding:8px 0 22px}
        .estimate-kicker{display:block;color:#d61f26;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;margin-bottom:7px}
        .estimate-hero h1{font-size:34px;line-height:1.12;margin:0 0 8px;font-weight:900}
        .estimate-hero p{max-width:760px;margin:0;color:var(--theme-ink-_687783,#687783);font-size:13px;line-height:1.65}
        .estimate-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
        .estimate-card{display:flex;flex-direction:column;min-height:330px;border:1px solid var(--theme-line-_dfe5e9,#dfe5e9);border-radius:18px;background:var(--theme-bg-_fff,#fff);box-shadow:0 10px 28px rgba(16,24,32,.06);overflow:hidden}
        .estimate-card-top{height:6px;background:#d61f26}
        .estimate-card-body{display:flex;flex:1;flex-direction:column;padding:24px}
        .estimate-card small{color:#d61f26;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
        .estimate-card h2{font-size:24px;margin:7px 0 10px}
        .estimate-card p{margin:0;color:var(--theme-ink-_687783,#687783);font-size:12px;line-height:1.65}
        .estimate-points{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:22px 0 24px;padding:0;list-style:none}
        .estimate-points li{padding:9px 10px;border:1px solid var(--theme-line-_e4e9ec,#e4e9ec);border-radius:9px;background:var(--theme-bg-_f7f9fa,#f7f9fa);font-size:10px;font-weight:800}
        .estimate-open{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:10px;background:#d61f26;color:#fff;text-decoration:none;font-size:11px;font-weight:900}
        .estimate-open span:last-child{font-size:17px;line-height:1}
        .estimate-note{margin-top:18px;padding:13px 15px;border:1px solid var(--theme-line-_e4e9ec,#e4e9ec);border-radius:11px;background:var(--theme-bg-_f8fafb,#f8fafb);color:var(--theme-ink-_687783,#687783);font-size:11px;line-height:1.6}
        .estimate-note b{color:var(--theme-ink-_17222b,#17222b)}
        @media(max-width:760px){.estimate-grid{grid-template-columns:1fr}.estimate-card{min-height:0}.estimate-hero h1{font-size:28px}.estimate-points{grid-template-columns:1fr 1fr}}
        @media(max-width:430px){.estimate-points{grid-template-columns:1fr}}
      `}</style>

      <header className="estimate-hero">
        <span className="estimate-kicker">LAND VIEW / Estimate &amp; Costing</span>
        <h1>Choose Estimate Type</h1>
        <p>
          Detailed and Summary estimates are separate workflows. Choose the level of detail required for the project before starting the calculation.
        </p>
      </header>

      <section className="estimate-grid" aria-label="Estimate types">
        {estimateTypes.map((item) => (
          <article className="estimate-card" key={item.href}>
            <div className="estimate-card-top" />
            <div className="estimate-card-body">
              <small>{item.eyebrow}</small>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <ul className="estimate-points">
                {item.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <Link className="estimate-open" href={item.href}>
                <span>{item.action}</span><span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
        ))}
      </section>

      <div className="estimate-note">
        <b>Detailed Estimate</b> is intended for quantity take-off and BOQ-level costing. <b>Summary Estimate</b> is intended for quick preliminary budgeting and feasibility checks.
      </div>
    </div>
  );
}
