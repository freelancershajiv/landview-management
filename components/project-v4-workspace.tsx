"use client";

import Link from "next/link";
import ProjectClientDocumentRegistry from "@/components/project-client-document-registry";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import "./project-v4-workspace.css";

type Row = Record<string, unknown>;
type Amounts = {
  billed: number;
  paid: number;
  due: number;
  openInvoiceCount: number;
  remainingUnallocated: number;
  writeoffs: number;
};
type Summary = {
  project: Row;
  proposal: Row | null;
  financial: Amounts | null;
  invoices: Row[];
  bills: Row[];
  payments: Row[];
  todos: { count: number | null; open: number | null; overdue: number | null; items: Row[] };
  services: { count: number | null; items: Row[] };
  documents: Row[];
  documentReceipts: Row[];
  projectFiles: Row[];
  designs: Row[];
  approvals: Row[];
  designBooks: Row[];
  siteVisits: { count: number | null; items: Row[] };
  projectLedger: { count: number | null; debit: number | null; credit: number | null };
  activity: Row[];
  alerts: { overdueTodos: number | null; missingDocuments: number | null; invoiceReview: number | null };
  warnings: string[];
  refreshedAt: string;
};
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Project Details" },
  { id: "billing", label: "Bills & Payments" },
  { id: "documents", label: "Client Documents" },
  { id: "todos", label: "To-Do" },
  { id: "workflow", label: "Workflow" },
  { id: "deliverables", label: "Design & Delivery" },
  { id: "visits", label: "Site Visits" },
  { id: "finance", label: "Project Finance" },
  { id: "history", label: "Activity History" },
  { id: "notifications", label: "Notifications" },
] as const;
type Tab = (typeof TABS)[number]["id"];
type Column = { title: string; key: string; format?: "money" | "status" | "date" | "number" };
function val(row: Row, key: string): string {
  const v = row[key];
  return v === undefined || v === null || v === "" ? "—" : String(v);
}
function amount(value: unknown): string {
  if (value == null || value === "") return "Unavailable";
  const n = Number(value);
  return Number.isFinite(n) ? "৳" + n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "Unavailable";
}
function dateOnly(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value).slice(0, 10);
}
function Tag({ children }: { children: string }) {
  const status = children.toLowerCase();
  const tone = /error|rejected|overdue|missing|blocked|unpaid|review|not recorded|awaits payment|pending payment/i.test(status)
    ? "bad"
    : /verified|received|paid|approved|complete|done|delivered|on record|clear/i.test(status)
      ? "good" : /pending|working|progress|draft|not started|partially/i.test(status) ? "warn" : "";
  return <span className={"lv4-chip " + tone}>{children || "—"}</span>;
}
function Table({ items, columns, empty = "No records available." }: { items: Row[]; columns: Column[]; empty?: string }) {
  if (!items.length) return <div className="lv4-empty">{empty}</div>;
  return <div className="lv4-table-wrap"><table className="lv4-table"><thead><tr>
    {columns.map((column) => <th key={column.key} className={column.format === "money" || column.format === "number" ? "lv4-numeric" : ""}>{column.title}</th>)}
  </tr></thead><tbody>
    {items.map((item, index) => <tr key={String(item.id || item.code || item.key || index) + ":" + index}>
      {columns.map((column) => <td key={column.key} className={column.format === "money" || column.format === "number" ? "lv4-numeric" : ""}>
        {column.format === "money" ? amount(item[column.key]) :
          column.format === "status" ? <Tag>{val(item, column.key)}</Tag> :
          column.format === "date" ? dateOnly(item[column.key]) : <span>{val(item, column.key)}</span>}
      </td>)}
    </tr>)}
  </tbody></table></div>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="lv4-stat"><div className="lv4-stat-label">{label}</div><div className="lv4-stat-value">{value}</div><div className="lv4-stat-detail">{detail}</div></div>;
}
function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="lv4-panel"><div className="lv4-section-head"><h3>{title}</h3>{action}</div>{children}</section>;
}
function Property({ label, value }: { label: string; value: string }) {
  return <div className="lv4-data-pair"><small>{label}</small><strong>{value || "—"}</strong></div>;
}

