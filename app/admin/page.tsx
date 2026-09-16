import Link from "next/link";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import ManagementDashboardV2 from "@/components/management-dashboard-v2";
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
    {role === "admin" && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,margin:"0 0 18px",padding:"14px 16px",border:"1px solid #29343d",borderRadius:14,background:"#101820",color:"#eef2f5"}}>
      <div><small style={{display:"block",color:"#f08078",fontWeight:900,letterSpacing:".12em",marginBottom:3}}>WEBSITE INTELLIGENCE</small><strong>Visitor analytics is available in the admin workspace.</strong></div>
      <Link href="/admin/website-analytics" style={{whiteSpace:"nowrap",padding:"10px 14px",borderRadius:9,background:"#ff8179",color:"#17110f",fontWeight:900,textDecoration:"none"}}>Open Website Analytics →</Link>
    </div>}
    <ManagementDashboardV2/>
  </>;
}
