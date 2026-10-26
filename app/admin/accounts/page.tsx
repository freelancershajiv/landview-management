import AccountsEffectiveLedgerWrapper from "@/components/accounts-effective-ledger-wrapper";
import AccountsCanonicalBalanceBridge from "@/components/accounts-canonical-balance-bridge";
import AccountsInlineEntryBridge from "@/components/accounts-inline-entry-bridge";
import AccountsDashboardPolish from "@/components/accounts-dashboard-polish";
import LedgerOrderEnhancer from "@/components/ledger-order-enhancer";

export default function AccountsPage() {
  return (
    <>
      <AccountsDashboardPolish />
      <AccountsEffectiveLedgerWrapper />
      <AccountsInlineEntryBridge />
      <LedgerOrderEnhancer />
      <AccountsCanonicalBalanceBridge />
    </>
  );
}
