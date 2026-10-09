"use client";

import Link from "next/link";

type Props = {
  mode: "management" | "employee";
};

export default function NewSiteDashboardCard({ mode }: Props) {
  const management = mode === "management";
  const title = management ? "New Site Entry" : "Enter a New Site";
  const description = management
    ? "Register a newly visited site with client details, land information and GPS. Management/Admin entries become Draft proposals immediately; employee entries appear here for approval."
    : "Visited a new client site? Record the owner, project details, land information and GPS now. Your entry will go to Management/Admin for approval and then become a proposal.";

  const action = management
    ? <Link className="nsdc-button" href="/admin/new-site">⌖ Enter / Review Sites</Link>
    : <a className="nsdc-button" href="#new-site">⌖ Enter New Site</a>;

  return <section className={`nsdc-card ${management ? "management" : "employee"}`} aria-label="New site entry">
    <style>{`
      .nsdc-card{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:center;margin:0 0 16px;padding:18px 20px;border:1px solid rgba(214,31,38,.48);border-radius:16px;overflow:hidden;background:linear-gradient(135deg,rgba(214,31,38,.19),rgba(22,28,34,.96) 42%,rgba(12,17,22,.98));box-shadow:0 14px 32px rgba(0,0,0,.16);color:var(--theme-ink-_eef2f5,#eef2f5)}
      .nsdc-card:after{content:"SITE";position:absolute;right:18px;bottom:-14px;font-size:76px;line-height:1;font-weight:950;letter-spacing:-.08em;color:rgba(255,255,255,.035);pointer-events:none}
      .nsdc-icon{position:relative;z-index:1;width:58px;height:58px;display:grid;place-items:center;border-radius:16px;background:#d61f26;color:#fff;font-size:27px;font-weight:900;box-shadow:0 10px 24px rgba(214,31,38,.24)}
      .nsdc-copy{position:relative;z-index:1;min-width:0}.nsdc-kicker{display:block;margin-bottom:4px;color:#ff777c;font-size:8px;font-weight:950;letter-spacing:.16em;text-transform:uppercase}.nsdc-copy h2{margin:0;color:#fff;font-size:21px;letter-spacing:-.025em}.nsdc-copy p{margin:6px 0 0;max-width:900px;color:var(--theme-ink-_9ba7b0,#9ba7b0);font-size:10px;line-height:1.55}.nsdc-flow{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px}.nsdc-flow span{padding:5px 8px;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.035);color:#c8d0d6;font-size:8px;font-weight:850}.nsdc-flow b{color:#ff6d73;font-size:9px}
      .nsdc-actions{position:relative;z-index:2;display:grid;gap:7px;justify-items:end}.nsdc-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid #e23a40;border-radius:10px;background:#d61f26;color:#fff!important;text-decoration:none;font-size:10px;font-weight:950;white-space:nowrap;box-shadow:0 9px 22px rgba(214,31,38,.18);transition:.16s ease}.nsdc-button:hover{transform:translateY(-1px);background:#e02931}.nsdc-note{max-width:175px;color:#7f8b95;font-size:8px;line-height:1.35;text-align:right}.nsdc-card.employee .nsdc-note{color:#d9b86b}
      @media(max-width:760px){.nsdc-card{grid-template-columns:auto minmax(0,1fr);padding:16px;gap:13px}.nsdc-icon{width:48px;height:48px;border-radius:13px;font-size:23px}.nsdc-copy h2{font-size:18px}.nsdc-actions{grid-column:1/-1;width:100%;justify-items:stretch}.nsdc-button{width:100%}.nsdc-note{max-width:none;text-align:left}.nsdc-card:after{font-size:58px}}
      @media(max-width:460px){.nsdc-card{grid-template-columns:1fr}.nsdc-icon{width:44px;height:44px}.nsdc-flow{gap:5px}.nsdc-flow span{font-size:7.5px}}
    `}</style>
    <div className="nsdc-icon" aria-hidden="true">⌖</div>
    <div className="nsdc-copy">
      <span className="nsdc-kicker">LAND VIEW · FIELD INTAKE</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="nsdc-flow" aria-label="Workflow">
        <span>Site Entry</span><b>→</b><span>{management ? "Approval / Draft Proposal" : "Management Approval"}</span><b>→</b><span>Proposal</span><b>→</b><span>Project</span>
      </div>
    </div>
    <div className="nsdc-actions">
      {action}
      <small className="nsdc-note">{management ? "Create new entries or review employee submissions." : "Employee submissions require Management/Admin approval."}</small>
    </div>
  </section>;
}
