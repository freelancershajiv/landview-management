import ErpModulePage from "@/components/erp-module-page";

export default function DrawingsPage() {
  return <ErpModulePage module="drawings" eyebrow="DESIGN CONTROL" title="Drawings & Approvals" description="Control drawing submissions, revisions, Drive links, and approval status." idKey="Drawing_ID"
    columns={["Drawing_ID", "Drawing_Title", "Project_ID", "Discipline", "Revision", "Assigned_Employee_ID", "Status"]}
    fields={[
      { key: "Drawing_Title", label: "Drawing title", required: true }, { key: "Project_ID", label: "Project ID", required: true },
      { key: "Discipline", label: "Discipline", type: "select", options: ["Architectural", "Structural", "Electrical", "Plumbing", "Fire Safety"], required: true },
      { key: "Revision", label: "Revision", required: true }, { key: "Assigned_Employee_ID", label: "Employee ID" },
      { key: "Drive_URL", label: "Google Drive file URL", type: "url" },
      { key: "Status", label: "Status", type: "select", options: ["Draft", "Submitted", "Under Review", "Approved", "Revision Required"], required: true },
      { key: "Comments", label: "Comments", type: "textarea" },
    ]} statusOptions={["Draft", "Submitted", "Under Review", "Approved", "Revision Required", "Superseded"]} />;
}
