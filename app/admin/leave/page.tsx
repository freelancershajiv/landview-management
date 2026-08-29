import ErpModulePage from "@/components/erp-module-page";

export default function LeavePage() {
  return <ErpModulePage module="leave" eyebrow="WORKFORCE" title="Leave Requests" description="Review employee leave periods and maintain an auditable decision record." idKey="Leave_ID"
    columns={["Leave_ID", "Employee_ID", "Leave_Type", "Start_Date", "End_Date", "Status"]}
    fields={[
      { key: "Employee_ID", label: "Employee ID", required: true }, { key: "Leave_Type", label: "Leave type", type: "select", options: ["Casual", "Sick", "Annual", "Unpaid"], required: true },
      { key: "Start_Date", label: "Start date", type: "date", required: true }, { key: "End_Date", label: "End date", type: "date", required: true },
      { key: "Status", label: "Status", type: "select", options: ["Pending", "Approved", "Rejected"], required: true }, { key: "Reason", label: "Reason", type: "textarea", required: true },
    ]} statusOptions={["Pending", "Approved", "Rejected", "Cancelled"]} />;
}
