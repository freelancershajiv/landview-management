import type { ReactNode } from "react";
import AdminEmployeeLocationCheck from "@/components/admin-employee-location-check";

export default function EmployeesLayout({ children }: { children: ReactNode }) {
  return <>
    <AdminEmployeeLocationCheck />
    {children}
  </>;
}
