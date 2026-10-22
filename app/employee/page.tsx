import EmployeeSiteVisitAssignments from "@/components/employee-site-visit-assignments";
import EmployeeTaskCenter from "@/components/employee-task-center";
import EmployeePortalShell from "@/components/employee-portal-shell";

export default function EmployeePortalPage(){
  return <>
    <EmployeeSiteVisitAssignments />
    <EmployeeTaskCenter />
    <EmployeePortalShell />
  </>;
}
