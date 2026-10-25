import type { ReactNode } from "react";
import BillingLifecyclePanel from "./billing-lifecycle-panel";

export default function ClientBillingProjectLayout({ children }: { children: ReactNode }) {
  return <>{children}<BillingLifecyclePanel /></>;
}
