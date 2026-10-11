"use client";

import { useMemo, useState } from "react";
import "./project-control.css";

type ModuleKey =
  | "command"
  | "portfolio"
  | "planning"
  | "site"
  | "finance"
  | "procurement"
  | "contracts"
  | "documents"
  | "reports"
  | "activity";

const NAV: Array<{ key: ModuleKey; label: string; short: string }> = [
  { key: "command", label: "Command Center", short: "01" },
  { key: "portfolio", label: "Portfolio", short: "02" },
  { key: "planning", label: "Planning", short: "03" },
  { key: "site", label: "Site Control", short: "04" },
  { key: "finance", label: "Finance", short: "05" },
  { key: "procurement", label: "Procurement", short: "06" },
  { key: "contracts", label: "Contracts", short: "07" },
  { key: "documents", label: "Documents", short: "08" },
  { key: "reports", label: "Reports", short: "09" },
  { key: "activity", label: "Activity", short: "10" },
];

const PROJECTS = [
  { code: "LV-157", title: "Construction Workspace", stage: "Construction", progress: 68, status: "On track" },
  { code: "LV-176", title: "Site & Design Workspace", stage: "Design", progress: 34, status: "Review" },
  { code: "LV-247", title: "Approval Workspace", stage: "Approval", progress: 51, status: "Waiting" },
];

const WORK_PACKAGES = [
  ["RCC Structure", "100%", "Complete"],
  ["Brick Masonry", "82%", "In progress"],
  ["Electrical", "57%", "In progress"],
  ["Plumbing", "63%", "In progress"],
  ["Floor & Wall Finish", "36%", "Upcoming"],
];

const DEMO_ACTIVITY = [
  ["SITE", "Site visit logged", "GPS verified · issue note attached"],
  ["CONTRACT", "Certified work updated", "Contractor measurement prepared for review"],
  ["DOCUMENT", "Drawing revision received", "Electrical drawing · Rev 03"],
  ["PLANNING", "Milestone status changed", "Finishing package moved to in progress"],
];

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "gold" }) {
  return <span className={`pc-badge pc-badge-${tone}`}>{children}</span>;
}

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="pc-section-head">
      <div>
        <div className="pc-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function MetricCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "gold" | "good" | "warn" }) {
  return (
    <article className={`pc-metric ${tone ? `pc-metric-${tone}` : ""}`}>
      <div className="pc-metric-label">{label}</div>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}

