"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import EmployeeCommandCenter, { type EmployeeCommandView } from "@/components/employee-command-center";
import EmployeeTaskCenter from "@/components/employee-task-center";
import EmployeeSiteVisitAssignments from "@/components/employee-site-visit-assignments";
import EmployeeProjectStageStrip from "@/components/employee-project-stage-strip";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import EmployeeExpenseCenter from "@/components/employee-expense-center";
import EmployeeCertificateCenter from "@/components/employee-certificate-center";
import EmployeeSiteVisitCenter from "@/components/employee-site-visit-center";
import NewSiteEntryCenter from "@/components/new-site-entry-center";

type TabId = "dashboard" | "visits" | "tasks" | "projects" | "workflow" | "new-site" | "records" | "expenses" | "approvals" | "certificates";
type Tab = { id: TabId; label: string };

const BASE_TABS: Tab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "visits", label: "Site Visits" },
  { id: "tasks", label: "Tasks" },
  { id: "projects", label: "Projects" },
  { id: "workflow", label: "Workflow" },
  { id: "new-site", label: "New Site" },
  { id: "records", label: "Field & Files" },
  { id: "expenses", label: "Expenses" },
  { id: "certificates", label: "Certificates" },
];

function text(value: unknown) { return String(value ?? "").trim(); }
function tabFromHash(hash: string): TabId {
  const value = String(hash || "").replace(/^#/, "").toLowerCase();
  if (value === "tasks" || value === "my-tasks") return "tasks";
  if (value === "projects") return "projects";
  if (value === "new-site" || value === "newsite" || value === "site-entry") return "new-site";
  if (value === "workflow") return "workflow";
  if (value === "visits" || value === "site-visits" || value === "sitevisits") return "visits";
  if (["records", "documents", "attendance"].includes(value)) return "records";
  if (value === "expenses") return "expenses";
  if (value === "approvals") return "approvals";
  if (value === "certificates") return "certificates";
  return "dashboard";
}

export default function EmployeePortalShell() {
  const [active, setActive] = useState<TabId>("dashboard");
  const [isChairman, setIsChairman] = useState(false);

  useEffect(() => {
    const sync = () => setActive(tabFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    void landViewApi.getSession().then((session) => {
      const u: any = session?.user || {};
      const id = text(u.employeeId || u.Employee_ID || u.userId || u.User_ID).toUpperCase();
      const name = text(u.name || u.Name || u.username || u.Username).toLowerCase();
      setIsChairman(id === "EMP-0001" || name.includes("jamal rony") || name.includes("jamal ahmed bhuiyan"));
    }).catch(() => setIsChairman(false));
  }, []);

  useEffect(() => {
    if (active === "approvals" && !isChairman) window.location.hash = "dashboard";
  }, [active, isChairman]);

  const tabs = useMemo(() => {
    const list = [...BASE_TABS];
    if (isChairman) list.splice(list.findIndex((tab) => tab.id === "certificates"), 0, { id: "approvals", label: "Approvals" });
    return list;
  }, [isChairman]);

  const commandView: EmployeeCommandView | null =
    active === "projects" || active === "workflow" || active === "records" ? active : null;

  function go(tab: TabId) {
    setActive(tab);
    const url = `${window.location.pathname}#${tab}`;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return <main className="employee-workspace-root">
    <style>{`
      .portal-employee>.portal-navigation{display:none!important}
      .portal-employee .tmg-admin-main{width:100%!important;max-width:none!important;margin:0!important}
      .portal-employee .tmg-content-wrap{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
      .employee-workspace-root{width:100%;max-width:none;margin:0;padding:0 0 48px;color:var(--lv-text-primary);background:var(--lv-surface-page);min-height:calc(100vh - 82px);font-size:14px}
      .employee-workspace-nav-wrap{position:sticky;top:0;z-index:25;width:100%;border-bottom:1px solid var(--lv-border-default);background:color-mix(in srgb,var(--lv-surface-panel) 96%,transparent);backdrop-filter:blur(14px);box-shadow:var(--lv-shadow-sm)}
      .employee-workspace-nav{display:flex;gap:2px;width:100%;padding:0 28px;overflow-x:auto;scrollbar-width:none;overscroll-behavior-x:contain}
      .employee-workspace-nav::-webkit-scrollbar{display:none}
      .employee-workspace-tab{position:relative;flex:0 0 auto;border:0;background:transparent;color:var(--lv-text-secondary);padding:18px 17px 16px;font-size:14px;font-weight:850;cursor:pointer;white-space:nowrap;transition:background var(--lv-motion-fast),color var(--lv-motion-fast)}
      .employee-workspace-tab:hover{color:var(--lv-text-strong);background:var(--lv-surface-muted)}
      .employee-workspace-tab.active{color:var(--lv-text-strong);background:var(--lv-brand-soft)}
      .employee-workspace-tab.active:after{content:"";position:absolute;left:14px;right:14px;bottom:0;height:3px;border-radius:3px 3px 0 0;background:var(--lv-brand-primary)}
      .employee-workspace-body{width:100%;max-width:none;padding:28px 32px 0;font-size:14px;line-height:1.5}
      .employee-workspace-body>section,.employee-workspace-body>div{width:100%;max-width:none}
      .employee-workspace-body .ec-section{scroll-margin-top:100px}
      .employee-workspace-body table{width:100%}
      .employee-dashboard-stack{display:grid;gap:16px}
      .employee-workspace-body p{font-size:13px!important;line-height:1.55!important}
      .employee-workspace-body small{font-size:11px!important;line-height:1.45!important}
      .employee-workspace-body button,.employee-workspace-body input,.employee-workspace-body select,.employee-workspace-body textarea{font-size:12px!important}
      .employee-workspace-body table th{font-size:11px!important}
      .employee-workspace-body table td{font-size:12px!important}
      .employee-workspace-body .sv-hero small,.employee-workspace-body .sv-step>span,.employee-workspace-body .sv-card-head small,.employee-workspace-body .sv-location-copy small,.employee-workspace-body .sv-upload-box small,.employee-workspace-body .sv-helper,.employee-workspace-body .sv-gps-test,.employee-workspace-body .sv-row small,.employee-workspace-body .sv-empty{font-size:11px!important}
      .employee-workspace-body .sv-card-head strong,.employee-workspace-body .sv-location-copy strong,.employee-workspace-body .sv-upload-box strong,.employee-workspace-body .sv-row strong{font-size:13px!important;line-height:1.4!important}
      .employee-workspace-body .sv-row p{font-size:12px!important}
      .employee-workspace-body .sv-location-btn,.employee-workspace-body .sv-submit,.employee-workspace-body .sv-refresh,.employee-workspace-body .sv-wa-retry{font-size:11px!important}
      .employee-workspace-body .sv-status,.employee-workspace-body .sv-wa{font-size:10px!important}
      @media(max-width:1100px){.employee-workspace-nav{padding:0 18px}.employee-workspace-body{padding:22px 20px 0}.employee-workspace-tab{padding:16px 14px 14px}}
      @media(max-width:700px){.employee-workspace-nav-wrap{top:0}.employee-workspace-nav{padding:0 8px}.employee-workspace-body{padding:13px 10px 0;font-size:14px}.employee-workspace-tab{min-height:48px;padding:14px 12px 13px;font-size:13px}.employee-workspace-root{padding-bottom:28px}.employee-dashboard-stack{gap:12px}.employee-workspace-body p{font-size:12px!important}.employee-workspace-body small{font-size:11px!important}.employee-workspace-body button,.employee-workspace-body input,.employee-workspace-body select,.employee-workspace-body textarea{font-size:12px!important}}
    `}</style>

    <div className="employee-workspace-nav-wrap">
      <nav className="employee-workspace-nav" aria-label="Employee workspace">
        {tabs.map((tab) => <button key={tab.id} type="button" className={`employee-workspace-tab${active === tab.id ? " active" : ""}`} onClick={() => go(tab.id)}>{tab.label}</button>)}
      </nav>
    </div>

    <div className="employee-workspace-body">
      {active === "dashboard" && <div className="employee-dashboard-stack">
        <EmployeeSiteVisitAssignments showRecordButton />
        <EmployeeCommandCenter view="dashboard" />
      </div>}
      {active === "visits" && <EmployeeSiteVisitAssignments />}
      {active === "visits" && <EmployeeProjectStageStrip visitMode />}
      {active === "visits" && <EmployeeSiteVisitCenter />}
      {active === "tasks" && <EmployeeTaskCenter />}
      {commandView && <EmployeeCommandCenter view={commandView} />}
      {active === "new-site" && <NewSiteEntryCenter />}
      {active === "expenses" && <EmployeeExpenseCenter />}
      {active === "approvals" && isChairman && <ChairmanExpenseApproval />}
      {active === "certificates" && <EmployeeCertificateCenter />}
    </div>
  </main>;
}
