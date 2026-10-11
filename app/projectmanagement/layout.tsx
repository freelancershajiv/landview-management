"use client";

// @ts-nocheck
import { useEffect, useState } from "react";
import "./phase3-contractor.css";

export default function ProjectManagementLayout({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectId] = useState("");
  const [path, setPath] = useState("");

  useEffect(() => {
    setPath(window.location.pathname);
    setProjectId(new URLSearchParams(window.location.search).get("projectId") || "");
  }, []);

  const href = (target: string) => projectId ? `${target}?projectId=${encodeURIComponent(projectId)}` : target;
  const active = (target: string) => path === target || (target !== "/projectmanagement" && path.startsWith(target + "/"));

  return (
    <>
      <div className="pm-suite-nav-wrap">
        <nav className="pm-suite-nav" aria-label="Project Management workspace">
          <div className="pm-suite-brand"><span>LAND VIEW</span><strong>Project Management</strong><small>CONTROL SYSTEM</small></div>
          <div className="pm-suite-links">
            <a className={active("/projectmanagement/control") ? "active" : ""} href={href("/projectmanagement/control")}>Control Center</a>
            <a className={path === "/projectmanagement" ? "active" : ""} href={href("/projectmanagement")}>Finance</a>
            <a className={active("/projectmanagement/suppliers") ? "active" : ""} href={href("/projectmanagement/suppliers")}>Supplier Accounts</a>
            <a className={active("/projectmanagement/contractors") ? "active" : ""} href={href("/projectmanagement/contractors")}>Contractors & Progress</a>
            <a className={active("/projectmanagement/report") ? "active" : ""} href={href("/projectmanagement/report")}>Reports</a>
          </div>
        </nav>
      </div>
      {children}
      <style jsx>{`
        .pm-suite-nav-wrap{position:sticky;top:0;z-index:60;background:rgba(243,246,245,.94);backdrop-filter:blur(14px);border-bottom:1px solid #dfe7e4;padding:8px 18px}
        .pm-suite-nav{max-width:1540px;margin:0 auto;min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:18px}
        .pm-suite-brand{display:flex;align-items:baseline;gap:8px;white-space:nowrap}.pm-suite-brand span{font-size:9px;letter-spacing:.14em;font-weight:900;color:#1d6b52}.pm-suite-brand strong{font-size:13px;color:#1b2a31}.pm-suite-brand small{font-size:8px;letter-spacing:.1em;color:#8b9893;font-weight:850}
        .pm-suite-links{display:flex;align-items:center;gap:5px;overflow-x:auto}.pm-suite-links a{display:inline-flex;align-items:center;min-height:34px;padding:0 11px;border-radius:9px;text-decoration:none;color:#66757b;font-size:10px;font-weight:800;white-space:nowrap;border:1px solid transparent}.pm-suite-links a:hover{background:#fff;color:#285f4c;border-color:#dbe6e1}.pm-suite-links a.active{background:#1d6b52;color:#fff;box-shadow:0 5px 12px rgba(29,107,82,.15)}
        @media(max-width:720px){.pm-suite-nav-wrap{padding:7px 10px}.pm-suite-nav{align-items:flex-start;flex-direction:column;gap:6px}.pm-suite-brand small{display:none}.pm-suite-links{width:100%;padding-bottom:1px}}
      `}</style>
    </>
  );
}