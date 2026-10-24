import Link from "next/link";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import AdminCommandCenter from "@/components/admin-command-center-v3";
import { requirePortalSession } from "@/lib/server-auth";

function isEmp0001(user: Record<string, unknown>) {
  const candidates = [user.employeeId,user.Employee_ID,user["Employee ID"],user.userId,user.User_ID,user["User ID"],user.username,user.Username];
  return candidates.some((value) => String(value ?? "").trim().toUpperCase() === "EMP-0001");
}
function isAdmin(user: Record<string, unknown>) { return String(user.role || user.Role || "").trim().toLowerCase() === "admin"; }

const shortcutStyle = {
  display: "inline-flex", alignItems: "center", gap: 8, minHeight: 38, padding: "0 13px",
  border: "1px solid var(--lv-brand-border)", borderRadius: 8, background: "var(--lv-brand-soft)",
  color: "var(--lv-brand-text)", fontSize: 11, fontWeight: 900, textDecoration: "none",
} as const;

export default async function DashboardPage() {
  const { user } = await requirePortalSession(["admin", "manager", "employee"]);
  const record = user as Record<string, unknown>;
  const chairman = isEmp0001(record);
  const admin = isAdmin(record);
  const manager = String(record.role || record.Role || "").trim().toLowerCase() === "manager";
  const management = admin || manager;

  return <>
    {management && <div style={{ display:"flex", justifyContent:"flex-end", gap:8, flexWrap:"wrap", marginBottom:12 }}>
      <Link href="/admin/website" style={shortcutStyle}><span aria-hidden="true">⌁</span>Website Content</Link>
      {admin
        ? <Link href="/admin/system-control" style={shortcutStyle}><span aria-hidden="true">⚙</span>System Control</Link>
        : <Link href="/account" style={shortcutStyle}><span aria-hidden="true">⚿</span>My Account</Link>}
    </div>}
    <AdminCommandCenter />
    {chairman && <ChairmanExpenseApproval />}
  </>;
}
