import ErpModulePage from "@/components/erp-module-page";

export default function ApprovalsPage() {
  return <ErpModulePage module="approvals" eyebrow="DESIGN CONTROL" title="Approvals" description="Issue and track internal or client decisions for submitted drawings." idKey="Approval_ID"
    columns={["Approval_ID", "Project_ID", "Drawing_ID", "Approval_Type", "Requested_From", "Requested_At", "Status"]}
    fields={[
      { key: "Project_ID", label: "Project ID", required: true }, { key: "Drawing_ID", label: "Drawing ID", required: true },
      { key: "Approval_Type", label: "Approval type", type: "select", options: ["Internal Review", "Client Approval", "Authority Approval"], required: true },
      { key: "Requested_From", label: "Requested from", required: true }, { key: "Requested_At", label: "Request date", type: "date", required: true },
      { key: "Status", label: "Status", type: "select", options: ["Pending", "Approved", "Rejected", "Revision Required"], required: true },
      { key: "Decision_Notes", label: "Decision notes", type: "textarea" },
    ]} statusOptions={["Pending", "Approved", "Rejected", "Revision Required", "Cancelled"]} />;
}
