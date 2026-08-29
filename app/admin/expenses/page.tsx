import ErpModulePage from "@/components/erp-module-page";

export default function ExpensesPage() {
  return <ErpModulePage module="expenses" eyebrow="ACCOUNTS" title="Expenses" description="Record project and office expenses alongside LAND VIEW billing." idKey="Expense_ID"
    columns={["Expense_ID", "Expense_Date", "Project_ID", "Category", "Description", "Amount", "Status"]}
    fields={[
      { key: "Expense_Date", label: "Expense date", type: "date", required: true }, { key: "Project_ID", label: "Project ID" },
      { key: "Category", label: "Category", type: "select", options: ["Office", "Site", "Travel", "Printing", "Utility", "Salary", "Other"], required: true },
      { key: "Amount", label: "Amount (BDT)", type: "number", required: true }, { key: "Payment_Method", label: "Payment method", type: "select", options: ["Cash", "Bank", "Mobile Banking", "Card"] },
      { key: "Reference", label: "Reference" }, { key: "Status", label: "Status", type: "select", options: ["Draft", "Approved", "Paid"], required: true },
      { key: "Description", label: "Description", type: "textarea", required: true },
    ]} statusOptions={["Draft", "Pending", "Approved", "Paid", "Rejected"]} />;
}
