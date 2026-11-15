import BillingLocationTagCleaner from "@/components/billing-location-tag-cleaner";
import BillingNavigation from "@/components/billing-navigation";
import "./invoices/invoice-revamp-print-fix.css";
import "./invoices/invoice-column-alignment-fix.css";
import "./billing-v4-accessibility.css";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <>
    <BillingLocationTagCleaner />
    <BillingNavigation />
    {children}
  </>;
}
