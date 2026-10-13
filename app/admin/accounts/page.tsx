import AccountsBankStatementPage from "@/components/accounts-bank-statement-page";
import AccountsInlineEntryBridge from "@/components/accounts-inline-entry-bridge";
import AccountsCanonicalBalanceBridge from "@/components/accounts-canonical-balance-bridge";
import LedgerOrderEnhancer from "@/components/ledger-order-enhancer";

export default function AccountsPage() {
  return (
    <>
      <AccountsBankStatementPage />
      <AccountsInlineEntryBridge />
      <AccountsCanonicalBalanceBridge />
      <LedgerOrderEnhancer />
    </>
  );
}
