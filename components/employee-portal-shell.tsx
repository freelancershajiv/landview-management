"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import EmployeeCommandCenter, { type EmployeeCommandView } from "@/components/employee-command-center";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import EmployeeExpenseCenter from "@/components/employee-expense-center";
import EmployeeCertificateCenter from "@/components/employee-certificate-center";

type TabId = "dashboard" | "projects" | "workflow" | "records" | "expenses" | "approvals" | "certificates";

type Tab = { id: TabId; label: string; hint: string };

const BASE_TABS: Tab[] = [
  { id: "dashboard", label: "Dashboard", hint: "Summary" },
  { id: "projects", label: "Projects", hint: "Assigned work" },
  { id: "workflow", label: "Workflow", hint: "Required services" },
  { id: "records", label: "Field & Files", hint: "Visits and records" },
  { id: "expenses", label: "Expenses", hint: "Submit and track" },
  { id: "certificates", label: "Certificates", hint: "Certificate work" },
];

function text(value: unknown) { return String(value ?? "").trim(); }

export default function EmployeePortalShell() {
  const [active, setActive] = useState<TabId>("dashboard");
  const [isChairman, setIsChairman] = useState(false);

  useEffect(() => {
    void landViewApi.getSession().then((session) => {
      const u: any = session?.user || {};
      const id = text(u.employeeId || u.Employee_ID || u.userId || u.User_ID).toUpperCase();
      const name = text(u.name || u.Name || u.username || u.Username).toLowerCase();
      setIsChairman(id === "EMP-0001" || name.includes("jamal rony"));
    }).catch(() => setIsChairman(false));
  }, []);

  const tabs = useMemo(() => {
    const list = [...BASE_TABS];
    if (isChairman) list.splice(5, 0, { id: "approvals", label: "Approvals", hint: "Chairman queue" });
    return list;
  }, [isChairman]);

  const commandView: EmployeeCommandView | null =
    active === "dashboard" || active === "projects" || active === "workflow" || active === "records" ? active : null;

  return <main className="eps-shell">
    <style>{`
      .eps-shell{min-height:100vh;background:#141414;color:#f5f5f5;padding:18px 20px 40px}.eps-nav-wrap{position:sticky;top:0;z-index:30;margin:-18px -20px 20px;padding:14px 20px 12px;background:rgba(20,20,20,.96);backdrop-filter:blur(12px);border-bottom:1px solid #303030}.eps-nav{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}.eps-nav::-webkit-scrollbar{display:none}.eps-tab{flex:0 0 auto;min-width:126px;border:1px solid #363636;border-radius:10px;background:#1c1c1c;color:#d9d9d9;padding:10px 12px;text-align:left;cursor:pointer;transition:.18s ease}.eps-tab:hover{border-color:#5a3a37;background:#242020}.eps-tab.active{border-color:#a53c34;background:linear-gradient(180deg,#3a1f1d,#261918);color:#fff;box-shadow:0 0 0 1px rgba(239,73,59,.16) inset}.eps-tab strong{display:block;font-size:11px}.eps-tab small{display:block;margin-top:3px;color:#8f8f8f;font-size:8px;text-transform:uppercase;letter-spacing:.06em}.eps-tab.active small{color:#d99791}.eps-panel{max-width:1600px;margin:0 auto}.eps-placeholder{padding:26px;border:1px dashed #3a3a3a;border-radius:12px;background:#191919;color:#999}@media(max-width:700px){.eps-shell{padding:12px 12px 30px}.eps-nav-wrap{margin:-12px -12px 14px;padding:10px 12px}.eps-tab{min-width:112px;padding:9px 10px}}
    `}</style>

    <div className="eps-nav-wrap">
      <nav className="eps-nav" aria-label="Employee portal sections">
        {tabs.map(tab => <button key={tab.id} type="button" className={`eps-tab${active===tab.id?" active":""}`} onClick={()=>setActive(tab.id)}><strong>{tab.label}</strong><small>{tab.hint}</small></button>)}
      </nav>
    </div>

    <div className="eps-panel">
      {commandView && <EmployeeCommandCenter view={commandView} />}
      {active === "expenses" && <EmployeeExpenseCenter />}
      {active === "approvals" && isChairman && <ChairmanExpenseApproval />}
      {active === "certificates" && <EmployeeCertificateCenter />}
    </div>
  </main>;
}