export default function ProjectV4Workspace() {
  const params = useParams<{ projectId: string }>();
  const projectCode = decodeURIComponent(String(params?.projectId || "")).toUpperCase();
  const base = "/admin/projects/" + encodeURIComponent(projectCode);
  const [data, setData] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectCode) return;
    let active = true;
    fetch("/api/admin/projects/v4-summary?projectId=" + encodeURIComponent(projectCode), {
      credentials: "same-origin", cache: "no-store",
    }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(String(body?.error || "Unable to load project."));
      return body.data as Summary;
    }).then((value) => {
      if (active) { setData(value); setError(""); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load project.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectCode, refresh]);

  const filteredTodos = useMemo(() => (data?.todos.items || []).filter((row) => {
    const s = search.trim().toLowerCase();
    return !s || [row.title, row.code, row.status, row.assignee].some((value) => String(value || "").toLowerCase().includes(s));
  }), [data, search]);
  const onRecord = (data?.documents || []).filter((row) => Number(row.onHandCount || 0) > 0).length;
  const alerts = data?.alerts;

  const counts: Partial<Record<Tab, string>> = {
    todos: data?.todos.open == null ? "" : String(data.todos.open),
    workflow: data?.services.count == null ? "" : String(data.services.count),
    documents: data ? String(onRecord) + "/5" : "",
    visits: data?.siteVisits.count == null ? "" : String(data.siteVisits.count),
    billing: data?.financial ? String(data.financial.openInvoiceCount) : "",
  };
  const linkText = (href: string, label: string) => <Link className="lv4-link" href={href}>{label}</Link>;
  const update = () => { setLoading(true); setRefresh((value) => value + 1); };

  return <div className="lv4-shell">
    <header className="lv4-hero">
      <div>
        <div className="lv4-kicker">LAND VIEW / Project Workspace 4.0 / Development preview</div>
        <h1 className="lv4-title">{data ? val(data.project, "code") + " — " + val(data.project, "name") : projectCode}</h1>
        <div className="lv4-subtitle">{data ? [val(data.project, "owner"), val(data.project, "location")].filter((x) => x !== "—").join(" · ") : "Unified project management"}</div>
      </div>
      <div className="lv4-hero-actions">
        {data && <Tag>{val(data.project, "phase")}</Tag>}
        <button className="lv4-button" type="button" disabled={loading} onClick={update}>{loading ? "Loading…" : "Refresh"}</button>
        {linkText(base, "Current Project")}
        {linkText(base + "/lifecycle", "Lifecycle")}
      </div>
    </header>

    {error && <section className="lv4-panel" role="alert"><h3>Project data could not be loaded</h3><p className="lv4-muted">{error}</p><button className="lv4-button" type="button" onClick={update}>Try again</button></section>}
    {loading && !data && <section className="lv4-panel"><p className="lv4-muted">Loading the project from existing LAND VIEW records…</p></section>}
    {data && <>
      <section className="lv4-stats" aria-label="Project snapshot">
        <Metric label="Total billed" value={data.financial ? amount(data.financial.billed) : "Unavailable"} detail="Current receivable authority"/>
        <Metric label="Payments received" value={data.financial ? amount(data.financial.paid) : "Unavailable"} detail="Effective project payments"/>
        <Metric label="Collectible due" value={data.financial ? amount(data.financial.due) : "Unavailable"} detail="May differ from invoice-level due"/>
        <Metric label="Open To-Dos" value={data.todos.open == null ? "Unavailable" : String(data.todos.open)} detail={data.todos.overdue == null ? "Source unavailable" : String(data.todos.overdue) + " overdue"}/>
        <Metric label="Client documents" value={data.documents.some((d) => d.status === "Unavailable") ? "Unavailable" : String(onRecord) + " / 5"} detail="Documents currently available on record"/>
      </section>

      {data.warnings.length > 0 && <div className="lv4-banners" role="status">{data.warnings.map((warning, index) => <div key={index} className="lv4-warning">{warning}</div>)}</div>}

      <div className="lv4-tabs-mobile" role="tablist" aria-label="Project sections">
        {TABS.map((item) => <button className="lv4-tab-mobile" type="button" role="tab" aria-selected={tab === item.id} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      <div className="lv4-content">
        <nav className="lv4-aside" role="tablist" aria-label="Project sections">
          <div className="lv4-kicker" style={{ padding: "7px 10px" }}>Project navigation</div>
          {TABS.map((item) => <button key={item.id} type="button" role="tab" className="lv4-nav-button" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            <span>{item.label}</span><span className="lv4-nav-number">{counts[item.id] || ""}</span>
          </button>)}
        </nav>
        <main className="lv4-body">
          {tab === "overview" && <>
            <div className="lv4-section-head"><h2>Project Overview</h2><span className="lv4-quiet">Updated {dateOnly(data.refreshedAt)}</span></div>
            <div className="lv4-grid">
              <Panel title="Action Required" action={<button className="lv4-button" type="button" onClick={() => setTab("todos")}>View To-Do</button>}>
                <div className="lv4-alerts">
                  {alerts?.overdueTodos != null && alerts.overdueTodos > 0 && <div className="lv4-alert bad"><div><strong>Overdue tasks</strong><small>Follow up assigned employees</small></div><Tag>{String(alerts.overdueTodos)}</Tag></div>}
                  {alerts?.missingDocuments != null && alerts.missingDocuments > 0 && <div className="lv4-alert warn"><div><strong>Client documents not recorded</strong><small>Check the five-document registry</small></div><Tag>{String(alerts.missingDocuments)}</Tag></div>}
                  {data.financial && data.financial.due > 0.01 && <div className="lv4-alert warn"><div><strong>Outstanding project receivables</strong><small>Review allocations and due payments</small></div><strong>{amount(data.financial.due)}</strong></div>}
                  {alerts?.invoiceReview != null && alerts.invoiceReview > 0 && <div className="lv4-alert bad"><div><strong>Historical invoice allocation review</strong><small>Not automatically treated as new debt</small></div><Tag>{String(alerts.invoiceReview)}</Tag></div>}
                  {alerts?.overdueTodos === 0 && alerts.missingDocuments === 0 && data.financial?.due === 0 && !alerts.invoiceReview && <div className="lv4-alert good"><strong>No current alert conditions detected</strong></div>}
                  <p className="lv4-muted">This panel reflects existing records only; it does not issue invoices or move workflow stages.</p>
                </div>
              </Panel>
              <Panel title="Progress Snapshot" action={<button className="lv4-button" type="button" onClick={() => setTab("workflow")}>View Workflow</button>}>
                <div className="lv4-data-grid">
                  <Property label="Design stage" value={val(data.project, "designStage")}/>
                  <Property label="Approval stage" value={val(data.project, "approvalStage")}/>
                  <Property label="Supervision stage" value={val(data.project, "supervisionStage")}/>
                  <Property label="Service workflows" value={data.services.count == null ? "Unavailable" : String(data.services.count)}/>
                  <Property label="Site visits" value={data.siteVisits.count == null ? "Unavailable" : String(data.siteVisits.count)}/>
                  <Property label="Linked proposal" value={val(data.proposal || data.project, data.proposal ? "code" : "proposalCode")}/>
                </div>
              </Panel>
            </div>
            <div className="lv4-grid">
              <Panel title="Pending To-Dos" action={<button className="lv4-button" type="button" onClick={() => setTab("todos")}>All tasks</button>}>
                <Table items={data.todos.items.filter((row) => !["Done", "Completed", "Cancelled"].includes(String(row.status))).slice(0, 7)} columns={[{ title:"Task",key:"title" },{ title:"Due",key:"dueDate",format:"date" },{ title:"Status",key:"status",format:"status" }]} empty="No open tasks recorded."/>
              </Panel>
              <Panel title="Five Required Client Documents" action={<button className="lv4-button" type="button" onClick={() => setTab("documents")}>Document Registry</button>}>
                <div className="lv4-doc-list">{data.documents.map((doc) => <div key={val(doc,"key")} className="lv4-doc-item"><div><strong>{val(doc,"name")}</strong><small>{Number(doc.receiptCount || 0)} recorded receipt(s)</small></div><Tag>{val(doc,"status")}</Tag></div>)}</div>
              </Panel>
            </div>
          </>}

          {tab === "details" && <>
            <div className="lv4-section-head"><h2>Project Details & Location</h2>{linkText(base, "Edit in current project")}</div>
            <Panel title="Project identity and land information"><div className="lv4-data-grid">
              {[
                ["Project ID","code"],["Project name","name"],["Client / owner","owner"],["Contact phone","phone"],
                ["Project category","category"],["Number of floors","floors"],["Plot area","plotArea"],["Start date","startDate"],
                ["Project location","location"],["District","district"],["Upazila / Thana","upazila"],["Municipality / local body","localBody"],
                ["Ward","ward"],["Mouza","mouza"],["JL Number","jl"],["Dag Number","dag"],["Khotian Number","khatian"],
                ["Referred by","referral"],
              ].map(([label,key]) => <Property key={key} label={label} value={val(data.project,key)}/>)}
            </div></Panel>
            <Panel title="Proposal provenance"><p className="lv4-muted">Original proposal records remain the commercial source for converted services. No conversion is performed from this view.</p>
              <div className="lv4-data-grid"><Property label="Proposal" value={data.proposal ? val(data.proposal,"code") : val(data.project,"proposalCode")}/><Property label="Proposal status" value={data.proposal ? val(data.proposal,"status") : "Not linked"}/></div>
            </Panel>
          </>}

          {tab === "billing" && <>
            <div className="lv4-section-head"><h2>Bills & Payments</h2>{linkText("/admin/finance/payment-lifecycle", "Open Payment Lifecycle")}</div>
            <div className="lv4-grid">
              <Panel title="Billing integrity">
                <div className="lv4-data-grid">
                  <Property label="Invoice records" value={String(data.invoices.length)}/>
                  <Property label="Bill records" value={String(data.bills.length)}/>
                  <Property label="Open invoices" value={data.financial ? String(data.financial.openInvoiceCount) : "Unavailable"}/>
                  <Property label="Historical review" value={data.financial ? String(data.alerts.invoiceReview ?? "Unavailable") : "Unavailable"}/>
                  <Property label="Unallocated payments (remaining)" value={data.financial ? amount(data.financial.remainingUnallocated) : "Unavailable"}/>
                  <Property label="Approved write-offs" value={data.financial ? amount(data.financial.writeoffs) : "Unavailable"}/>
                </div>
                <p className="lv4-muted">Project collectible due can differ from an individual invoice balance due to advances and approved adjustments.</p>
              </Panel>
              <Panel title="Quick access"><div className="lv4-alerts">
                {linkText("/admin/finance/bills","Bills & Invoice Center")}
                {linkText("/admin/finance/payment-lifecycle","Payments & Allocations")}
                {linkText("/admin/finance/integrity","Invoice Integrity Review")}
              </div></Panel>
            </div>
            <Panel title="Project bills"><Table items={data.bills} columns={[{title:"Bill",key:"code"},{title:"Service",key:"description"},{title:"Status",key:"status",format:"status"},{title:"Net",key:"net",format:"money"},{title:"Allocated",key:"allocated",format:"money"}]}/></Panel>
            <Panel title="Invoice allocations"><Table items={data.invoices} columns={[{title:"Invoice",key:"code"},{title:"Bill",key:"billCode"},{title:"Status",key:"status",format:"status"},{title:"Invoice amount",key:"amount",format:"money"},{title:"Allocated",key:"allocated",format:"money"},{title:"Historical review",key:"historicalReview"}]}/></Panel>
            <Panel title="Received payments"><Table items={data.payments} columns={[{title:"Payment",key:"code"},{title:"Date",key:"date",format:"date"},{title:"Method",key:"method"},{title:"Amount",key:"amount",format:"money"},{title:"Allocated",key:"allocated",format:"money"},{title:"Unallocated",key:"unallocated",format:"money"}]}/></Panel>
          </>}

          {tab === "documents" && <>
            <ProjectClientDocumentRegistry projectCode={projectCode} onChanged={update}/>
            <Panel title="Other project design and delivered files">
              <Table items={data.projectFiles} columns={[
                { title:"Document",key:"title" },{ title:"Type",key:"type" },
                { title:"Revision",key:"revision" },{ title:"Status",key:"status",format:"status" },
                { title:"Date",key:"date",format:"date" },
              ]} empty="No design or other project file records yet."/>
              <p className="lv4-muted">Client-provided documents stay in the client registry above; design deliverables remain in the existing Document Register.</p>
            </Panel>
          </>}

          {tab === "todos" && <>
            <div className="lv4-section-head"><h2>Project To-Do</h2>{linkText("/admin/todo","Open To-Do Workspace")}</div>
            <Panel title="Service and team tasks">
              <div className="lv4-split" style={{ marginBottom:12 }}>
                <p className="lv4-muted">All existing tasks for this project, including automated bill tasks and manually assigned work.</p>
                <input className="lv4-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, assignee or status" aria-label="Search project tasks"/>
              </div>
              <Table items={filteredTodos} columns={[{title:"Task ID",key:"code"},{title:"Task",key:"title"},{title:"Assigned to",key:"assignee"},{title:"Priority",key:"priority"},{title:"Due",key:"dueDate",format:"date"},{title:"Status",key:"status",format:"status"}]}/>
            </Panel>
          </>}

          {tab === "workflow" && <>
            <div className="lv4-section-head"><h2>Project Workflow</h2>{linkText(base + "/lifecycle","Open Existing Lifecycle")}</div>
            <Panel title="Work and payment dependencies">
              <p className="lv4-muted">Engineering work may start after its bill is issued, but final release requires payment and review. Other services appear in To-Do at billing and generally await payment to begin action. The indicators below are advisory; existing backend gate enforcement remains authoritative.</p>
              <Table items={data.services.items} columns={[{title:"Service",key:"name"},{title:"Type",key:"type"},{title:"Recorded stage",key:"status",format:"status"},{title:"Service due",key:"due",format:"money"},{title:"Indicative payment gate",key:"paymentPolicy"}]}/>
            </Panel>
            <Panel title="Overall stages"><div className="lv4-data-grid">
              <Property label="Design" value={val(data.project, "designStage")}/>
              <Property label="Approval" value={val(data.project, "approvalStage")}/>
              <Property label="Supervision / Construction" value={val(data.project, "supervisionStage")}/>
              <Property label="Project lifecycle" value={val(data.project, "phase")}/>
            </div></Panel>
          </>}

          {tab === "deliverables" && <>
            <div className="lv4-section-head"><h2>Design, Approvals & Deliverables</h2>{linkText(base + "/lifecycle","Open Design Lifecycle")}</div>
            <Panel title="Design submissions"><Table items={data.designs} columns={[{title:"Drawing",key:"title"},{title:"Discipline",key:"discipline"},{title:"Revision",key:"revision"},{title:"Status",key:"status",format:"status"},{title:"Date",key:"date",format:"date"}]}/></Panel>
            <Panel title="Authority approvals"><Table items={data.approvals} columns={[{title:"Approval type",key:"type"},{title:"Authority",key:"authority"},{title:"Status",key:"status",format:"status"},{title:"Date",key:"date",format:"date"}]}/></Panel>
            <Panel title="Design Book Register"><Table items={data.designBooks} columns={[{title:"Book ID",key:"id"},{title:"Book Type",key:"type"},{title:"Revision",key:"revision"},{title:"Delivery",key:"status",format:"status"}]}/></Panel>
          </>}

          {tab === "visits" && <>
            <div className="lv4-section-head"><h2>Site Visits</h2>{linkText(base,"Open Existing Site Visits")}</div>
            <Panel title="Site visit history"><Table items={data.siteVisits.items} columns={[{title:"Visit",key:"code"},{title:"Date",key:"date",format:"date"},{title:"Purpose",key:"purpose"},{title:"Status",key:"status",format:"status"},{title:"Observations",key:"notes"}]} empty="No site visits recorded for this project." /></Panel>
          </>}

          {tab === "finance" && <>
            <div className="lv4-section-head"><h2>Project Finance</h2>{linkText("/projectmanagement","Open Project Management")}</div>
            <div className="lv4-grid">
              <Panel title="Project Management ledger"><div className="lv4-data-grid">
                <Property label="Project Management entries" value={data.projectLedger.count == null ? "Unavailable" : String(data.projectLedger.count)}/>
                <Property label="Debit entries total" value={amount(data.projectLedger.debit)}/>
                <Property label="Credit entries total" value={amount(data.projectLedger.credit)}/>
              </div><p className="lv4-muted">Project Management ledger totals are separate from client billing and receivable balances.</p></Panel>
              <Panel title="Client billing summary"><div className="lv4-data-grid">
                <Property label="Billed" value={data.financial ? amount(data.financial.billed) : "Unavailable"}/>
                <Property label="Effective payment" value={data.financial ? amount(data.financial.paid) : "Unavailable"}/>
                <Property label="Collectible due" value={data.financial ? amount(data.financial.due) : "Unavailable"}/>
              </div></Panel>
            </div>
            <Panel title="Finance modules"><div className="lv4-hero-actions">{linkText("/admin/finance","Office Finance")}{linkText("/projectmanagement","Project Management")}{linkText("/admin/finance/integrity","Billing Integrity")}</div></Panel>
          </>}

          {tab === "history" && <>
            <div className="lv4-section-head"><h2>Project Activity</h2><span className="lv4-quiet">Most recent 60 events from operational records</span></div>
            <Panel title="Timeline"><Table items={data.activity} columns={[{title:"Date",key:"at",format:"date"},{title:"Module",key:"kind"},{title:"Action",key:"title"},{title:"Status",key:"status",format:"status"}]} empty="No recent activity available."/><p className="lv4-muted">This combined timeline supplements, but does not replace, the append-only business audit trail.</p></Panel>
          </>}

          {tab === "notifications" && <>
            <div className="lv4-section-head"><h2>Client Notifications</h2></div>
            <Panel title="Notification integration pending">
              <p className="lv4-muted">The project-wide notification panel is reserved for WhatsApp, client-facing progress messages, payment reminders and outbox delivery history. Sending is intentionally disabled in this development preview. A queued message must never be presented as delivered.</p>
              <div className="lv4-alert warn"><div><strong>No messages are sent from this page</strong><small>Existing WhatsApp automation and its separate delivery logs remain unchanged.</small></div></div>
            </Panel>
          </>}

          <div className="lv4-footer">LAND VIEW v4.0 development preview · Existing records are read-only · Financial exceptions are never auto-corrected · No notifications are sent</div>
        </main>
      </div>
    </>}
  </div>;
}
