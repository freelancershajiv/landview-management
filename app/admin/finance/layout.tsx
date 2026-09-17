import FinanceDiscountAction from "@/components/finance-discount-action";
import "./invoices/invoice-revamp-print-fix.css";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <>
    <FinanceDiscountAction />
    {children}
  </>;
}
