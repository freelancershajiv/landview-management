"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type Tab = "overview" | "board" | "calendar" | "workflow" | "collaboration" | "planning" | "management" | "reports";
type View = "checklist" | "files" | "templates" | "rules" | "reminders" | "workload" | "alerts";
type Navigation = { tab: Tab; view: View | "" };
type TabDetail = { id: Tab; label: string; subtitle: string; description: string };
type ViewDetail = { id: View; label: string; description: string };

const TABS: TabDetail[] = [
  { id: "overview", label: "Overview", subtitle: "Dashboard", description: "See deadlines, progress, team outcomes, and bottlenecks in one place." },
  { id: "board", label: "To Do Board", subtitle: "Create & manage", description: "Create, assign, prioritize, edit, and complete individual To Dos." },
  { id: "calendar", label: "Calendar", subtitle: "Day · Week · Month", description: "See deadlines and employee assignments in an interactive day, week, or month calendar." },
  { id: "workflow", label: "Workflow", subtitle: "Linked services", description: "Review linked services and explicitly advance or complete Workflow stages." },
  { id: "collaboration", label: "Collaboration", subtitle: "Checklists & files", description: "Manage task checklists, conversations, attachments, and activity history." },
  { id: "planning", label: "Planning", subtitle: "Templates & automation", description: "Configure templates, recurring work, event automations, and due reminders." },
  { id: "management", label: "Management", subtitle: "People & alerts", description: "Balance team workload, review escalations, and configure notification limits." },
  { id: "reports", label: "Reports & Views", subtitle: "Excel · PDF", description: "Filter, save and export management To Do reports." },
];

const SUBTABS: Record<Tab, ViewDetail[]> = {
  overview: [],
  board: [],
  calendar: [],
  workflow: [],
  collaboration: [
    { id: "checklist", label: "Checklists", description: "Subtasks and step-by-step progress for each To Do." },
    { id: "files", label: "Comments, Files & Activity", description: "Shared discussions, private attachments, and the audit timeline." },
  ],
  planning: [
    { id: "templates", label: "Templates & Recurring", description: "Create reusable task/checklist templates and manage recurring schedules." },
    { id: "rules", label: "Automation Rules", description: "Create To Dos automatically from new project, payment, proposal, site, and document events." },
    { id: "reminders", label: "Due Times & Reminders", description: "Manage exact deadlines and opt-in employee WhatsApp reminders." },
  ],
  reports: [],
  management: [
    { id: "workload", label: "Workload & Escalations", description: "Compare workload scores and manage overdue task escalations." },
    { id: "alerts", label: "Alerts & Limits", description: "Set workload limits and review optional management notifications." },
  ],
};

function LoadingPanel() {
  return <div className="tws-loading" role="status" aria-live="polite">
    <span className="tws-loading-dot" aria-hidden="true" />
    Opening workspace…
  </div>;
}

const Overview = dynamic(() => import("./admin-todo-management-dashboard"), { loading: LoadingPanel });
const Board = dynamic(() => import("./admin-todo-board"), { loading: LoadingPanel });
const Calendar = dynamic(() => import("./admin-todo-calendar"), { loading: LoadingPanel });
const Workflow = dynamic(() => import("./admin-todo-workflow-center"), { loading: LoadingPanel });
const Checklist = dynamic(() => import("./todo-checklist-center"), { loading: LoadingPanel });
const Collaboration = dynamic(() => import("./todo-collaboration-center"), { loading: LoadingPanel });
const Templates = dynamic(() => import("./admin-todo-template-center"), { loading: LoadingPanel });
const Rules = dynamic(() => import("./admin-todo-automation-center"), { loading: LoadingPanel });
const Reminders = dynamic(() => import("./admin-todo-reminder-center"), { loading: LoadingPanel });
const Workload = dynamic(() => import("./admin-todo-workload-center"), { loading: LoadingPanel });
const Alerts = dynamic(() => import("./admin-todo-management-alerts"), { loading: LoadingPanel });
const Reports = dynamic(() => import("./admin-todo-reports"), { loading: LoadingPanel });

function defaultView(tab: Tab): View | "" {
  return SUBTABS[tab][0]?.id || "";
}

