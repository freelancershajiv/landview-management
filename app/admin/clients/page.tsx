import ErpModulePage from "@/components/erp-module-page";

export default function ClientsPage() {
  return <ErpModulePage module="clients" eyebrow="CRM" title="Clients" description="Manage client contacts, status, and the relationship behind every LAND VIEW project." idKey="Client_ID"
    columns={["Client_ID", "Client_Name", "Phone_Number", "Client_Type", "Status"]}
    fields={[
      { key: "Client_Name", label: "Client name", required: true }, { key: "Phone_Number", label: "Phone number", required: true },
      { key: "Email", label: "Email", type: "text" }, { key: "Address", label: "Address" },
      { key: "Client_Type", label: "Client type", type: "select", options: ["Individual", "Company", "Developer", "Government"] },
      { key: "Status", label: "Status", type: "select", options: ["Lead", "Active", "Inactive"], required: true },
      { key: "Notes", label: "Notes", type: "textarea" },
    ]} statusOptions={["Lead", "Active", "Inactive"]} />;
}
