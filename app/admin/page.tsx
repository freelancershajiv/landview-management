import { LVButtonLink } from "@/components/lv-controls";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import AdminCommandCenter from "@/components/admin-command-center-v3";
import { requirePortalSession } from "@/lib/server-auth";

function isEmp0001(user: Record<string, unknown>) {
  const candidates = [user.employeeId,user.Employee_ID,user["Employee ID"],user.userId,user.User_ID,user["User ID"],user.username,user.Username];
  return candidates.some((value) => String(value ?? "").trim().toUpperCase() === "EMP-0001");
}
function isAdmin(user: Record<string, unknown>) { return String(user.role || user.Role || "").trim().toLowerCase() === "admin"; }



export default async function DashboardPage() {
  const { user } = await requirePortalSession(["admin", "manager", "employee"]);
  const record = user as Record<string, unknown>;
  const chairman = isEmp0001(record);
  const admin = isAdmin(record);
  const management = admin || String(record.role || record.Role || "").trim().toLowerCase() === "manager";

  return <>
    {management && <div className="lv-ui-actions lv-admin-shortcuts">
      <LVButtonLink href="/admin/action-center" variant="soft" className="lv-ui-shortcut">Action Center</LVButtonLink>
      <LVButtonLink href="/admin/management-analytics" variant="soft" className="lv-ui-shortcut">Operations Scorecard</LVButtonLink>
      <LVButtonLink href="/admin/website" variant="soft" className="lv-ui-shortcut"><span aria-hidden="true">⌁</span>Website Content</LVButtonLink>
      {admin && <LVButtonLink href="/admin/system-control" variant="soft" className="lv-ui-shortcut"><span aria-hidden="true">⚙</span>System Control</LVButtonLink>}
    </div>}
    <AdminCommandCenter />
    {chairman && <ChairmanExpenseApproval />}
  </>;
}
