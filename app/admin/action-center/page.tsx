import Link from "next/link";
import AdminTaskResponsibilityCenter from "@/components/admin-task-responsibility-center";
import AdminActionCenter from "@/components/admin-action-center";
import { requirePortalCapability } from "@/lib/server-auth";

const QUICK_LINKS = [
  { href: "/admin/projects", label: "Projects", detail: "Open project records" },
  { href: "/admin/project-operations/by-project", label: "By Project", detail: "Service delivery control" },
  { href: "/admin/lifecycle", label: "Lifecycle", detail: "Stage and deadline view" },
  { href: "/admin/site-visits", label: "Site Visits", detail: "Field activity" },
  { href: "/admin/finance", label: "Billing", detail: "Payments and dues" },
  { href: "/admin/registers", label: "Documents", detail: "Document delivery" },
];

export default async function ActionCenterPage() {
  await requirePortalCapability("systemHealth.view");

  return (
    <div className="action-center-v2" style={{ paddingBottom: 36 }}>
      <style>{`
        .action-center-v2{display:grid;gap:14px}.acv2-hero{border:1px solid var(--lv-border-default);border-radius:16px;background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-surface-muted));padding:20px;box-shadow:var(--lv-shadow-sm)}
        .acv2-kicker{display:block;color:var(--lv-brand-text);font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.acv2-hero h1{margin:6px 0 6px;color:var(--lv-text-strong);font-size:28px;letter-spacing:-.03em}.acv2-hero p{margin:0;max-width:820px;color:var(--lv-text-secondary);font-size:10px;line-height:1.65}.acv2-links{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:16px}.acv2-link{min-width:0;padding:11px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none}.acv2-link strong{display:block;font-size:9px}.acv2-link span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:7px}.acv2-link:hover{border-color:var(--lv-brand-text);color:var(--lv-brand-text)}
        @media(max-width:1050px){.acv2-links{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.acv2-hero{padding:15px}.acv2-hero h1{font-size:23px}.acv2-links{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <section className="acv2-hero">
        <span className="acv2-kicker">LAND VIEW / OPERATIONS CONTROL</span>
        <h1>Action Center</h1>
        <p>One management queue for project responsibilities, deadlines, blockers, finance exceptions, delivery issues and system conditions. Work the overdue and critical items first, assign an owner, then close the item from the same workspace.</p>
        <div className="acv2-links">
          {QUICK_LINKS.map((item) => <Link className="acv2-link" href={item.href} key={item.href}><strong>{item.label}</strong><span>{item.detail}</span></Link>)}
        </div>
      </section>

      <AdminTaskResponsibilityCenter />
      <AdminActionCenter />
    </div>
  );
}
