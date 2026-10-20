"use client";

import AdminCommandCenterV2 from "@/components/admin-command-center-v2";
import AdminDashboardPriorityPanel from "@/components/admin-dashboard-priority-panel";

export default function AdminCommandCenterV3() {
  return (
    <>
      <AdminCommandCenterV2 />
      <AdminDashboardPriorityPanel />
    </>
  );
}
