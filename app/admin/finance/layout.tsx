import FinanceDiscountAction from "@/components/finance-discount-action";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <>
    <FinanceDiscountAction />
    {children}
  </>;
}
