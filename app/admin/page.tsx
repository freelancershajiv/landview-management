import Link from "next/link";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import AdminCommandCenter from "@/components/admin-command-center";
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
  const chairman = isEmp0001(user as Record<string, unknown>);
  return <>
    {chairman && <ChairmanExpenseApproval/>}
    <AdminCommandCenter/>
  </>;
}
