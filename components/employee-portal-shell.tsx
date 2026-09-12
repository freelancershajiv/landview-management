"use client";

import { useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";
import EmployeeCommandCenter, { type EmployeeCommandView } from "@/components/employee-command-center";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import EmployeeExpenseCenter from "@/components/employee-expense-center";
import EmployeeCertificateCenter from "@/components/employee-certificate-center";

type TabId = "dashboard" | "projects" | "workflow" | "records" | "expenses" | "approvals" | "certificates";

function text(value: unknown) { return String(value ?? "").trim(); }

function tabFromHash(hash: string): TabId {
  const value = String(hash || "").replace(/^#/, "").toLowerCase();
  if (value === "projects") return "projects";
  if (value === "workflow") return "workflow";
  if (["records", "visits", "documents", "attendance"].includes(value)) return "records";
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
      setIsChairman(id === "EMP-0001" || name.includes("jamal rony"));
    }).catch(() => setIsChairman(false));
  }, []);

  useEffect(() => {
    if (active === "approvals" && !isChairman) {
      window.location.hash = "dashboard";
    }
  }, [active, isChairman]);

  const commandView: EmployeeCommandView | null =
    active === "dashboard" || active === "projects" || active === "workflow" || active === "records" ? active : null;

  return <main className="employee-workspace-root">
    <style>{`
      .portal-employee .tmg-admin-main{width:100%!important;max-width:none!important}
      .portal-employee .tmg-content-wrap{width:100%!important;max-width:none!important;margin:0!important;padding:28px 32px 48px!important}
      .employee-workspace-root{width:100%;max-width:none;margin:0;padding:0;color:#f5f5f5}
      .employee-workspace-root>section,.employee-workspace-root>div{width:100%;max-width:none}
      .employee-workspace-root .ec-section{scroll-margin-top:110px}
      @media(max-width:1100px){.portal-employee .tmg-content-wrap{padding:22px 20px 40px!important}}
      @media(max-width:700px){.portal-employee .tmg-content-wrap{padding:16px 12px 32px!important}}
    `}</style>

    {commandView && <EmployeeCommandCenter view={commandView} />}
    {active === "expenses" && <EmployeeExpenseCenter />}
    {active === "approvals" && isChairman && <ChairmanExpenseApproval />}
    {active === "certificates" && <EmployeeCertificateCenter />}
  </main>;
}
