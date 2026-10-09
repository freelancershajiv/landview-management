import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import AdminBalanceOverview from "@/components/admin-balance-overview";
import AdminCommandCenter from "@/components/admin-command-center";
import AdminSystemHealth from "@/components/admin-system-health";
import NewSiteDashboardCard from "@/components/new-site-dashboard-card";
import { requirePortalSession } from "@/lib/server-auth";

function isEmp0001(user: Record<string, unknown>) {
  const candidates = [
    user.employeeId,
    user.Employee_ID,
    user["Employee ID"],
    user.userId,
    user.User_ID,
    user["User ID"],
    user.username,
    user.Username,
  ];
  return candidates.some((value) => String(value ?? "").trim().toUpperCase() === "EMP-0001");
}

export default async function DashboardPage(){
  const { role, user } = await requirePortalSession(["admin", "manager", "accounts", "employee"]);
  const workspaceRole = String(role || "").toLowerCase();
  const chairman = isEmp0001(user as Record<string, unknown>);
  const financeRole = ["admin", "manager", "accounts"].includes(workspaceRole);
  const canSiteEntry = workspaceRole === "admin" || workspaceRole === "manager";
  return <>
    {canSiteEntry && <NewSiteDashboardCard mode="management"/>}
    {chairman && <ChairmanExpenseApproval/>}
    {financeRole && <AdminBalanceOverview/>}
    {canSiteEntry && <AdminSystemHealth/>}
    <AdminCommandCenter/>
  </>;
}
