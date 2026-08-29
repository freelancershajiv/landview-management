import ErpModulePage from "@/components/erp-module-page";

export default function TasksPage() {
  return <ErpModulePage module="tasks" eyebrow="OPERATIONS" title="Tasks" description="Assign and track architectural, structural, electrical, and site work." idKey="Task_ID"
    columns={["Task_ID", "Task_Title", "Project_ID", "Assigned_Employee_ID", "Priority", "Due_Date", "Status"]}
    fields={[
      { key: "Task_Title", label: "Task title", required: true }, { key: "Project_ID", label: "Project ID", required: true },
      { key: "Assigned_Employee_ID", label: "Employee ID", required: true }, { key: "Priority", label: "Priority", type: "select", options: ["Low", "Normal", "High", "Urgent"], required: true },
      { key: "Start_Date", label: "Start date", type: "date" }, { key: "Due_Date", label: "Due date", type: "date", required: true },
      { key: "Status", label: "Status", type: "select", options: ["Draft", "Pending", "In Progress", "Blocked", "Completed"], required: true },
      { key: "Description", label: "Description", type: "textarea" },
    ]} statusOptions={["Draft", "Pending", "In Progress", "Blocked", "Completed", "Cancelled"]} />;
}