function CommandCenter() {
  return (
    <div className="pc-stack-lg">
      <section className="pc-command-hero">
        <div className="pc-command-copy">
          <div className="pc-eyebrow">PROJECT STATUS</div>
          <h2>Construction Control</h2>
          <p>One view for schedule, site, commercial control, documents and project risk.</p>
          <div className="pc-chip-row">
            <Badge tone="good">ON TRACK</Badge>
            <Badge>CONSTRUCTION</Badge>
            <Badge tone="gold">PROTOTYPE DATA</Badge>
          </div>
        </div>
        <div className="pc-progress-orb" aria-label="Prototype project progress 68 percent">
          <div><strong>68%</strong><span>Overall progress</span></div>
        </div>
      </section>

      <section className="pc-metrics-grid">
        <MetricCard label="Project Progress" value="68%" hint="Prototype construction status" tone="good" />
        <MetricCard label="Open Issues" value="04" hint="2 high priority items" tone="warn" />
        <MetricCard label="Pending Reviews" value="02" hint="Commercial + technical" />
        <MetricCard label="Next Milestone" value="MEP" hint="Inspection & coordination" tone="gold" />
      </section>

      <section className="pc-two-col">
        <article className="pc-panel">
          <SectionHead eyebrow="WORKFLOW" title="Project timeline" />
          <div className="pc-timeline">
            {[
              ["Design", "complete"], ["Approval", "complete"], ["Structure", "complete"], ["Masonry", "active"], ["MEP", "active"], ["Finishing", "next"], ["Handover", "next"],
            ].map(([label, state]) => (
              <div className={`pc-timeline-step pc-${state}`} key={label}>
                <i />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="pc-panel">
          <SectionHead eyebrow="ATTENTION" title="Requires action" action={<button className="pc-text-button">View all</button>} />
          <div className="pc-alert-list">
            <div><span className="pc-alert-dot pc-alert-high" /><strong>Plumbing inspection pending</strong><small>Technical review</small></div>
            <div><span className="pc-alert-dot pc-alert-mid" /><strong>Certified work awaiting review</strong><small>Commercial control</small></div>
            <div><span className="pc-alert-dot" /><strong>Drawing revision to acknowledge</strong><small>Document control</small></div>
          </div>
        </article>
      </section>

      <section className="pc-panel">
        <SectionHead eyebrow="LIVE FEED" title="Recent project activity" action={<Badge tone="gold">DEMO</Badge>} />
        <div className="pc-activity-list">
          {DEMO_ACTIVITY.map(([kind, title, sub]) => (
            <div className="pc-activity-row" key={title}>
              <div className="pc-activity-mark">{kind.slice(0, 2)}</div>
              <div><strong>{title}</strong><span>{sub}</span></div>
              <time>Today</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Portfolio() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="ORGANIZATION" title="Project portfolio" action={<button className="pc-primary-button">+ New Project</button>} />
      <div className="pc-filter-row">
        {["All", "Proposal", "Design", "Approval", "Construction", "Completed"].map((f, i) => <button key={f} className={i === 0 ? "active" : ""}>{f}</button>)}
      </div>
      <div className="pc-project-grid">
        {PROJECTS.map((p) => (
          <article className="pc-project-card" key={p.code}>
            <div className="pc-project-card-top"><span>{p.code}</span><Badge tone={p.status === "On track" ? "good" : "warn"}>{p.status}</Badge></div>
            <h3>{p.title}</h3>
            <p>{p.stage} stage</p>
            <div className="pc-project-progress"><span style={{ width: `${p.progress}%` }} /></div>
            <div className="pc-project-foot"><strong>{p.progress}%</strong><span>Overall progress</span></div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Planning() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="PLANNING & DELIVERY" title="Work packages" action={<button className="pc-primary-button">+ Work Package</button>} />
      <div className="pc-panel pc-table-panel">
        <div className="pc-table pc-work-table">
          <div className="pc-tr pc-th"><span>Work package</span><span>Progress</span><span>Status</span><span>Owner</span></div>
          {WORK_PACKAGES.map(([name, progress, status], i) => (
            <div className="pc-tr" key={name}>
              <span><strong>{name}</strong><small>WP-{String(i + 1).padStart(2, "0")}</small></span>
              <span><strong>{progress}</strong></span>
              <span><Badge tone={status === "Complete" ? "good" : status === "Upcoming" ? "neutral" : "gold"}>{status}</Badge></span>
              <span>Project Team</span>
            </div>
          ))}
        </div>
      </div>
      <section className="pc-three-col">
        <MetricCard label="Milestones" value="07" hint="3 completed · 2 active" />
        <MetricCard label="Tasks Due" value="06" hint="Within the next 7 days" tone="warn" />
        <MetricCard label="Schedule Health" value="92%" hint="Prototype planning score" tone="good" />
      </section>
    </div>
  );
}

function SiteControl() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="FIELD OPERATIONS" title="Site control" action={<button className="pc-primary-button">+ New Site Visit</button>} />
      <section className="pc-metrics-grid">
        <MetricCard label="Site Visits" value="128" hint="Prototype count" />
        <MetricCard label="Open Site Issues" value="04" hint="2 require follow-up" tone="warn" />
        <MetricCard label="GPS Verified" value="100%" hint="Location control enabled" tone="good" />
        <MetricCard label="Last Visit" value="Today" hint="Field team activity" tone="gold" />
      </section>
      <section className="pc-two-col">
        <article className="pc-panel">
          <SectionHead eyebrow="LATEST VISIT" title="SV-0128" action={<Badge tone="good">GPS VERIFIED</Badge>} />
          <div className="pc-detail-grid">
            <div><small>WORK OBSERVED</small><strong>Brick masonry</strong></div>
            <div><small>VISITED BY</small><strong>Site Team</strong></div>
            <div><small>ISSUE</small><strong>Alignment check</strong></div>
            <div><small>STATUS</small><strong>Open</strong></div>
          </div>
          <div className="pc-note">Instruction: verify alignment before the next finishing activity begins.</div>
        </article>
        <article className="pc-panel">
          <SectionHead eyebrow="SITE ISSUES" title="Issue register" />
          <div className="pc-issue-list">
            <div><b>01</b><span><strong>Plumbing sleeve coordination</strong><small>Open · High priority</small></span></div>
            <div><b>02</b><span><strong>Wall alignment verification</strong><small>Open · Medium priority</small></span></div>
            <div><b>03</b><span><strong>Material delivery check</strong><small>Resolved</small></span></div>
          </div>
        </article>
      </section>
    </div>
  );
}

function Finance() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="COMMERCIAL CONTROL" title="Project finance" action={<button className="pc-primary-button">+ Transaction</button>} />
      <div className="pc-protected-banner"><span>FINANCE DATA</span><strong>Not connected in this redesign shell</strong><p>Financial data will be connected only after the new transaction rules and permissions are approved.</p></div>
      <section className="pc-metrics-grid">
        {[
          ["Project Funding", "—", "Awaiting connection"], ["Available Cash", "—", "Awaiting connection"], ["Total Expense", "—", "Awaiting connection"], ["Committed Cost", "—", "Awaiting connection"],
        ].map(([label, value, hint]) => <MetricCard key={label} label={label} value={value} hint={hint} />)}
      </section>
      <article className="pc-panel pc-table-panel">
        <SectionHead eyebrow="LEDGER" title="Unified transaction register" action={<Badge>STRUCTURE PREVIEW</Badge>} />
        <div className="pc-table pc-ledger-table">
          <div className="pc-tr pc-th"><span>SL</span><span>Date</span><span>Type</span><span>Party</span><span>Details</span><span>In</span><span>Out</span><span>Balance</span></div>
          {[1,2,3].map((row) => <div className="pc-tr pc-skeleton-row" key={row}><span>{String(row).padStart(3,"0")}</span><span>—</span><span>—</span><span>—</span><span>Data connection pending</span><span>—</span><span>—</span><span>—</span></div>)}
        </div>
      </article>
    </div>
  );
}

function Procurement() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="MATERIAL CONTROL" title="Procurement" action={<button className="pc-primary-button">+ Delivery</button>} />
      <section className="pc-four-col">
        {["Suppliers", "Purchase Orders", "Material Deliveries", "Returns"].map((label, i) => <MetricCard key={label} label={label} value={["08", "05", "24", "02"][i]} hint="Prototype workflow" />)}
      </section>
      <section className="pc-two-col">
        <article className="pc-panel"><SectionHead eyebrow="SUPPLIER ACCOUNTS" title="Commercial position" /><div className="pc-account-list"><div><strong>Brick Supplier</strong><span>Payments · deliveries · account position</span><Badge>READY FOR MAPPING</Badge></div><div><strong>Cement Supplier</strong><span>Orders · deliveries · payments</span><Badge>READY FOR MAPPING</Badge></div><div><strong>Steel Supplier</strong><span>Orders · weights · payments</span><Badge>READY FOR MAPPING</Badge></div></div></article>
        <article className="pc-panel"><SectionHead eyebrow="MATERIAL FLOW" title="Delivery controls" /><div className="pc-feature-list"><span>Purchase order reference</span><span>Quantity & unit</span><span>Accepted material value</span><span>Delivery photo / challan</span><span>Return & adjustment tracking</span></div></article>
      </section>
    </div>
  );
}

function Contracts() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="CONTRACTOR CONTROL" title="Contracts & certified work" action={<button className="pc-primary-button">+ Contract</button>} />
      <div className="pc-project-grid">
        {["Masonry Contractor", "Electrical Contractor", "Plumbing Contractor"].map((name, i) => (
          <article className="pc-project-card" key={name}>
            <div className="pc-project-card-top"><span>CTR-{String(i + 1).padStart(2,"0")}</span><Badge tone="good">ACTIVE</Badge></div>
            <h3>{name}</h3><p>Contract · measurements · bills · payments</p>
            <div className="pc-progress-label"><span>Physical progress</span><strong>{[82,57,63][i]}%</strong></div>
            <div className="pc-project-progress"><span style={{ width: `${[82,57,63][i]}%` }} /></div>
          </article>
        ))}
      </div>
      <article className="pc-panel"><SectionHead eyebrow="COMMERCIAL LOGIC" title="One contractor account" /><div className="pc-flow-row"><span>Contract</span><i>→</i><span>Measurement</span><i>→</i><span>Certified Work</span><i>→</i><span>Payment</span><i>→</i><span>Advance / Payable</span></div></article>
    </div>
  );
}

function Documents() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="DOCUMENT CONTROL" title="Project library" action={<button className="pc-primary-button">+ Upload</button>} />
      <div className="pc-folder-grid">
        {["Architectural", "Structural", "Electrical", "Plumbing", "Approval", "Site", "Contracts", "Bills", "Reports", "Photos", "Correspondence"].map((folder, i) => <article key={folder}><div className="pc-folder-icon">{String(i + 1).padStart(2,"0")}</div><strong>{folder}</strong><span>Project folder</span></article>)}
      </div>
    </div>
  );
}

