"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const modules = [
  { href: "/projectmanagement", label: "Overview", icon: "⌂", note: "Project fund position" },
  { href: "/projectmanagement/income", label: "Cash In", icon: "↗", note: "Deposits & receipts" },
  { href: "/projectmanagement/expenses", label: "Expenses", icon: "↙", note: "Project cash out" },
  { href: "/projectmanagement/ledger", label: "Ledger", icon: "≡", note: "Complete transaction history" },
  { href: "/projectmanagement/parties", label: "Parties", icon: "♙", note: "Suppliers & contractors" },
  { href: "/projectmanagement/sattapur", label: "Sattapur", icon: "▦", note: "Brick deposit & delivery" },
  { href: "/projectmanagement/reports", label: "Reports", icon: "▤", note: "Monthly finance reports" },
  { href: "/projectmanagement/bills", label: "Bills", icon: "৳", note: "Contracts & billing" },
] as const;

function cleanPath(value: string) {
  const path = String(value || "").replace(/\/+$/, "");
  return path || "/";
}

export default function ProjectFinanceAdminModule() {
  const pathname = cleanPath(usePathname());
  const params = useSearchParams();
  const projectId = String(params.get("projectId") || "").trim();
  const withProject = (href: string) => projectId ? `${href}?projectId=${encodeURIComponent(projectId)}` : href;
  const projectLabel = projectId || "Select project";

  return (
    <section className="pf-admin-module" aria-label="Project Finance navigation">
      <div className="pf-admin-module-head">
        <div>
          <span className="pf-admin-eyebrow">PROJECT MANAGEMENT · FINANCE</span>
          <h1>Project Finance</h1>
          <p>Control project cash, expenses, suppliers, contractor bills and reporting from the LAND VIEW management workspace.</p>
        </div>
        <div className="pf-admin-project-chip">
          <small>ACTIVE PROJECT</small>
          <strong>{projectLabel}</strong>
        </div>
      </div>

      <div className="pf-admin-module-grid">
        {modules.map((item) => {
          const active = item.href === "/projectmanagement"
            ? pathname === "/projectmanagement"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={withProject(item.href)}
              className={`pf-admin-module-card${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="pf-admin-module-icon" aria-hidden="true">{item.icon}</span>
              <span className="pf-admin-module-copy">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </span>
              <span className="pf-admin-module-arrow" aria-hidden="true">→</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
