import ErpModulePage from "@/components/erp-module-page";

export default function AttendancePage() {
  return <ErpModulePage module="attendance" eyebrow="WORKFORCE" title="Attendance" description="Maintain daily employee attendance, working hours, and exceptions." idKey="Attendance_ID"
    columns={["Attendance_ID", "Employee_ID", "Attendance_Date", "Check_In", "Check_Out", "Work_Hours", "Status"]}
    fields={[
      { key: "Employee_ID", label: "Employee ID", required: true }, { key: "Attendance_Date", label: "Date", type: "date", required: true },
      { key: "Check_In", label: "Check in", type: "time" }, { key: "Check_Out", label: "Check out", type: "time" },
      { key: "Work_Hours", label: "Work hours", type: "number" }, { key: "Status", label: "Status", type: "select", options: ["Present", "Absent", "Late", "Leave"], required: true },
      { key: "Notes", label: "Notes", type: "textarea" },
    ]} statusOptions={["Present", "Absent", "Late", "Leave"]} />;
}
