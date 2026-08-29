import ErpModulePage from "@/components/erp-module-page";

export default function QuotationsPage() {
  return <ErpModulePage module="quotations" eyebrow="SALES" title="Quotations" description="Track proposed consultancy fees before projects move into billing." idKey="Quotation_ID"
    columns={["Quotation_ID", "Client_ID", "Project_ID", "Quotation_Date", "Valid_Until", "Amount", "Status"]}
    fields={[
      { key: "Client_ID", label: "Client ID", required: true }, { key: "Project_ID", label: "Project ID" },
      { key: "Quotation_Date", label: "Quotation date", type: "date", required: true }, { key: "Valid_Until", label: "Valid until", type: "date" },
      { key: "Amount", label: "Amount (BDT)", type: "number", required: true }, { key: "Status", label: "Status", type: "select", options: ["Draft", "Sent", "Accepted", "Rejected", "Expired"], required: true },
      { key: "Description", label: "Scope description", type: "textarea", required: true }, { key: "Notes", label: "Notes", type: "textarea" },
    ]} statusOptions={["Draft", "Sent", "Accepted", "Rejected", "Expired"]} />;
}
