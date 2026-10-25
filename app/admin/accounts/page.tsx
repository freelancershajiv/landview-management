import AccountsEffectiveLedgerWrapper from "@/components/accounts-effective-ledger-wrapper";
import AccountsCanonicalBalanceBridge from "@/components/accounts-canonical-balance-bridge";
import AccountsInlineEntryBridge from "@/components/accounts-inline-entry-bridge";
import AccountsBillingControlStrip from "@/components/accounts-billing-control-strip";
import LedgerOrderEnhancer from "@/components/ledger-order-enhancer";

export default function AccountsPage() {
  return (
    <>
      <AccountsBillingControlStrip />
      <AccountsEffectiveLedgerWrapper />
      <AccountsInlineEntryBridge />
      <LedgerOrderEnhancer />
      <AccountsCanonicalBalanceBridge />
    </>
  );
}