function navigationFromHash(): Navigation {
  if (typeof window === "undefined") return { tab: "overview", view: "" };
  const fragment = window.location.hash.replace(/^#/, "");
  if (fragment === "todo" || fragment === "board" || fragment.startsWith("todo=")) {
    return { tab: "board", view: "" };
  }
  const params = new URLSearchParams(fragment);
  const tabParam = params.get("tab") || "overview";
  const tab = TABS.some((item) => item.id === tabParam) ? tabParam as Tab : "overview";
  const viewParam = params.get("view");
  const allowed = SUBTABS[tab];
  const view = allowed.find((item) => item.id === viewParam)?.id || defaultView(tab);
  return { tab, view };
}

function locationHash(tab: Tab, view: View | "") {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (view) params.set("view", view);
  return "#" + params.toString();
}

const CSS = [
  ".tws-page{width:100%;min-width:0;padding:0 0 32px;color:var(--lv-text-primary)}",
  ".tws-page *{box-sizing:border-box}",
  ".tws-head{margin:18px 28px 0;padding:20px 22px;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}",
  ".tws-header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}",
  ".tws-eyebrow{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:900;color:var(--lv-brand-primary)}",
  ".tws-head h1{font-size:clamp(24px,2.4vw,34px);line-height:1.15;letter-spacing:-.035em;margin:7px 0 6px;font-weight:900}",
  ".tws-head p{font-size:12px;color:var(--lv-text-secondary);line-height:1.55;margin:0;max-width:730px}",
  ".tws-primary{display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:38px;padding:8px 14px;white-space:nowrap;cursor:pointer;background:var(--lv-brand-primary);border:1px solid var(--lv-brand-border);border-radius:9px;color:var(--lv-text-inverse);font-size:11px;font-weight:850}",
  ".tws-primary:focus-visible,.tws-tab:focus-visible,.tws-subtab:focus-visible{outline:2px solid var(--lv-brand-primary);outline-offset:3px}",
  ".tws-nav-wrap{margin-top:19px;padding-top:14px;border-top:1px solid var(--lv-border-subtle)}",
  ".tws-nav{display:flex;gap:6px;align-items:stretch;overflow-x:auto;padding:1px 1px 8px;scrollbar-width:thin;scroll-snap-type:x proximity}",
  ".tws-tab{display:flex;flex:1 0 0;min-width:116px;flex-direction:column;align-items:flex-start;text-align:left;gap:5px;border:1px solid transparent;border-radius:11px;padding:12px 13px;background:transparent;color:var(--lv-text-primary);cursor:pointer;scroll-snap-align:start}",
  ".tws-tab:hover{background:var(--lv-surface-muted);border-color:var(--lv-border-subtle)}",
  ".tws-tab[aria-selected=true]{background:var(--lv-surface-muted);border-color:var(--lv-brand-border);box-shadow:inset 0 3px 0 var(--lv-brand-primary)}",
  ".tws-tab b{font-size:12px;font-weight:900;line-height:1.25;white-space:nowrap}",
  ".tws-tab span{font-size:10px;color:var(--lv-text-muted);line-height:1.35;white-space:nowrap}",
  ".tws-view-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:15px 28px 0;padding:0 4px}",
  ".tws-view-head b{font-size:12px;font-weight:900}.tws-view-head span{font-size:11px;color:var(--lv-text-muted);line-height:1.4}",
  ".tws-subnav{display:flex;gap:6px;margin:14px 28px 0;padding:7px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-muted);overflow-x:auto;scrollbar-width:thin}",
  ".tws-subtab{min-height:38px;white-space:nowrap;border:1px solid transparent;padding:7px 14px;border-radius:9px;background:transparent;color:var(--lv-text-secondary);font-size:11px;font-weight:850;cursor:pointer}",
  ".tws-subtab:hover{color:var(--lv-text-primary)}.tws-subtab[aria-selected=true]{background:var(--lv-surface-panel);color:var(--lv-text-primary);border-color:var(--lv-border-subtle);box-shadow:var(--lv-shadow-sm)}",
  ".tws-panel{min-width:0;outline:none}.tws-loading{display:flex;align-items:center;gap:9px;margin:18px 28px;border:1px solid var(--lv-border-subtle);border-radius:11px;background:var(--lv-surface-muted);padding:20px;color:var(--lv-text-secondary);font-size:11px}",
  ".tws-loading-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--lv-brand-primary)}",
  ".tws-footer{margin:18px 28px 0;border-top:1px solid var(--lv-border-subtle);padding:13px 4px;color:var(--lv-text-muted);font-size:10px;line-height:1.45}",
  "@media(max-width:1000px){.tws-tab{flex:0 0 auto;min-width:136px}.tws-header-row{align-items:center}}",
  "@media(max-width:650px){.tws-head{margin:12px 12px 0;padding:16px}.tws-header-row{flex-direction:column;align-items:stretch;gap:12px}.tws-primary{align-self:flex-start}.tws-nav-wrap{margin-top:13px;padding-top:10px}.tws-tab{min-width:129px;padding:10px 12px}.tws-tab b{font-size:11px}.tws-tab span{font-size:9px}.tws-view-head{margin:13px 12px 0;display:block}.tws-view-head span{display:block;margin-top:4px}.tws-subnav{margin:12px 12px 0}.tws-loading{margin:12px}.tws-footer{margin:18px 12px 0}}",
].join("");

export default function AdminTodoWorkspace() {
  const [navigation, setNavigation] = useState<Navigation>({ tab: "overview", view: "" });
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const sync = () => setNavigation(navigationFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  function navigate(tab: Tab, view: View | "" = defaultView(tab)) {
    setNavigation({ tab, view });
    const desired = locationHash(tab, view);
    if (window.location.hash !== desired) window.location.hash = desired;
    window.requestAnimationFrame(() => navRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function newTodo() {
    if (navigation.tab === "board") {
      const desired = locationHash("board", "");
      if (window.location.hash !== desired) window.location.hash = desired;
      window.dispatchEvent(new Event("landview:todo:new"));
    } else {
      navigate("board", "");
    }
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    navigate(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const detail = TABS.find((tab) => tab.id === navigation.tab) || TABS[0];
  const views = SUBTABS[navigation.tab];
  const selectedView = views.find((view) => view.id === navigation.view) || views[0];
  const selectedLabel = selectedView ? selectedView.label : detail.label;

  return <div className="tws-page">
    <style>{CSS}</style>
    <div className="tws-head" ref={navRef}>
      <div className="tws-header-row">
        <div>
          <div className="tws-eyebrow">LAND VIEW · MANAGEMENT WORKSPACE</div>
          <h1>To Do Control Center</h1>
          <p>Manage assignments, Workflow, checklists, schedules, and escalation alerts without leaving the To Do workspace.</p>
        </div>
        <button className="tws-primary" type="button" onClick={newTodo}>+ New To Do</button>
      </div>
      <div className="tws-nav-wrap">
        <div className="tws-nav" role="tablist" aria-label="To Do management sections">
          {TABS.map((tab, index) => <button
            key={tab.id}
            id={"tws-tab-" + tab.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            role="tab"
            aria-selected={navigation.tab === tab.id}
            aria-controls="tws-current-panel"
            tabIndex={navigation.tab === tab.id ? 0 : -1}
            type="button"
            className="tws-tab"
            onClick={() => navigate(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            <b>{tab.label}</b>
            <span>{tab.subtitle}</span>
          </button>)}
        </div>
      </div>
    </div>
    {views.length > 0 ? <div className="tws-subnav" role="tablist" aria-label={detail.label + " tools"}>
      {views.map((view, index) => <button key={view.id}
        id={"tws-view-" + view.id}
        type="button"
        role="tab"
        aria-selected={navigation.view === view.id}
        aria-controls="tws-current-panel"
        className="tws-subtab"
        tabIndex={navigation.view === view.id ? 0 : -1}
        onClick={() => navigate(navigation.tab, view.id)}
        onKeyDown={(event) => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % views.length;
          else if (event.key === "ArrowLeft") next = (index - 1 + views.length) % views.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = views.length - 1;
          else return;
          event.preventDefault();
          navigate(navigation.tab, views[next].id);
          (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
        }}
      >{view.label}</button>)}
    </div> : null}
    <div className="tws-view-head" aria-live="polite">
      <b>{selectedLabel}</b>
      <span>{selectedView?.description || detail.description}</span>
    </div>
    <section
      id="tws-current-panel"
      className="tws-panel"
      role="tabpanel"
      aria-labelledby={selectedView ? "tws-view-" + selectedView.id : "tws-tab-" + navigation.tab}
      tabIndex={0}
    >
      {navigation.tab === "overview" && <Overview />}
      {navigation.tab === "board" && <Board />}
      {navigation.tab === "calendar" && <Calendar />}
      {navigation.tab === "workflow" && <Workflow />}
      {navigation.tab === "collaboration" && navigation.view === "checklist" && <Checklist mode="admin" />}
      {navigation.tab === "collaboration" && navigation.view === "files" && <Collaboration mode="admin" />}
      {navigation.tab === "planning" && navigation.view === "templates" && <Templates />}
      {navigation.tab === "planning" && navigation.view === "rules" && <Rules />}
      {navigation.tab === "planning" && navigation.view === "reminders" && <Reminders />}
      {navigation.tab === "management" && navigation.view === "workload" && <Workload />}
      {navigation.tab === "management" && navigation.view === "alerts" && <Alerts />}
      {navigation.tab === "reports" && <Reports />}
    </section>
    <p className="tws-footer">
      Each section uses the existing LAND VIEW records and management permissions. Task links open the correct item in the To Do Board; Workflow changes remain explicit actions.
    </p>
  </div>;
}