function Reports() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="REPORT CENTER" title="Generate project reports" />
      <div className="pc-report-grid">
        {["Project Summary", "Monthly Project Report", "Financial Statement", "Supplier Statement", "Contractor Statement", "Construction Progress", "Site Visit Report", "Expense Report", "Material Report"].map((name, i) => <article key={name}><span>R-{String(i + 1).padStart(2,"0")}</span><strong>{name}</strong><small>PDF · Print · JPG</small><button>Configure</button></article>)}
      </div>
    </div>
  );
}

function Activity() {
  return (
    <div className="pc-stack-lg">
      <SectionHead eyebrow="ACCOUNTABILITY" title="Activity & audit" action={<Badge tone="gold">IMMUTABLE HISTORY</Badge>} />
      <article className="pc-panel">
        <div className="pc-audit-list">
          {[
            ["17:35", "Finance", "Transaction record created", "Old and new values will be retained after finance connection."],
            ["16:12", "Site", "Site visit submitted", "Location, employee and media references are tracked."],
            ["15:40", "Planning", "Work package progress updated", "Progress changes are written to the project history."],
            ["14:05", "Documents", "Drawing revision uploaded", "Revision metadata and uploader remain visible."],
          ].map(([time, kind, title, desc]) => <div className="pc-audit-row" key={time}><time>{time}</time><Badge>{kind}</Badge><div><strong>{title}</strong><span>{desc}</span></div></div>)}
        </div>
      </article>
    </div>
  );
}

