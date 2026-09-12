import EmployeeCommandCenter from "@/components/employee-command-center";
import EmployeeCertificateCenter from "@/components/employee-certificate-center";
import EmployeeExpenseCenter from "@/components/employee-expense-center";

export default function EmployeePortalPage() {
  return <><EmployeeCommandCenter /><EmployeeExpenseCenter /><EmployeeCertificateCenter /></>;
}
