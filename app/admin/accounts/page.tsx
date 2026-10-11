import AccountsBankStatementPage from "@/components/accounts-bank-statement-page";
import AccountsInlineEntryBridge from "@/components/accounts-inline-entry-bridge";
import LedgerOrderEnhancer from "@/components/ledger-order-enhancer";
import PreCutoffLedgerReference from "@/components/pre-cutoff-ledger-reference";

export default function AccountsPage() {
  return (
    <>
      <AccountsBankStatementPage />
      <PreCutoffLedgerReference />
      <AccountsInlineEntryBridge />
      <LedgerOrderEnhancer />
    </>
  );
}
