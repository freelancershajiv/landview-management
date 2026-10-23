import Link from "next/link";
import ChairmanExpenseApproval from "@/components/chairman-expense-approval";
import AdminCommandCenter from "@/components/admin-command-center-v3";
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

function isAdmin(user: Record<string, unknown>) {
  return String(user.role || user.Role || "").trim().toLowerCase() === "admin";
}

export default async function DashboardPage() {
  const { user } = await requirePortalSession(["admin", "manager", "employee"]);
  const record = user as Record<string, unknown>;
  const chairman = isEmp0001(record);
  const admin = isAdmin(record);

  return (
    <>
      {admin && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Link
            href="/admin/system-control"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 38,
              padding: "0 13px",
              border: "1px solid var(--lv-brand-border)",
              borderRadius: 8,
              background: "var(--lv-brand-soft)",
              color: "var(--lv-brand-text)",
              fontSize: 11,
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            <span aria-hidden="true">⚙</span>
            System Control
          </Link>
        </div>
      )}
      <AdminCommandCenter />
      {chairman && <ChairmanExpenseApproval />}
    </>
  );
}