const MODULES: Record<ModuleKey, () => React.ReactNode> = {
  command: CommandCenter,
  portfolio: Portfolio,
  planning: Planning,
  site: SiteControl,
  finance: Finance,
  procurement: Procurement,
  contracts: Contracts,
  documents: Documents,
  reports: Reports,
  activity: Activity,
};

export default function ProjectControlPage() {
  const [active, setActive] = useState<ModuleKey>("command");
  const [projectCode, setProjectCode] = useState("LV-157");
  const [quickOpen, setQuickOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const project = useMemo(() => PROJECTS.find((p) => p.code === projectCode) || PROJECTS[0], [projectCode]);
  const ActiveModule = MODULES[active];

  function navigate(key: ModuleKey) {
    setActive(key);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="pc-root">
      <aside className={`pc-sidebar ${drawerOpen ? "is-open" : ""}`}>
        <div className="pc-brand">
          <div className="pc-brand-mark">LV</div>
          <div><strong>PROJECT CONTROL</strong><span>LAND VIEW</span></div>
        </div>
        <div className="pc-side-label">WORKSPACE</div>
        <nav className="pc-side-nav">
          {NAV.map((item) => <button key={item.key} onClick={() => navigate(item.key)} className={active === item.key ? "active" : ""}><span>{item.short}</span><strong>{item.label}</strong></button>)}
        </nav>
        <div className="pc-side-footer"><span>PLAN · BUILD · CONTROL</span><small>Project operating system</small></div>
      </aside>
      {drawerOpen ? <button className="pc-drawer-backdrop" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} /> : null}

      <main className="pc-main">
        <header className="pc-topbar">
          <div className="pc-topbar-left">
            <button className="pc-menu-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">☰</button>
            <div><span>LAND VIEW / PROJECT CONTROL</span><strong>{NAV.find((item) => item.key === active)?.label}</strong></div>
          </div>
          <div className="pc-topbar-actions">
            <label className="pc-project-select"><small>PROJECT</small><select value={projectCode} onChange={(e) => setProjectCode(e.target.value)}>{PROJECTS.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.title}</option>)}</select></label>
            <a className="pc-site-link" href="/">Main website</a>
          </div>
        </header>

        <section className="pc-project-bar">
          <div><div className="pc-eyebrow">ACTIVE PROJECT</div><h1>{project.code}</h1><p>{project.title}</p></div>
          <div className="pc-project-bar-meta"><div><small>STAGE</small><strong>{project.stage}</strong></div><div><small>PROGRESS</small><strong>{project.progress}%</strong></div><Badge tone={project.status === "On track" ? "good" : "warn"}>{project.status}</Badge></div>
        </section>

        <div className="pc-content"><ActiveModule /></div>
      </main>

      <nav className="pc-mobile-nav" aria-label="Mobile project control navigation">
        <button className={active === "command" ? "active" : ""} onClick={() => navigate("command")}><span>01</span>Home</button>
        <button className={active === "site" ? "active" : ""} onClick={() => navigate("site")}><span>04</span>Site</button>
        <button className="pc-mobile-plus" onClick={() => setQuickOpen(true)} aria-label="Quick action">+</button>
        <button className={active === "finance" ? "active" : ""} onClick={() => navigate("finance")}><span>05</span>Finance</button>
        <button onClick={() => setDrawerOpen(true)}><span>•••</span>More</button>
      </nav>

      {quickOpen ? <div className="pc-modal-shell" role="dialog" aria-modal="true" aria-label="Quick actions"><button className="pc-modal-backdrop" onClick={() => setQuickOpen(false)} /><div className="pc-quick-panel"><div className="pc-quick-head"><div><div className="pc-eyebrow">QUICK CREATE</div><h3>New project record</h3></div><button onClick={() => setQuickOpen(false)}>×</button></div><div className="pc-quick-grid">{["Site Visit", "Expense", "Payment", "Site Issue", "Document", "Progress Update"].map((item, i) => <button key={item}><span>{String(i + 1).padStart(2,"0")}</span><strong>{item}</strong><small>Module connection next</small></button>)}</div></div></div> : null}
    </div>
  );
}
